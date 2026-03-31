"""PDF to image conversion and image preprocessing service."""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Generator, Tuple

import cv2
import numpy as np
from pdf2image import convert_from_path
from PIL import Image

from config import settings
from models.settings import PreprocessingOptions

logger = logging.getLogger(__name__)


class PDFService:
    """Converts PDF pages to PNG images with optional preprocessing."""

    def split_pdf(
        self,
        pdf_path: Path,
        output_dir: Path,
        chunk_size: int = 200,
    ) -> List[Tuple[str, Path]]:
        """
        Split a PDF into chunks of chunk_size pages.
        
        Returns:
            List of (filename, absolute_path) for the split files.
        """
        from pypdf import PdfReader, PdfWriter
        
        logger.info("Splitting PDF '%s' into chunks of %d", pdf_path.name, chunk_size)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        reader = PdfReader(str(pdf_path))
        total_pages = len(reader.pages)
        base_name = pdf_path.stem # Filename without extension
        
        results = []
        for start in range(0, total_pages, chunk_size):
            end = min(start + chunk_size, total_pages)
            writer = PdfWriter()
            
            for page_num in range(start, end):
                writer.add_page(reader.pages[page_num])
            
            # Format: Original_1_to_200.pdf
            # User example: "방제학-상_1_to_200.pdf", "401_to_.pdf" (for the last)
            # If it's the last chunk and incomplete? 
            # Request says "401_to_.pdf" for the last one in the example.
            is_last = (end == total_pages)
            if is_last and start + 1 != total_pages:
                 chunk_filename = f"{base_name}_{start+1}_to_.pdf"
            else:
                 chunk_filename = f"{base_name}_{start+1}_to_{end}.pdf"
            
            output_path = output_dir / chunk_filename
            with open(output_path, "wb") as f:
                writer.write(f)
            
            results.append((chunk_filename, output_path))
            logger.info("Created split: %s", chunk_filename)
        
        return results

    def convert_pdf_to_images(
        self,
        pdf_path: Path,
        output_dir: Path,
        dpi: int = 300,
        preprocessing: PreprocessingOptions | None = None,
    ) -> int:
        """
        Convert each page of the PDF to a PNG image and save to output_dir.

        Args:
            pdf_path: Path to the input PDF file.
            output_dir: Directory where page PNGs will be saved.
            dpi: Resolution for rendering (higher = better quality).
            preprocessing: Optional preprocessing options.

        Returns:
            Total number of pages converted.
        """
        if preprocessing is None:
            preprocessing = PreprocessingOptions()

        logger.info("Converting PDF '%s' at %d DPI", pdf_path.name, dpi)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Convert PDF pages to PIL Images (one at a time to save memory)
        pages = convert_from_path(str(pdf_path), dpi=dpi, fmt="png", thread_count=1)
        total = len(pages)
        logger.info("PDF has %d pages", total)

        for i, pil_img in enumerate(pages, start=1):
            out_path = output_dir / f"page_{i:04d}.png"
            processed = self._preprocess(pil_img, preprocessing)
            processed.save(str(out_path), format="PNG")
            logger.debug("Saved page %d → %s", i, out_path)
            # Release memory
            del pil_img, processed

        return total

    def _preprocess(self, pil_img: Image.Image, opts: PreprocessingOptions) -> Image.Image:
        """Apply the configured preprocessing steps to a PIL Image.

        Args:
            pil_img: Source page image.
            opts: Preprocessing toggle settings.

        Returns:
            Preprocessed PIL Image (RGB or grayscale).
        """
        if not any([opts.grayscale, opts.binarization, opts.denoise, opts.deskew]):
            return pil_img

        img = np.array(pil_img.convert("RGB"))
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        # 1. Grayscale
        if opts.grayscale or opts.binarization:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Denoise (before binarization for better results)
        if opts.denoise:
            if len(img.shape) == 2:
                img = cv2.GaussianBlur(img, (3, 3), 0)
            else:
                img = cv2.GaussianBlur(img, (3, 3), 0)

        # 3. Binarization (Otsu threshold)
        if opts.binarization:
            if len(img.shape) != 2:
                img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, img = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 4. Deskew
        if opts.deskew:
            img = self._deskew(img)

        # Convert back to PIL for saving
        if len(img.shape) == 2:
            return Image.fromarray(img, mode="L").convert("RGB")
        return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

    def _deskew(self, img: np.ndarray) -> np.ndarray:
        """Correct skew in a grayscale or binary image.

        Uses the Hough line transform to estimate the dominant angle
        and rotates the image to compensate.
        """
        # Ensure grayscale
        gray = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Edge detection
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

        if lines is None:
            return img

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 - x1 != 0:
                angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
                if abs(angle) < 45:
                    angles.append(angle)

        if not angles:
            return img

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return img

        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        logger.debug("Deskewed image by %.2f degrees", median_angle)
        return rotated

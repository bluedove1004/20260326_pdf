"""PDF to image conversion and image preprocessing service."""

from __future__ import annotations

import logging
import math
import gc
import tempfile
import os
from pathlib import Path
from typing import Generator, Tuple, List, Optional

import cv2
import numpy as np
from pdf2image import convert_from_path, pdfinfo_from_path
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
        No-op/Placeholder for potential chunked extraction if needed.
        Currently using disk-streamed single extraction for stability.
        """
        # (Legacy placeholder, not used in core pipeline right now)
        return [("full", pdf_path)]

    def convert_to_images(
        self,
        pdf_path: Path,
        output_dir: Path,
        dpi: int = 300,
        preprocessing: Optional[PreprocessingOptions] = None,
    ) -> int:
        """
        Convert each page of the PDF to a PNG image and save to output_dir.
        Optimized to stay under 900MB by using disk-based buffering.

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

        logger.info("Converting PDF '%s' at %d DPI using disk-based processing", pdf_path.name, dpi)
        output_dir.mkdir(parents=True, exist_ok=True)

        # 1. Get total page count first
        info = pdfinfo_from_path(str(pdf_path))
        total_pages = info["Pages"]
        logger.info("PDF has %d pages", total_pages)

        # 2. Use a temporary directory for per-page conversion to save memory
        with tempfile.TemporaryDirectory() as tmp_dir:
            logger.debug("Using temp directory for conversion: %s", tmp_dir)
            
            # Use convert_from_path with output_folder to write directly to disk
            # This prevents loading all PIL Images into RAM at once
            convert_from_path(
                str(pdf_path),
                dpi=dpi,
                fmt="png",
                output_folder=tmp_dir,
                thread_count=1,
                output_file="temp_page"
            )
            
            # 3. Process the generated files one by one and clean up
            # pdf2image saves files as temp_pageXXXX-XX.png or similar
            temp_files = sorted([f for f in os.listdir(tmp_dir) if f.startswith("temp_page")])
            
            for i, filename in enumerate(temp_files, start=1):
                temp_path = os.path.join(tmp_dir, filename)
                out_path = output_dir / f"page_{i:04d}.png"
                
                with Image.open(temp_path) as pil_img:
                    processed = self._preprocess(pil_img, preprocessing)
                    processed.save(str(out_path), format="PNG")
                    logger.debug("Processed and saved page %d -> %s", i, out_path)
                    
                    # Force closure to free handles
                    if hasattr(processed, 'close'):
                        processed.close()
                    del processed
                
                # Garbage collection every few pages to maintain low memory profile (target < 900MB)
                if i % 3 == 0:
                    gc.collect()

        return total_pages

    def _preprocess(self, pil_img: Image.Image, opts: PreprocessingOptions) -> Image.Image:
        """Apply the configured preprocessing steps to a PIL Image.

        Args:
            pil_img: Source page image.
            opts: Preprocessing toggle settings.

        Returns:
            Preprocessed PIL Image (RGB or grayscale).
        """
        img = np.array(pil_img.convert("RGB"))

        # Grayscale conversion
        if opts.grayscale:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            # Denoising
            if opts.denoise:
                img = cv2.fastNlMeansDenoising(img, None, 10, 7, 21)
            # Thresholding (Binarization)
            if opts.binarization:
                img = cv2.adaptiveThreshold(
                    img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
                )
        else:
            # Color denoise
            if opts.denoise:
                img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

        return Image.fromarray(img)

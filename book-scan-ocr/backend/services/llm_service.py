"""LLM service: ChatGPT (OpenAI) and Claude (Anthropic) vision-based text extraction."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from pathlib import Path
from typing import Optional, List, Union

from models.document import BBoxCoords, PageResult, TextBlock

logger = logging.getLogger(__name__)

class LLMService:
    """Service for extracting text from images using LLMs (GPT-4o, Claude 3.5/3.7)."""

    def __init__(self) -> None:
        pass

    def _image_to_base64(self, image_path: Path) -> str:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    async def process_page_with_openai(
        self, 
        image_path: Path, 
        api_key: str,
        page_number: int | str, 
        model: str = "gpt-4o"
    ) -> PageResult:
        """Extract text from image using OpenAI GPT-4o."""
        max_retries = 3
        retry_delay = 1.0  # seconds
        
        for attempt in range(max_retries):
            try:
                from openai import AsyncOpenAI
                from PIL import Image as PILImage
                
                client = AsyncOpenAI(api_key=api_key)
                
                # Get dimensions
                with PILImage.open(image_path) as img:
                    width, height = img.size
                    
                base64_image = self._image_to_base64(image_path)
                
                response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a specialized OCR engine. Your task is to extract EVERYTHING from the provided image. "
                                "STRICT RULE 1: Extract the actual PRINTED PAGE NUMBER and the MAIN HEADING/TITLE visible on this page. "
                                "STRICT RULE 2: Extract EVERY SINGLE WORD from the rest of the page, INCLUDING HEADERS AND FOOTERS. "
                                "STRICT RULE 3: Transcribe every character (including Korean and Hanja) exactly as it appears. "
                                "STRICT RULE 4: Output in the following format:\n"
                                "[PAGE_NUMBER]: (extracted number or 'n/a')\n"
                                "[PAGE_TITLE]: (extracted heading or 'n/a')\n"
                                "[TEXT]:\n(all extracted text content)\n"
                                "STRICT RULE 5: DO NOT repeat the page number or title content inside the [TEXT] block. Pure body text only."
                            )
                        },
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Extract all text from this image exactly as printed. Ensure high accuracy for Korean and Hanja. Do not skip or hallucinate."},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{base64_image}",
                                        "detail": "high"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=4096,
                )
                
                full_text = response.choices[0].message.content or ""
                return self._create_page_result(page_number, full_text, model, width, height)
                
            except Exception as e:
                is_retryable = any(msg in str(e).lower() for msg in ["rate_limit", "overloaded", "timeout", "529", "429"])
                if is_retryable and attempt < max_retries - 1:
                    logger.warning("OpenAI API attempt %d failed (retryable): %s. Retrying in %.1fs...", attempt + 1, e, retry_delay)
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                
                logger.error("OpenAI OCR failed on page %s after %d attempts: %s", page_number, attempt + 1, e)
                return PageResult(
                    page_number=page_number, seq_number=page_number, width=0, height=0,
                    status="failed", error=str(e),
                )

    async def process_page_with_anthropic(
        self, 
        image_path: Path, 
        api_key: str,
        page_number: int | str, 
        model: str = "claude-sonnet-4-6"
    ) -> PageResult:
        """Extract text from image using Anthropic Claude 3.5/3.7."""
        max_retries = 3
        retry_delay = 1.0  # seconds

        for attempt in range(max_retries):
            try:
                from anthropic import AsyncAnthropic
                from PIL import Image as PILImage
                
                client = AsyncAnthropic(api_key=api_key)
                
                # Get dimensions
                with PILImage.open(image_path) as img:
                    width, height = img.size

                base64_image = self._image_to_base64(image_path)
                
                response = await client.messages.create(
                    model=model,
                    max_tokens=4096,
                    system=(
                        "You are a specialized OCR engine. Your task is to extract EVERYTHING from the provided image. "
                        "STRICT RULE 1: Extract the actual PRINTED PAGE NUMBER and the MAIN HEADING/TITLE visible on this page. "
                        "STRICT RULE 2: Extract EVERY SINGLE WORD from the rest of the page, INCLUDING HEADERS AND FOOTERS. "
                        "STRICT RULE 3: Transcribe every character (including Korean and Hanja) exactly as it appears. "
                        "STRICT RULE 4: Output in the following format:\n"
                        "[PAGE_NUMBER]: (extracted number or 'n/a')\n"
                        "[PAGE_TITLE]: (extracted heading or 'n/a')\n"
                        "[TEXT]:\n(all extracted text content)\n"
                        "STRICT RULE 5: DO NOT repeat the page number or title content inside the [TEXT] block. Pure body text only."
                    ),
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": base64_image,
                                    },
                                },
                                {"type": "text", "text": "Extract all text from this image exactly as printed. Ensure high accuracy for Korean and Hanja. Do not skip or hallucinate."}
                            ],
                        }
                    ],
                )
                
                # Content is a list of blocks
                full_text = ""
                for block in response.content:
                    if block.type == 'text':
                        full_text += block.text
                
                return self._create_page_result(page_number, full_text.strip(), model, width, height)
                
            except Exception as e:
                is_retryable = any(msg in str(e).lower() for msg in ["overloaded", "rate_limit", "timeout", "529", "429"])
                if is_retryable and attempt < max_retries - 1:
                    logger.warning("Anthropic API attempt %d failed (retryable): %s. Retrying in %.1fs...", attempt + 1, e, retry_delay)
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                
                logger.error("Anthropic OCR failed on page %s after %d attempts: %s", page_number, attempt + 1, e)
                return PageResult(
                    page_number=page_number, seq_number=page_number, width=0, height=0,
                    status="failed", error=str(e),
                )

    def _detect_page_number_from_text(self, lines: List[str], fallback: int | str) -> int | str:
        """Analyze the first/last few lines for a page number pattern."""
        if not lines:
            return fallback

        # Check first 2 and last 2 lines
        candidates = lines[:2] + lines[-2:]
        page_re = re.compile(r"^(?:(?:page|p\.)\s*)?([0-9ivx-]{1,6})(?:\s*[-])?$", re.I)

        for line in candidates:
            txt = line.strip()
            # If line is short and matches page number pattern
            if 0 < len(txt) <= 12:
                match = page_re.search(txt)
                if match:
                    val = match.group(1).strip()
                    if val:
                        return val
        
        return fallback

    def _create_page_result(self, page_number: int | str, response_text: str, model_name: str, width: int = 0, height: int = 0) -> PageResult:
        """Create a PageResult from LLM extracted text, parsing structured fields."""
        # Parse [PAGE_NUMBER], [PAGE_TITLE], and [TEXT]
        extracted_page = "n/a"
        extracted_title = None
        full_text = response_text
        
        if "[PAGE_NUMBER]:" in response_text or "[TEXT]:" in response_text:
            parts = re.split(r'\[(?:PAGE_NUMBER|PAGE_TITLE|TEXT)\]:', response_text)
            # Find labels to match parts
            labels = re.findall(r'\[(PAGE_NUMBER|PAGE_TITLE|TEXT)\]:', response_text)
            
            p_idx = 1
            for label in labels:
                if label == "PAGE_NUMBER" and p_idx < len(parts):
                    extracted_page = parts[p_idx].strip()
                elif label == "PAGE_TITLE" and p_idx < len(parts):
                    extracted_title = parts[p_idx].strip()
                    if extracted_title.lower() == "n/a": extracted_title = None
                elif label == "TEXT" and p_idx < len(parts):
                    full_text = parts[p_idx].strip()
                p_idx += 1

        lines = full_text.split('\n')
        clean_lines = [l.strip() for l in lines if l.strip()]
        
        # Post-process: Remove extracted page/title from head/tail of clean_lines if present
        if clean_lines:
            # Check first 2 lines
            for _ in range(min(2, len(clean_lines))):
                first_line = clean_lines[0].lower()
                if (extracted_page != "n/a" and extracted_page.lower() == first_line) or \
                   (extracted_title and extracted_title.lower() == first_line):
                    clean_lines.pop(0)
                else: break
            # Check last 2 lines
            for _ in range(min(2, len(clean_lines))):
                if not clean_lines: break
                last_line = clean_lines[-1].lower()
                if (extracted_page != "n/a" and extracted_page.lower() == last_line) or \
                   (extracted_title and extracted_title.lower() == last_line):
                    clean_lines.pop()
                else: break
        
        full_text = "\n".join(clean_lines)

        # If extraction failed, try fallback detection
        if extracted_page == "n/a":
            extracted_page = self._detect_page_number_from_text(clean_lines, "n/a")
        
        text_blocks = []
        for i, line in enumerate(clean_lines):
            text_blocks.append(TextBlock(
                block_id=i+1,
                text=line,
                confidence=1.0,
                bbox=BBoxCoords(
                    top_left=[0,0], top_right=[0,0], bottom_right=[0,0], bottom_left=[0,0]
                ),
                line_number=i+1
            ))
            
        return PageResult(
            page_number=str(extracted_page),
            page_title=extracted_title,
            seq_number=page_number,
            width=width,
            height=height,
            text_blocks=text_blocks,
            full_text=full_text,
            block_count=len(text_blocks),
            avg_confidence=1.0,
            status="completed" if text_blocks else "empty"
        )

"""LLM service: ChatGPT (OpenAI) and Claude (Anthropic) vision-based text extraction."""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Optional, List

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
        page_number: int, 
        api_key: str,
        model: str = "gpt-4o"
    ) -> PageResult:
        """Extract text from image using OpenAI GPT-4o."""
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
                        "content": "You are a specialized OCR engine. Extract all text from the provided image exactly as it appears. Maintain the reading order (typically top-to-bottom, left-to-right). Do not add any commentary. Output ONLY the extracted text."
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all text from this image."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}"
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
            logger.error("OpenAI OCR failed on page %d: %s", page_number, e)
            return PageResult(
                page_number=page_number, width=0, height=0,
                status="failed", error=str(e),
            )

    async def process_page_with_anthropic(
        self, 
        image_path: Path, 
        page_number: int, 
        api_key: str,
        model: str = "claude-3-5-sonnet-20241022"
    ) -> PageResult:
        """Extract text from image using Anthropic Claude 3.5/3.7."""
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
                system="You are a specialized OCR engine. Extract all text from the provided image exactly as it appears. Maintain the reading order. Output ONLY the extracted text.",
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
                            {"type": "text", "text": "Extract all text from this image."}
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
            logger.error("Anthropic OCR failed on page %d: %s", page_number, e)
            return PageResult(
                page_number=page_number, width=0, height=0,
                status="failed", error=str(e),
            )

    def _create_page_result(self, page_number: int, full_text: str, model_name: str, width: int = 0, height: int = 0) -> PageResult:
        """Create a PageResult from LLM extracted text. 
        Note: LLMs usually don't give precise bounding boxes for every word unless specifically prompted and parsed.
        For now, we just return the full text as one block or split by lines.
        """
        lines = full_text.split('\n')
        text_blocks = []
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            text_blocks.append(TextBlock(
                block_id=i+1,
                text=line.strip(),
                confidence=1.0, # LLM results don't give confidence scores in this way
                bbox=BBoxCoords(
                    top_left=[0,0], top_right=[0,0], bottom_right=[0,0], bottom_left=[0,0]
                ),
                line_number=i+1
            ))
            
        return PageResult(
            page_number=page_number,
            width=width,
            height=height,
            text_blocks=text_blocks,
            full_text=full_text,
            block_count=len(text_blocks),
            avg_confidence=1.0,
            status="completed" if text_blocks else "empty"
        )

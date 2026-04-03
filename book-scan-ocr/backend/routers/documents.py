"""Documents API router: upload, status, retrieval, and image endpoints."""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
from urllib.parse import quote
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from fastapi.responses import FileResponse, JSONResponse

from config import settings
from models.document import (
    DocumentListItem,
    DocumentMeta,
    DocumentResult,
    DocumentStatus,
    DocumentStatusResponse,
    PaginatedDocumentList,
)
from models.settings import PreprocessingOptions
from services.ocr_service import OCRService
from services.llm_service import LLMService
from services.storage_service import StorageService
from services.pdf_service import PDFService
from database import get_db, SessionLocal
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["documents"])

# Module-level service instances (injected at startup via app.state)
_storage = StorageService()
_pdf = PDFService()


def get_ocr_service(request: Request) -> OCRService:
    """Dependency: retrieve the app-level OCR service singleton."""
    return request.app.state.ocr_service

def get_llm_service(request: Request) -> LLMService:
    """Dependency: retrieve the app-level LLM service singleton."""
    return request.app.state.llm_service

class LLMExtractRequest(BaseModel):
    provider: str # 'chatgpt' or 'claude'
    api_key: str
    model: Optional[str] = None


# ----------------------------------------------
async def _run_ocr_pipeline(
    document_id: str,
    pdf_path: Path,
    filename: str,
    dpi: int,
    preprocessing: PreprocessingOptions,
    ocr_service: OCRService,
    llm_service: LLMService,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
) -> None:
    db = SessionLocal()
    try:
        meta = _storage.load_meta(db, document_id)
        if meta is None:
            logger.error("Meta not found for document %s - aborting pipeline", document_id)
            return

        start_time = time.time()
        images_dir = _storage._images_dir(document_id)

        # Step 1 - PDF -> images
        logger.info("[%s] Converting PDF to images (dpi=%d)", document_id, dpi)
        total_pages = _pdf.convert_pdf_to_images(pdf_path, images_dir, dpi=dpi, preprocessing=preprocessing)

        meta.total_pages = total_pages
        meta.status = DocumentStatus.processing
        _storage.save_meta(db, meta)

        # Step 2 - OCR each page
        page_results = []
        for page_num in range(1, total_pages + 1):
            img_path = images_dir / f"page_{page_num:04d}.png"
            page_result = ocr_service.process_page(img_path, page_num)
            
            # Set metadata
            page_result = page_result.model_copy(update={
                "extracted_at": datetime.now(timezone.utc),
                "extracted_by": "EasyOCR"
            })

            _storage.save_page_result(document_id, page_result.model_dump(mode='json'))
            page_results.append(page_result)

            # Update progress
            meta.processed_pages = page_num
            meta.progress_percent = round((page_num / total_pages) * 100, 1)
            # We don't save DB on every page to avoid overhead, maybe every 5 pages
            if page_num % 5 == 0 or page_num == total_pages:
                _storage.save_meta(db, meta)

        # Step 3 - Assemble full result
        elapsed = round(time.time() - start_time, 2)
        result = DocumentResult(
            document_id=document_id,
            filename=filename,
            total_pages=total_pages,
            created_at=meta.created_at,
            processing_time_seconds=elapsed,
            pages=page_results,
        )
        _storage.save_result(result)
        
        meta.status = DocumentStatus.completed
        meta.completed_at = datetime.now(tz=timezone.utc)
        _storage.save_meta(db, meta)
        logger.info("[%s] Completed in %.1fs", document_id, elapsed)

    except Exception as e:
        logger.exception("[%s] Pipeline failed: %s", document_id, e)
        # Reload meta to ensure we have a fresh copy
        meta = _storage.load_meta(db, document_id)
        if meta:
            meta.status = DocumentStatus.failed
            meta.error = str(e)
            _storage.save_meta(db, meta)
    finally:
        db.close()


# ----------------------------------------------
# Endpoints
# ----------------------------------------------


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    openai_api_key: Optional[str] = Form(None),
    anthropic_api_key: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Accept a PDF upload, persist it, and start OCR in the background.

    Returns: document_id, total_pages (0 until processing starts), status.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    document_id = str(uuid.uuid4())
    safe_name = Path(file.filename).name
    pdf_path = _storage.upload_path(document_id, safe_name)

    # Stream upload directly to disk (avoids loading large PDF into memory)
    _storage.create_document_dirs(document_id)
    file_size = 0
    async with aiofiles.open(pdf_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)  # 1 MB chunks
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > settings.max_file_size_bytes:
                await f.close()
                pdf_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB",
                )
            await f.write(chunk)

    # Create initial metadata
    meta = DocumentMeta(
        document_id=document_id,
        filename=safe_name,
        total_pages=0,
        status=DocumentStatus.pending,
        created_at=datetime.now(tz=timezone.utc),
        ocr_provider=_load_current_settings().get("ocr_provider", "easyocr"),
    )
    _storage.save_meta(meta)

    # Load current settings for preprocessing/DPI
    ocr_service: OCRService = get_ocr_service(request)
    app_settings = _load_current_settings()
    preprocessing = PreprocessingOptions(**app_settings.get("preprocessing", {}))
    dpi = app_settings.get("dpi", settings.default_dpi)

    # Kick off background OCR
    background_tasks.add_task(
        _run_ocr_pipeline,
        document_id,
        pdf_path,
        safe_name,
        dpi,
        preprocessing,
        ocr_service,
        request.app.state.llm_service,
        openai_api_key,
        anthropic_api_key,
    )

    return {"document_id": document_id, "total_pages": 0, "status": "pending"}


@router.get("/documents", response_model=PaginatedDocumentList)
def list_documents(
    page: int = 1,
    size: int = 10,
    q: Optional[str] = None,
    db: Session = Depends(get_db)
) -> PaginatedDocumentList:
    """Return a paginated list of all documents with summary metadata."""
    skip = (page - 1) * size
    items, total = _storage.list_documents(db, skip=skip, limit=size, search=q)
    return PaginatedDocumentList(items=items, total=total, page=page, size=size)


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a document and all its associated files."""
    success = _storage.delete_document(db, document_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete document")
    return {"message": "Document deleted successfully", "document_id": document_id}


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(document_id: str, db: Session = Depends(get_db)) -> DocumentStatusResponse:
    """Return the current OCR processing status for a document."""
    meta = _storage.load_meta(db, document_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentStatusResponse(
        document_id=meta.document_id,
        status=meta.status,
        processed_pages=meta.processed_pages,
        total_pages=meta.total_pages,
        progress_percent=meta.progress_percent,
    )


def _clean_page_full_text(page: dict) -> dict:
    """Remove the detected page_number from the end of full_text (on-the-fly post-processing).
    Also detects header-style page numbers at the top when page_number is 'n/a'.
    """
    import re
    full_text = page.get("full_text", "")
    page_num = str(page.get("page_number", ""))

    # -- Header detection for existing docs where page_number was not extracted --
    if (not full_text) or page_num in ("n/a", ""):
        if full_text:
            first_line = full_text.split('\n')[0].strip()
            matched_num = None
            matched_title = None

            # Pattern A: "title text <number>"  e.g. "제1-1장 서 론 7"
            m = re.search(r'^(.+?)\s+([0-9]{1,6})\s*$', first_line, re.UNICODE)
            if m and not m.group(1).strip().isdigit() and len(m.group(1).strip()) > 2:
                matched_title = m.group(1).strip()
                matched_num   = m.group(2)

            # Pattern B: "<number> title text"  e.g. "6 제1편 총 론"
            if not matched_num:
                m2 = re.match(r'^([0-9]{1,6})\s+(.+)$', first_line, re.UNICODE)
                if m2 and not m2.group(2).strip().isdigit() and len(m2.group(2).strip()) > 2:
                    matched_num   = m2.group(1)
                    matched_title = m2.group(2).strip()

            if matched_num:
                page["page_number"] = matched_num
                page["page_title"]  = matched_title
                rest = '\n'.join(full_text.split('\n')[1:]).strip()
                full_text = rest
                page_num = matched_num
        if not full_text:
            return page

    # -- Trailing page number removal (footer / bottom-of-page) --
    if page_num in ("n/a", ""):
        return page

    # Step A: Line-by-line removal from the bottom
    ft_lines = full_text.split("\n")
    noise = ' \t\r\u00a0()[]{}"\'.,-\u2018\u2019\u201c\u201d\u300d\u300f\uff02'
    while ft_lines:
        bare = ft_lines[-1].strip(noise)
        if bare == page_num:
            ft_lines.pop()
        else:
            break
    full_text = "\n".join(ft_lines).strip()

    # Step B: Remove page number appended inline at the end of the last line
    num_pat = re.escape(page_num)
    noise_pat = '[\s\u00a0\"\u2018\u2019\u201c\u201d\u300d\u300f\uff02\'()\[\]\.\-]*'
    full_text = re.sub(
        '[\s\u00a0]+' + num_pat + noise_pat + '$',
        "",
        full_text,
        flags=re.UNICODE,
    ).rstrip()

    page["full_text"] = full_text
    return page


@router.get("/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Return the full OCR result JSON for a completed document."""
    meta = _storage.load_meta(db, document_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if meta.status != DocumentStatus.completed:
        raise HTTPException(status_code=409, detail=f"Document status is '{meta.status}', not completed")
    result = _storage.load_result(document_id)
    if result is None:
        raise HTTPException(status_code=500, detail="Result file missing")
    # Clean full_text on-the-fly for all pages
    if isinstance(result, dict) and "pages" in result:
        result["pages"] = [_clean_page_full_text(p) for p in result["pages"]]
    return result


@router.get("/documents/{document_id}/pages/{page_number}")
def get_page(document_id: str, page_number: int, db: Session = Depends(get_db)) -> Any:
    """Return the OCR result for a single page."""
    meta = _storage.load_meta(db, document_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document not found")
    page_data = _storage.load_page_result(document_id, page_number)
    if page_data is None:
        raise HTTPException(status_code=404, detail=f"Page {page_number} not found")
    # Clean full_text on-the-fly
    if isinstance(page_data, dict):
        page_data = _clean_page_full_text(page_data)
    return page_data


@router.get("/documents/{document_id}/pages/{page_number}/image")
def get_page_image(document_id: str, page_number: int) -> FileResponse:
    """Return the original scanned page image (PNG)."""
    img_path = _storage.get_image_path(document_id, page_number)
    if img_path is None:
        raise HTTPException(status_code=404, detail=f"Image for page {page_number} not found")
    return FileResponse(str(img_path), media_type="image/png")


@router.get("/documents/{document_id}/download")
def download_document(document_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Download the full result JSON file."""
    meta = _storage.load_meta(db, document_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document not found")
    result_path = _storage._result_path(document_id)
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not available yet")
    return FileResponse(
        str(result_path),
        media_type="application/json",
        filename=f"{document_id}_result.json",
    )


@router.get("/documents/{document_id}/download-minimal")
def download_minimal(document_id: str) -> JSONResponse:
    """Return OCR result JSON excluding the large text_blocks field for each page."""
    result = _storage.load_result(document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not available yet")
    
    # Convert Pydantic model to dict for manipulation
    data = result.model_dump(mode="json")
    
    # Strip text_blocks from every page to reduce size
    for page in data.get("pages", []):
        page.pop("text_blocks", None)
        # Also recalculate or clear block_count if needed, but per user request, we just exclude the content
        page["block_count"] = 0 
            
    # Safely encode filename for header
    safe_filename = Path(result.filename).stem
    filename = f"{safe_filename}_minimal.json"
    encoded_filename = quote(filename)
    
    # Pretty print the JSON for readability
    json_str = json.dumps(data, indent=2, ensure_ascii=False)
    
    from fastapi import Response
    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        },
    )


@router.post("/documents/{document_id}/pages/{page_number}/llm-extract")
async def llm_extract_page(
    document_id: str,
    page_number: int,
    extract_req: LLMExtractRequest,
    llm_service: LLMService = Depends(get_llm_service),
    db: Session = Depends(get_db)
) -> Any:
    """Re-extract text from a specific page using LLM (ChatGPT/Claude)."""
    meta = _storage.load_meta(db, document_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document not found")
    
    img_path = _storage.get_image_path(document_id, page_number)
    if img_path is None or not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image for page {page_number} not found")

    # Try to load existing dimensions from previous OCR result
    prev_page = _storage.load_page_result(document_id, page_number)
    width = prev_page.get("width", 0) if prev_page else 0
    height = prev_page.get("height", 0) if prev_page else 0

    if extract_req.provider == "chatgpt":
        page_result = await llm_service.process_page_with_openai(
            img_path, page_number, extract_req.api_key, extract_req.model or "gpt-4o"
        )
    elif extract_req.provider == "claude":
        page_result = await llm_service.process_page_with_anthropic(
            img_path, page_number, extract_req.api_key, extract_req.model or "claude-sonnet-4-6"
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported LLM provider")

    if page_result.status == "failed":
        raise HTTPException(status_code=500, detail=page_result.error)

    # Set metadata securely using model_copy
    page_result = page_result.model_copy(update={
        "extracted_at": datetime.now(timezone.utc),
        "extracted_by": extract_req.model or ("GPT-4o" if extract_req.provider == "chatgpt" else "Claude 4.6")
    })

    # Set original dimensions if we have them
    if width > 0 and height > 0:
        page_result.width = width
        page_result.height = height

    # Save the new result (overwrites the previous PDF/PaddleOCR result for this page)
    # 1. Update per-page JSON
    _storage.save_page_result(document_id, page_result.model_dump(mode='json'))
    
    # 2. Update the full result JSON if it exists
    result = _storage.load_result(document_id)
    if result:
        # Update the specific page in the list
        for i, page in enumerate(result.pages):
            if page.seq_number == page_number:
                result.pages[i] = page_result
                break
        else:
            # If for some reason the page wasn't in the list, append it (shouldn't happen with correct data)
            result.pages.append(page_result)
            result.pages.sort(key=lambda p: p.page_number)
            
        _storage.save_result(result)

    return page_result


# ----------------------------------------------
# Helpers
# ----------------------------------------------


def _load_current_settings() -> dict:
    """Load persisted OCR settings from disk, returning defaults on failure."""
    if settings.settings_file.exists():
        try:
            return json.loads(settings.settings_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "dpi": settings.default_dpi,
        "preprocessing": {
            "grayscale": settings.enable_grayscale,
            "binarization": settings.enable_binarization,
            "denoise": settings.enable_denoise,
            "deskew": settings.enable_deskew,
        },
    }

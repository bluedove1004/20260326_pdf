"""PDF Tools router: splitting, merging, etc."""

from __future__ import annotations

import logging
import uuid
import shutil
from pathlib import Path
from typing import List, Dict, Any

import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from config import settings
from services.pdf_service import PDFService
from services.storage_service import StorageService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pdf", tags=["pdf_tools"])

_pdf = PDFService()
_storage = StorageService()

@router.post("/split")
async def split_pdf_endpoint(
    file: UploadFile = File(...)
) -> Dict[str, Any]:
    """
    Accept a PDF, split it into 200-page chunks, and return the list of split files.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read content
    content = await file.read()
    if len(content) > settings.max_file_size_bytes * 2: # Allow slightly larger files for splitting
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size for splitting"
        )

    # Temporary unique ID for this split job
    job_id = str(uuid.uuid4())
    temp_dir = settings.processed_dir / "splits" / job_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    pdf_path = temp_dir / file.filename
    
    # Save original
    async with aiofiles.open(pdf_path, "wb") as f:
        await f.write(content)

    try:
        # Split
        split_results = _pdf.split_pdf(pdf_path, temp_dir, chunk_size=200)
        
        # Format response
        files = []
        for filename, path in split_results:
            files.append({
                "filename": filename,
                "download_url": f"/api/pdf/download/{job_id}/{filename}"
            })
            
        return {
            "job_id": job_id,
            "original_filename": file.filename,
            "files": files
        }
    except Exception as e:
        logger.exception("Failed to split PDF: %s", e)
        # Cleanup on failure
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{job_id}/{filename}")
def download_split_file(job_id: str, filename: str) -> FileResponse:
    """Download a specific split segment."""
    safe_filename = Path(filename).name
    file_path = settings.processed_dir / "splits" / job_id / safe_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        str(file_path),
        media_type="application/pdf",
        filename=safe_filename
    )

"""Storage service: file and metadata persistence for documents."""

from __future__ import annotations

import json
import logging
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from config import settings
from models.document import DocumentMeta, DocumentResult, DocumentStatus, DocumentListItem, PageResult

logger = logging.getLogger(__name__)


class StorageService:
    """Handles all file system read/write operations for documents."""

    def _doc_dir(self, document_id: str) -> Path:
        """Return the processed directory for a specific document."""
        return settings.processed_dir / document_id

    def _meta_path(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "meta.json"

    def _result_path(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "result.json"

    def _images_dir(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "images"

    def _pages_dir(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "pages"

    # ------------------------------------------------------------------
    # Directory management
    # ------------------------------------------------------------------

    def create_document_dirs(self, document_id: str) -> None:
        """Create all subdirectories for a new document."""
        for d in [self._doc_dir(document_id), self._images_dir(document_id), self._pages_dir(document_id)]:
            d.mkdir(parents=True, exist_ok=True)
        logger.info("Created directories for document %s", document_id)

    # ------------------------------------------------------------------
    # Metadata CRUD
    # ------------------------------------------------------------------

    def save_meta(self, meta: DocumentMeta) -> None:
        """Persist document metadata to disk."""
        path = self._meta_path(meta.document_id)
        path.write_text(meta.model_dump_json(indent=2), encoding="utf-8")

    def load_meta(self, document_id: str) -> Optional[DocumentMeta]:
        """Load document metadata from disk. Returns None if not found."""
        path = self._meta_path(document_id)
        if not path.exists():
            return None
        try:
            return DocumentMeta.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("Failed to load meta for %s: %s", document_id, e)
            return None

    def update_meta(self, document_id: str, **kwargs) -> Optional[DocumentMeta]:
        """Load, update fields, and save document metadata."""
        meta = self.load_meta(document_id)
        if meta is None:
            return None
        for key, value in kwargs.items():
            setattr(meta, key, value)
        self.save_meta(meta)
        return meta

    # ------------------------------------------------------------------
    # Full result
    # ------------------------------------------------------------------

    def save_result(self, result: DocumentResult) -> None:
        """Save the complete OCR result JSON."""
        path = self._result_path(result.document_id)
        path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        logger.info("Saved result for document %s", result.document_id)

    def load_result(self, document_id: str) -> Optional[DocumentResult]:
        """Load the full OCR result from disk."""
        path = self._result_path(document_id)
        if not path.exists():
            return None
        try:
            return DocumentResult.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("Failed to load result for %s: %s", document_id, e)
            return None

    # ------------------------------------------------------------------
    # Per-page results
    # ------------------------------------------------------------------

    def save_page_result(self, document_id: str, page_data: dict) -> None:
        """Save a single page's OCR result as JSON."""
        seq_number = page_data["seq_number"]
        path = self._pages_dir(document_id) / f"page_{seq_number:04d}.json"
        path.write_text(json.dumps(page_data, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_page_result(self, document_id: str, seq_number: int) -> Optional[dict]:
        """Load a specific page's OCR result using its physical sequence number."""
        path = self._pages_dir(document_id) / f"page_{seq_number:04d}.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("Failed to load page %d for %s: %s", page_number, document_id, e)
            return None

    # ------------------------------------------------------------------
    # Images
    # ------------------------------------------------------------------

    def get_image_path(self, document_id: str, seq_number: int) -> Optional[Path]:
        """Return the path to the page image file if it exists."""
        path = self._images_dir(document_id) / f"page_{seq_number:04d}.png"
        return path if path.exists() else None

    def images_dir(self, document_id: str) -> Path:
        return self._images_dir(document_id)

    # ------------------------------------------------------------------
    # Document listing
    # ------------------------------------------------------------------

    def list_documents(
        self, skip: int = 0, limit: int = 20, search: Optional[str] = None
    ) -> tuple[List[DocumentListItem], int]:
        """Return a paginated and optionally filtered list of all documents."""
        items: List[DocumentListItem] = []
        if not settings.processed_dir.exists():
            return [], 0
        
        search_lower = unicodedata.normalize("NFC", search.lower()) if search else None

        for doc_dir in settings.processed_dir.iterdir():
            if not doc_dir.is_dir():
                continue
            meta = self.load_meta(doc_dir.name)
            if meta is None:
                continue
            
            # Normalize filename to NFC for consistent comparison
            filename_nfc = unicodedata.normalize("NFC", meta.filename.lower())
            
            # Apply search filter
            if search_lower and search_lower not in filename_nfc:
                continue

            items.append(
                DocumentListItem(
                    document_id=meta.document_id,
                    filename=meta.filename,
                    total_pages=meta.total_pages,
                    status=meta.status,
                    created_at=meta.created_at,
                )
            )
        
        # Sort by creation time descending (newest first)
        sorted_items = sorted(items, key=lambda x: x.created_at, reverse=True)
        total = len(sorted_items)
        
        # Apply slice
        return sorted_items[skip : skip + limit], total

    # ------------------------------------------------------------------
    # Storage helpers
    # ------------------------------------------------------------------

    def upload_path(self, document_id: str, filename: str) -> Path:
        """Return a path for a newly uploaded PDF."""
        return settings.upload_dir / f"{document_id}_{filename}"

    # ------------------------------------------------------------------
    # Delete Logic
    # ------------------------------------------------------------------

    def delete_document(self, document_id: str) -> bool:
        """Fully remove a document's directories and uploaded files."""
        import shutil
        try:
            # 1. Remove processed directory (and all its subdirs/files)
            doc_dir = self._doc_dir(document_id)
            if doc_dir.exists():
                shutil.rmtree(doc_dir)
            
            # 2. Remove any matching files in the upload directory
            # Based on upload_path: settings.upload_dir / f"{document_id}_{filename}"
            if settings.upload_dir.exists():
                for upload_file in settings.upload_dir.glob(f"{document_id}_*"):
                    upload_file.unlink()
            
            logger.info("Deleted all files for document %s", document_id)
            return True
        except Exception as e:
            logger.error("Failed to delete document %s: %s", document_id, e)
            return False

"""Storage service: file and MySQL metadata persistence for documents."""

from __future__ import annotations

import json
import logging
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session
from config import settings
from models.document import DocumentMeta, DocumentResult, DocumentStatus, DocumentListItem, PageResult
from models import orm as sql_models

logger = logging.getLogger(__name__)


class StorageService:
    """Handles physical file storage and MySQL database metadata management."""

    def _doc_dir(self, document_id: str) -> Path:
        """Return the processed directory for a specific document."""
        return settings.processed_dir / document_id

    def _meta_path(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "meta.json"

    def _result_path(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "result.json"

    def _original_result_path(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "result_original.json"

    def _images_dir(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "images"

    def _pages_dir(self, document_id: str) -> Path:
        return self._doc_dir(document_id) / "pages"

    # ------------------------------------------------------------------
    # Directory management
    # ------------------------------------------------------------------

    def upload_path(self, document_id: str, filename: str) -> Path:
        return settings.upload_dir / f"{document_id}_{filename}"

    def create_document_dirs(self, document_id: str) -> None:
        """Create all subdirectories for a new document."""
        for d in [self._doc_dir(document_id), self._images_dir(document_id), self._pages_dir(document_id)]:
            d.mkdir(parents=True, exist_ok=True)
        logger.info("Created directories for document %s", document_id)

    # ------------------------------------------------------------------
    # Metadata persistence (via Database)
    # ------------------------------------------------------------------

    def save_meta(self, db: Session, meta: DocumentMeta) -> None:
        """Persist document metadata to both disk (as backup) and MySQL."""
        # 1. Disk backup
        path = self._meta_path(meta.document_id)
        if not path.parent.exists():
            self.create_document_dirs(meta.document_id)
        path.write_text(meta.model_dump_json(indent=2), encoding="utf-8")

        # 2. Sync to DB
        doc = db.query(sql_models.Document).filter(
            sql_models.Document.document_id == meta.document_id
        ).first()

        if not doc:
            doc = sql_models.Document(document_id=meta.document_id)
            db.add(doc)
        
        doc.filename = meta.filename
        doc.total_pages = meta.total_pages
        doc.progress = int(getattr(meta, 'progress_percent', 0))
        doc.status = meta.status
        doc.created_at = meta.created_at
        doc.completed_at = meta.completed_at
        doc.ocr_provider = meta.ocr_provider
        doc.last_edited_by = meta.last_edited_by
        doc.last_edited_at = meta.last_edited_at
        
        db.commit()
        db.refresh(doc)
        logger.info("Metadata synced to MySQL for document %s", meta.document_id)

    def load_meta(self, db: Session, document_id: str) -> Optional[DocumentMeta]:
        """Load document metadata from the database."""
        doc = db.query(sql_models.Document).filter(
            sql_models.Document.document_id == document_id
        ).first()

        if not doc:
            return None
        
        # Use stored progress or compute from status
        progress = float(doc.progress or 0)
        if doc.status == "completed":
            progress = 100.0
            processed = doc.total_pages
        else:
            processed = int((progress / 100) * doc.total_pages) if doc.total_pages > 0 else 0

        return DocumentMeta(
            document_id=doc.document_id,
            filename=doc.filename,
            total_pages=doc.total_pages,
            status=DocumentStatus(doc.status),
            processed_pages=processed,
            progress_percent=progress,
            created_at=doc.created_at,
            completed_at=doc.completed_at,
            last_edited_by=doc.last_edited_by,
            last_edited_at=doc.last_edited_at,
            ocr_provider=doc.ocr_provider or "easyocr",
            is_archived=bool(doc.is_archived)
        )

    # ------------------------------------------------------------------
    # Full result
    # ------------------------------------------------------------------

    def save_result(self, result: DocumentResult) -> None:
        """Save the complete OCR result JSON to disk."""
        path = self._result_path(result.document_id)
        path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        logger.info("Saved full OCR result JSON for %s", result.document_id)

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

    def save_edit(
        self, db: Session, document_id: str, page_number: int, 
        updated_data: dict, user_key: str
    ) -> bool:
        """
        Apply edits to a specific page.
        1. Back up original result if not already done.
        2. Update pages/page_XXXX.json.
        3. Update main result.json.
        4. Update DB metadata (last_edited).
        """
        try:
            # 1. Backup original result.json on first edit
            master_path = self._result_path(document_id)
            orig_path = self._original_result_path(document_id)
            if master_path.exists() and not orig_path.exists():
                shutil.copy2(master_path, orig_path)
                logger.info("Backed up original OCR result for %s", document_id)

            # 2. Re-calculate full_text for the page based on text_blocks
            blocks = updated_data.get("text_blocks", [])
            # Sort by top/left for a natural flow if needed, but usually kept as is from OCR
            full_text = "\n".join([b.get("text", "") for b in blocks])
            updated_data["full_text"] = full_text

            # 3. Save individual page file
            self.save_page_result(document_id, updated_data)

            # 4. Rebuild the master result.json (for downloads)
            # Find total pages from DB or files
            pages_dir = self._pages_dir(document_id)
            total_pages = len(list(pages_dir.glob("page_*.json")))
            all_pages_data = []
            for i in range(1, total_pages + 1):
                p_path = pages_dir / f"page_{i:04d}.json"
                if p_path.exists():
                    p_content = json.loads(p_path.read_text(encoding="utf-8"))
                    all_pages_data.append(p_content)

            # Retrieve full metadata from DB for correct DocumentResult model construction
            doc = db.query(sql_models.Document).filter(
                sql_models.Document.document_id == document_id
            ).first()
            
            if not doc:
                logger.error("Document meta not found in DB for %s", document_id)
                return False

            # Build full DocumentResult
            doc_result = DocumentResult(
                document_id=document_id,
                filename=doc.filename,
                total_pages=total_pages,
                ocr_engine=doc.ocr_provider,
                pages=all_pages_data,
                created_at=doc.created_at or datetime.utcnow(),
                metadata={}
            )
            self.save_result(doc_result)

            # 5. Update DB metadata (last edited info)
            doc.last_edited_by = user_key
            doc.last_edited_at = datetime.utcnow()
            
            # 6. Create EditLog entry
            edit_log = sql_models.EditLog(
                user_key=user_key,
                document_id=document_id,
                seq_number=page_number,
                edit_type="manual"
            )
            db.add(edit_log)
            db.commit()

            return True
        except Exception as e:
            logger.error("Failed to save edit for %s: %s", document_id, e)
            db.rollback()
            return False

    def load_page_result(self, document_id: str, seq_number: int) -> Optional[dict]:
        """Load a specific page's OCR result using its sequence number."""
        path = self._pages_dir(document_id) / f"page_{seq_number:04d}.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("Failed to load page %d for %s: %s", seq_number, document_id, e)
            return None

    # ------------------------------------------------------------------
    # Document listing
    # ------------------------------------------------------------------

    def list_documents(
        self, db: Session, skip: int = 0, limit: int = 10, search: Optional[str] = None, 
        only_archived: bool = False
    ) -> tuple[List[DocumentListItem], int]:
        """Return a filtered, paginated list of documents from the database (high performance)."""
        query = db.query(sql_models.Document, sql_models.User.username).outerjoin(
            sql_models.User, sql_models.Document.last_edited_by == sql_models.User.user_key
        )
        
        if only_archived:
            query = query.filter(sql_models.Document.is_archived == 1)

        if search:
            # Match both NFC (composed) and NFD (decomposed) for Korean filename search
            search_nfc = unicodedata.normalize("NFC", search.lower())
            search_nfd = unicodedata.normalize("NFD", search.lower())
            query = query.filter(
                sql_models.Document.filename.ilike(f"%{search_nfc}%") |
                sql_models.Document.filename.ilike(f"%{search_nfd}%")
            )
        
        total = query.count()
        results = query.order_by(sql_models.Document.created_at.desc()).offset(skip).limit(limit).all()

        items = [
            DocumentListItem(
                document_id=d.document_id,
                filename=d.filename,
                total_pages=d.total_pages,
                status=DocumentStatus(d.status),
                progress=d.progress or 0,
                created_at=d.created_at,
                last_edited_by=username or d.last_edited_by, # Use name if available
                last_edited_at=d.last_edited_at,
                is_archived=bool(d.is_archived)
            )
            for d, username in results
        ]
        return items, total

    def delete_document(self, db: Session, document_id: str) -> bool:
        """Delete document from DB and remove its physical folder."""
        try:
            # 1. DB Removal
            doc = db.query(sql_models.Document).filter(
                sql_models.Document.document_id == document_id
            ).first()
            if doc:
                db.delete(doc)
                db.commit()
            
            # 2. File System Removal
            doc_dir = self._doc_dir(document_id)
            if doc_dir.exists():
                shutil.rmtree(doc_dir)
            
            # Cleanup upload artifacts
            for upload_file in settings.upload_dir.glob(f"{document_id}_*"):
                upload_file.unlink()
            
            logger.info("Deleted document %s and all data", document_id)
            return True
        except Exception as e:
            logger.error("Deletion failed for %s: %s", document_id, e)
            return False

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    def sync_disk_to_db(self, db: Session) -> int:
        """Synchronize legacy file-based metadata into the MySQL database."""
        if not settings.processed_dir.exists():
            return 0
        
        count = 0
        for doc_dir in settings.processed_dir.iterdir():
            if not doc_dir.is_dir() or doc_dir.name in ["splits", "logs"]:
                continue
            
            meta_path = self._meta_path(doc_dir.name)
            if meta_path.exists():
                try:
                    raw_meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    meta = DocumentMeta(**raw_meta)
                    self.save_meta(db, meta)
                    count += 1
                except Exception as e:
                    logger.error("Sync failed for directory %s: %s", doc_dir.name, e)
        return count

    def get_image_path(self, document_id: str, seq_number: int) -> Optional[Path]:
        """Return the path to a page's original PNG image."""
        path = self._images_dir(document_id) / f"page_{seq_number:04d}.png"
        return path if path.exists() else None

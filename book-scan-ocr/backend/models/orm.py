"""SQLAlchemy ORM models for Users and Documents."""

import datetime
from sqlalchemy import Column, String, Integer, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    """Database model for application users."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Integer, default=1) # 1 for True, 0 for False
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Document(Base):
    """Database model for OCR document metadata."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(36), unique=True, index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    total_pages = Column(Integer, default=0)
    progress = Column(Integer, default=0)
    status = Column(String(30), default="pending")
    ocr_provider = Column(String(50), default="easyocr")
    language = Column(String(30), default="korean")
    
    # Metadata for sorting / performance
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    processing_time_seconds = Column(Float, nullable=True)

    # Ownership
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user = relationship("User", back_populates="documents")

# Relationship backref on User
User.documents = relationship("Document", back_populates="user", order_by=Document.created_at.desc())

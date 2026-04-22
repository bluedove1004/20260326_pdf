"""SQLAlchemy ORM models for Users and Documents."""

import datetime
from sqlalchemy import Column, String, Integer, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    """Database model for application users."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_key = Column(String(20), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email_encrypted = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="user")  # "superadmin", "user"
    status = Column(String(20), default="pending")  # "pending", "approved"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)

class Token(Base):
    """Database model for tracking issued auth tokens."""
    __tablename__ = "tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    access_token = Column(String(500), unique=True, index=True, nullable=False)
    user_key = Column(String(20), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class SystemLog(Base):
    """Activity logging for security and auditing."""
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_key = Column(String(20), index=True, nullable=False)
    action = Column(String(100), nullable=False) # LOGIN, VIEW_DOC, DOWNLOAD_DOC, NAVIGATE
    details = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

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

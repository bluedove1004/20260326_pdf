"""FastAPI application entry point."""

from __future__ import annotations

import logging
import logging.config
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from config import settings
from routers import documents as doc_router
from routers import settings as settings_router
from routers import pdf_tools as pdf_router
from services.ocr_service import OCRService
from services.llm_service import LLMService
from services.auth_service import AuthService, SECRET_KEY, ALGORITHM
from services.log_service import LogService

# Database
from database import engine, Base, get_db, SessionLocal
from models import orm
import datetime

# ──────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(settings.logs_dir / "app.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# GPU selection logic
# ──────────────────────────────────────────────

if settings.use_gpu:
    os.environ["CUDA_VISIBLE_DEVICES"] = settings.cuda_device_index
    logger.info("Enforced GPU device index: %s", settings.cuda_device_index)


# ──────────────────────────────────────────────
# Lifespan: initialise heavy resources once
# ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialise EasyOCR at startup; clean up on shutdown."""
    logger.info("Starting up — initialising OCR service...")
    app.state.ocr_service = OCRService(
        lang=settings.ocr_language,
        use_angle_cls=settings.use_angle_cls,
        use_gpu=settings.use_gpu,
    )
    app.state.llm_service = LLMService()

    # Create tables
    logger.info("Syncing database schema (creating tables)...")
    Base.metadata.create_all(bind=engine)

    # Initialize superadmin if not exists
    db = SessionLocal()
    try:
        admin_user = db.query(orm.User).filter(orm.User.username == settings.admin_username).first()
        if not admin_user:
            logger.info(f"Initializing superadmin: {settings.admin_username}")
            new_admin = orm.User(
                user_key=AuthService.generate_user_key(),
                username=settings.admin_username,
                hashed_password=AuthService.hash_password(settings.admin_password),
                role="superadmin",
                status="approved"
            )
            db.add(new_admin)
            db.commit()
    finally:
        db.close()

    logger.info("OCR and LLM services ready with MySQL")
    yield
    logger.info("Shutting down")


# ──────────────────────────────────────────────
# App factory
# ──────────────────────────────────────────────

app = FastAPI(
    title="Book Scan OCR API",
    description="Upload scanned book PDFs and extract text via EasyOCR (Korean + Traditional Chinese + English).",
    version="1.0.0",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────
# Auth Middleware
# ──────────────────────────────────────────────

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Allow open routes
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Authentication check (skip for login/register/docs/static)
        if request.url.path not in ["/api/login", "/api/register", "/health"] and not request.url.path.startswith("/ocr/static"):
            auth_header = request.headers.get("Authorization")
            token_str = None
            
            # 1. Try header first
            if auth_header and auth_header.startswith("Bearer "):
                token_str = auth_header.split(" ")[1]
            
            # 2. Try query parameter (useful for <img> tags and downloads)
            if not token_str:
                token_str = request.query_params.get("token")
            
            if not token_str:
                return Response(
                    content='{"detail": "No authentication token found. Please login."}', 
                    status_code=401, 
                    media_type="application/json"
                )
            db = next(get_db())
            
            # Check if token exists in DB and is not expired
            db_token = db.query(orm.Token).filter(orm.Token.access_token == token_str).first()
            if not db_token or db_token.expires_at < datetime.datetime.utcnow():
                return Response(
                    content='{"detail": "Token expired or invalid. Please login again."}', 
                    status_code=401, 
                    media_type="application/json"
                )
            
            # Store user_key in request state for downstream use
            request.state.user_key = db_token.user_key
        
        return await call_next(request)

app.add_middleware(AuthMiddleware)

# CORS — allow the Vite dev server (and any localhost variant)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://kmgpt.kiom.re.kr:5173",
        "http://kmgpt.kiom.re.kr",
        "https://kmgpt.kiom.re.kr",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Register routers
app.include_router(doc_router.router)
app.include_router(settings_router.router)
app.include_router(pdf_router.router)


@app.get("/health")
def health() -> dict:
    """Simple health-check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


# ──────────────────────────────────────────────
# Authentication Helpers
# ──────────────────────────────────────────────

def get_current_user_role(request: Request) -> str:
    """Extract role from JWT token in the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("role", "user")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def check_superadmin(role: str = Depends(get_current_user_role)):
    """Dependency to ensure the user is a superadmin."""
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="슈퍼관리자 권한이 필요합니다.")
    return role

# ──────────────────────────────────────────────
# Authentication & User Management
# ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Check if user already exists
    existing = db.query(orm.User).filter(orm.User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new pending user
    new_user = orm.User(
        user_key=AuthService.generate_user_key(),
        username=req.username,
        hashed_password=AuthService.hash_password(req.password),
        email_encrypted=AuthService.encrypt_email(req.email),
        role="user",
        status="pending"
    )
    db.add(new_user)
    db.commit()
    return {"message": "Registration successful. Please wait for admin approval.", "status": "pending"}

@app.post("/api/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(orm.User).filter(orm.User.username == req.username).first()
    if not user or not AuthService.verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check approval status
    if user.status != "approved" and user.role != "superadmin":
        raise HTTPException(status_code=403, detail="관리자가 승인 전입니다.")
    
    # Generate Token
    token_str, expire = AuthService.create_access_token({
        "sub": user.username, 
        "role": user.role,
        "user_key": user.user_key # Include user_key in JWT
    })
    
    # Save token to DB
    db_token = orm.Token(
        access_token=token_str,
        user_id=user.id,
        user_key=user.user_key,
        expires_at=expire
    )
    db.add(db_token)
    
    # RECORD LOGIN LOG
    LogService.log(db, user.user_key, "LOGIN", f"User {user.username} logged in")
    
    db.commit()
    
    return {
        "access_token": token_str,
        "role": user.role,
        "username": user.username,
        "status": "success"
    }

class LogRequest(BaseModel):
    action: str
    details: str = None

@app.post("/api/logs")
def create_log(req: LogRequest, request: Request, db: Session = Depends(get_db)):
    """API for frontend to record navigation logs."""
    user_key = getattr(request.state, "user_key", "GUEST")
    LogService.log(db, user_key, req.action, req.details)
    return {"status": "ok"}

@app.get("/api/admin/pending-users")
def get_pending_users(db: Session = Depends(get_db), _=Depends(check_superadmin)):
    pending = db.query(orm.User).filter(orm.User.status == "pending").all()
    return [{
        "id": u.id,
        "username": u.username,
        "created_at": u.created_at,
        "email_preview": "..." # Encrypted
    } for u in pending]

@app.get("/api/admin/logs")
def get_system_logs(
    page: int = 1, 
    size: int = 50, 
    q: str = "", 
    db: Session = Depends(get_db), 
    _=Depends(check_superadmin)
):
    skip = (page - 1) * size
    query = db.query(orm.SystemLog, orm.User.username).outerjoin(
        orm.User, orm.SystemLog.user_key == orm.User.user_key
    )
    
    if q:
        query = query.filter(
            (orm.User.username.contains(q)) | 
            (orm.SystemLog.action.contains(q)) |
            (orm.SystemLog.details.contains(q))
        )
    
    total = query.count()
    logs = query.order_by(orm.SystemLog.timestamp.desc()).offset(skip).limit(size).all()
    
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [{
            "id": log.id,
            "user_key": log.user_key,
            "username": username or "GUEST",
            "action": log.action,
            "details": log.details,
            "timestamp": log.timestamp
        } for log, username in logs]
    }

@app.post("/api/admin/approve/{user_id}")
def approve_user(user_id: int, db: Session = Depends(get_db), _=Depends(check_superadmin)):
    user = db.query(orm.User).filter(orm.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.status = "approved"
    user.approved_at = datetime.datetime.utcnow()
    db.commit()
    return {"message": f"User {user.username} has been approved."}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

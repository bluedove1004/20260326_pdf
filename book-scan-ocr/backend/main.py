"""FastAPI application entry point."""

from __future__ import annotations

import logging
import logging.config
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from routers import documents as doc_router
from routers import settings as settings_router
from routers import pdf_tools as pdf_router
from services.ocr_service import OCRService
from services.llm_service import LLMService

# Database
from database import engine, Base
from models import orm

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
        # 1. Exemptions: login, health, and ESPECIALLY preflight (OPTIONS)
        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)
            
        if path in ["/api/login", "/health", "/api/health"]:
            return await call_next(request)
        
        # Static token protection for all other /api calls
        if path.startswith("/api/"):
            auth_header = request.headers.get("Authorization")
            expected_token = "Bearer fake-jwt-token-for-ocr-admin"
            
            if not auth_header or auth_header != expected_token:
                return Response(
                    content='{"detail": "Unauthorized: Invalid or missing token"}',
                    status_code=401,
                    media_type="application/json"
                )
        
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


class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login(req: LoginRequest) -> dict:
    """Validate admin credentials and return a fake token."""
    if req.username == settings.admin_username and req.password == settings.admin_password:
        return {"access_token": "fake-jwt-token-for-ocr-admin", "status": "success"}
    raise HTTPException(status_code=401, detail="Invalid username or password")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

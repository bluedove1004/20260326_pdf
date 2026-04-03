"""SQLAlchemy database toolset."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

# engine configured for MySQL/PyMySQL
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Per-request session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative models
Base = declarative_base()

def get_db():
    """Dependency for obtaining a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

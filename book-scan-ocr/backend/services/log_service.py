from sqlalchemy.orm import Session
from models import orm
import datetime

class LogService:
    """Service for recording system activity logs in the database."""

    @staticmethod
    def log(db: Session, user_key: str, action: str, details: str = None):
        """Record an action in the system_logs table."""
        try:
            new_log = orm.SystemLog(
                user_key=user_key,
                action=action,
                details=details,
                timestamp=datetime.datetime.utcnow()
            )
            db.add(new_log)
            db.commit()
        except Exception as e:
            # Fallback for logging if DB fails
            print(f"FAILED TO WRITE LOG: {e}")
            db.rollback()

    @staticmethod
    def get_edit_logs(db: Session, skip: int = 0, limit: int = 50):
        """Retrieve recent edit logs from the database."""
        return db.query(orm.EditLog).order_by(orm.EditLog.created_at.desc()).offset(skip).limit(limit).all()

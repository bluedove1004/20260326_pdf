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

import bcrypt
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from cryptography.fernet import Fernet

# Configuration (In production, load these from environment variables)
SECRET_KEY = "TEXTLENS-SECRET-KEY-FOR-JWT-V1" 
ALGORITHM = "HS256"
# This is a sample 32-byte key for Fernet. 
# MUST be consistent across server restarts to decrypt old data.
ENCRYPTION_KEY = b'6Q7Z8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4J5K6L7=' 

# Email encryption
cipher_suite = Fernet(ENCRYPTION_KEY)

class AuthService:
    """Service for handling authentication and encryption."""

    @staticmethod
    def generate_user_key(length: int = 20) -> str:
        """Generate a 20-character random alphanumeric user key."""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    @staticmethod
    def hash_password(password: str) -> str:
        # Encode password to bytes
        pw_bytes = password.encode('utf-8')
        # bcrypt handles hashing and salting automatically
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(pw_bytes, salt)
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            return bcrypt.checkpw(
                plain_password.encode('utf-8'), 
                hashed_password.encode('utf-8')
            )
        except Exception:
            return False

    @staticmethod
    def encrypt_email(email: str) -> str:
        return cipher_suite.encrypt(email.encode()).decode()

    @staticmethod
    def decrypt_email(encrypted_email: str) -> str:
        return cipher_suite.decrypt(encrypted_email.encode()).decode()

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=7) # Default 1 week
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt, expire


from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from services.auth_service import SECRET_KEY, ALGORITHM

def get_current_user_role(request: Request) -> str:
    """Extract role from JWT token in the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        # Fallback for query param (token=...)
        token = request.query_params.get("token")
        if not token:
            raise HTTPException(status_code=401, detail="Unauthorized")
    else:
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

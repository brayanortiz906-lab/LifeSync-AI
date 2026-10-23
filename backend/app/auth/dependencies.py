"""FastAPI dependencies para autenticación Supabase + RLS context."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth.supabase_auth import verify_jwt
from typing import Optional
from contextvars import ContextVar

security = HTTPBearer(auto_error=False)

# ContextVar para RLS - user_id de Supabase Auth
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """Extrae y verifica JWT del header Authorization: Bearer <token>."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorización requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return await verify_jwt(credentials.credentials)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_id(user: dict = Depends(get_current_user)) -> str:
    """Retorna solo el user_id (sub claim)."""
    return user["sub"]

async def get_current_user_email(user: dict = Depends(get_current_user)) -> str:
    """Retorna email del usuario."""
    return user["email"]

async def set_rls_context(user_id: str = Depends(get_current_user_id)):
    """Dependency que establece user_id para RLS en la request actual."""
    token = current_user_id.set(user_id)
    try:
        yield
    finally:
        current_user_id.reset(token)

# Dependency opcional - para endpoints que pueden ser públicos o autenticados
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict | None:
    """Como get_current_user pero retorna None si no hay token (no lanza 401)."""
    if not credentials:
        return None
    try:
        return await verify_jwt(credentials.credentials)
    except ValueError:
        return None

async def get_current_user_id_optional(
    user: dict | None = Depends(get_current_user_optional)
) -> str | None:
    return user["sub"] if user else None
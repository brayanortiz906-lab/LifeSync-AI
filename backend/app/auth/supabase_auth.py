"""Supabase Auth integration for server-side operations."""
from supabase import create_client, Client
from app.config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Admin client (service role key) - SOLO backend
_supabase_admin: Client | None = None

def get_supabase_admin() -> Client:
    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY  # NUNCA exponer en frontend
        )
    return _supabase_admin

# Cliente público (anon key) - para verificar JWT del usuario
_supabase_public: Client | None = None

def get_supabase_public() -> Client:
    global _supabase_public
    if _supabase_public is None:
        _supabase_public = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
    return _supabase_public

async def verify_jwt(token: str) -> dict:
    """Verifica JWT de Supabase y retorna claims del usuario."""
    client = get_supabase_public()
    try:
        client.auth.set_session(token, "")
        user_resp = client.auth.get_user(token)
        if user_resp.user is None:
            raise ValueError("Invalid token")
        return {
            "sub": user_resp.user.id,
            "email": user_resp.user.email,
            "role": user_resp.user.role,
            "app_metadata": user_resp.user.app_metadata,
            "user_metadata": user_resp.user.user_metadata,
        }
    except Exception as e:
        logger.warning(f"JWT verification failed: {e}")
        raise ValueError("Token inválido o expirado")

async def get_user_by_id(user_id: str) -> dict | None:
    """Obtiene usuario por ID (admin client)."""
    client = get_supabase_admin()
    try:
        resp = client.auth.admin.get_user_by_id(user_id)
        return resp.user.model_dump() if resp.user else None
    except Exception:
        return None

async def create_user(email: str, password: str, metadata: dict = None) -> dict:
    """Crea usuario vía admin API."""
    client = get_supabase_admin()
    resp = client.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": metadata or {}
    })
    if resp.user is None:
        raise ValueError("Error creando usuario")
    return resp.user.model_dump()

async def update_user(user_id: str, data: dict) -> dict:
    """Actualiza usuario (metadata, password, etc)."""
    client = get_supabase_admin()
    resp = client.auth.admin.update_user_by_id(user_id, data)
    if resp.user is None:
        raise ValueError("Error actualizando usuario")
    return resp.user.model_dump()

async def delete_user(user_id: str) -> bool:
    """Elimina usuario."""
    client = get_supabase_admin()
    try:
        client.auth.admin.delete_user(user_id)
        return True
    except Exception:
        return False

async def send_magic_link(email: str, redirect_to: str = None) -> bool:
    """Envía magic link por email."""
    client = get_supabase_public()
    try:
        opts = {"email_redirect_to": redirect_to} if redirect_to else {}
        client.auth.sign_in_with_otp({"email": email, "options": opts})
        return True
    except Exception as e:
        logger.error(f"Error enviando magic link: {e}")
        return False

async def reset_password(email: str, redirect_to: str = None) -> bool:
    """Envía email para resetear contraseña."""
    client = get_supabase_public()
    try:
        opts = {"redirect_to": redirect_to} if redirect_to else {}
        client.auth.reset_password_for_email(email, options=opts)
        return True
    except Exception as e:
        logger.error(f"Error en reset password: {e}")
        return False
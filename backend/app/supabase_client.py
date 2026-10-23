"""Supabase clients: admin (service_role) y public (anon)."""
from supabase import create_client, Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

_admin: Client | None = None
def get_supabase_admin() -> Client:
    global _admin
    if _admin is None: _admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _admin

_public: Client | None = None
def get_supabase_public() -> Client:
    global _public
    if _public is None: _public = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _public

async def verify_jwt(token: str) -> dict:
    client = get_supabase_public()
    try:
        client.auth.set_session(token, "")
        user_resp = client.auth.get_user(token)
        if user_resp.user is None: raise ValueError("Invalid token")
        return {"sub": user_resp.user.id, "email": user_resp.user.email, "role": user_resp.user.role,
                "app_metadata": user_resp.user.app_metadata, "user_metadata": user_resp.user.user_metadata}
    except Exception as e:
        logger.warning(f"JWT verification failed: {e}")
        raise ValueError("Token inválido o expirado")

async def get_user_profile(user_id: str) -> dict | None:
    client = get_supabase_admin()
    try: 
        resp = client.table("usuarios").select("*").eq("id", user_id).single().execute()
        return resp.data
    except Exception: return None

async def upsert_user_profile(user_id: str, data: dict) -> dict:
    client = get_supabase_admin()
    data["id"] = user_id; data["updated_at"] = "now()"
    resp = client.table("usuarios").upsert(data).execute()
    return resp.data[0] if resp.data else {}
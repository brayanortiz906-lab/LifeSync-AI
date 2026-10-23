"""Router de cuentas/perfil usuario."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from app.auth.dependencies import get_current_user_id
from app.database import get_db
from app.supabase_client import upsert_user_profile
from app.crypto import encrypt_dict, decrypt_dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Usuario

router = APIRouter(prefix="/accounts", tags=["accounts"])

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = None
    timezone: Optional[str] = Field(None, max_length=50)
    locale: Optional[str] = Field(None, max_length=10)
    email_notifications: Optional[bool] = None
    daily_summary_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    default_ai_provider: Optional[str] = Field(None, max_length=50)
    ai_api_keys: Optional[Dict[str, str]] = None

class ProfileResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: str = "UTC"
    locale: str = "es"
    email_notifications: bool = True
    daily_summary_time: Optional[str] = None
    default_ai_provider: Optional[str] = None
    ai_api_keys: Dict[str, str] = {}  # Solo keys, sin valores (seguridad)
    created_at: datetime
    updated_at: datetime

@router.get("/me", response_model=ProfileResponse)
async def get_profile(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene perfil completo del usuario."""
    # Obtener de tabla usuarios
    result = await db.execute(select(Usuario).where(Usuario.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        # Crear perfil si no existe (trigger debería haberlo hecho)
        profile = await upsert_user_profile(user_id, {})
        user = type('obj', (object,), profile)()
    
    # Preparar ai_api_keys (solo nombres, no valores)
    ai_keys = user.ai_api_keys or {}
    safe_keys = {k: "***" if v else "" for k, v in ai_keys.items()}
    
    return ProfileResponse(
        id=str(user.id),
        email=user_id,  # Se obtiene del token
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        timezone=user.timezone,
        locale=user.locale,
        email_notifications=user.email_notifications,
        daily_summary_time=user.daily_summary_time,
        default_ai_provider=user.default_ai_provider,
        ai_api_keys=safe_keys,
        created_at=user.created_at,
        updated_at=user.updated_at
    )

@router.patch("/me", response_model=ProfileResponse)
async def update_profile(
    data: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza perfil del usuario."""
    update_data = data.model_dump(exclude_unset=True)
    
    # Encriptar API keys si se envían
    if "ai_api_keys" in update_data and update_data["ai_api_keys"]:
        update_data["ai_api_keys"] = encrypt_dict(update_data["ai_api_keys"])
    
    # Actualizar en BD
    result = await db.execute(select(Usuario).where(Usuario.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    
    if user:
        for key, value in update_data.items():
            if hasattr(user, key):
                setattr(user, key, value)
        user.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
    else:
        await upsert_user_profile(user_id, update_data)
    
    return await get_profile(user_id, db)

@router.get("/providers")
async def list_ai_providers():
    """Lista proveedores de IA disponibles."""
    return {
        "providers": [
            {"id": "gemini", "name": "Google Gemini", "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"], "requires_key": True, "url": "https://aistudio.google.com/apikey"},
            {"id": "openai", "name": "OpenAI", "models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"], "requires_key": True, "url": "https://platform.openai.com/api-keys"},
            {"id": "anthropic", "name": "Anthropic Claude", "models": ["claude-3-5-sonnet", "claude-3-haiku"], "requires_key": True, "url": "https://console.anthropic.com/"},
            {"id": "groq", "name": "Groq", "models": ["llama-3.1-70b", "llama-3.1-8b", "mixtral-8x7b"], "requires_key": True, "url": "https://console.groq.com/keys"},
            {"id": "openrouter", "name": "OpenRouter", "models": ["various"], "requires_key": True, "url": "https://openrouter.ai/keys"},
        ]
    }

@router.post("/test-key")
async def test_ai_key(provider: str, api_key: str):
    """Testea una API key antes de guardarla."""
    try:
        if provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            await model.generate_content_async("test")
            return {"valid": True, "message": "Key válida"}
        elif provider == "openai":
            import openai
            client = openai.AsyncOpenAI(api_key=api_key)
            await client.models.list()
            return {"valid": True, "message": "Key válida"}
        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            await client.messages.create(model="claude-3-haiku-20240307", max_tokens=1, messages=[{"role": "user", "content": "test"}])
            return {"valid": True, "message": "Key válida"}
        elif provider == "groq":
            import groq
            client = groq.AsyncGroq(api_key=api_key)
            await client.models.list()
            return {"valid": True, "message": "Key válida"}
        else:
            return {"valid": False, "message": "Proveedor no soportado para test"}
    except Exception as e:
        return {"valid": False, "message": f"Key inválida: {str(e)}"}
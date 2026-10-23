"""Router de autenticación con Supabase Auth."""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import RedirectResponse
from app.auth.supabase_auth import (
    verify_jwt, create_user, update_user, delete_user,
    send_magic_link, reset_password, get_supabase_public
)
from app.auth.dependencies import get_current_user, get_current_user_id
from app.auth.schemas import (
    RegisterRequest, LoginRequest, MagicLinkRequest, ResetPasswordRequest,
    UpdatePasswordRequest, UpdateProfileRequest, AuthResponse, UserResponse,
    MessageResponse, OAuthURLResponse
)
from app.supabase_client import upsert_user_profile
from app.crypto import encrypt_dict, decrypt_dict
from app.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest):
    """Registro email/password - crea en Supabase Auth y perfil en tabla usuarios."""
    try:
        # Crear en Supabase Auth
        auth_user = await create_user(data.email, data.password, {"display_name": data.display_name})
        user_id = auth_user["id"]
        
        # Crear perfil extendido
        profile_data = {
            "display_name": data.display_name,
            "timezone": "UTC",
            "locale": "es",
        }
        await upsert_user_profile(user_id, profile_data)
        
        # Generar tokens de sesión (sign in)
        client = get_supabase_public()
        session_resp = client.auth.sign_in_with_password({"email": data.email, "password": data.password})
        
        if not session_resp.session:
            raise HTTPException(status_code=500, detail="Error creando sesión")
        
        return AuthResponse(
            user=UserResponse(id=user_id, email=data.email, display_name=data.display_name, **profile_data),
            access_token=session_resp.session.access_token,
            refresh_token=session_resp.session.refresh_token,
            expires_in=session_resp.session.expires_in
        )
    except Exception as e:
        logger.error(f"Error en register: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest):
    """Login email/password."""
    client = get_supabase_public()
    try:
        resp = client.auth.sign_in_with_password({"email": data.email, "password": data.password})
        if not resp.session or not resp.user:
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        
        # Obtener perfil extendido
        profile = await upsert_user_profile(resp.user.id, {})
        
        return AuthResponse(
            user=UserResponse(
                id=resp.user.id,
                email=resp.user.email,
                display_name=profile.get("display_name"),
                avatar_url=profile.get("avatar_url"),
                timezone=profile.get("timezone", "UTC"),
                locale=profile.get("locale", "es"),
                email_notifications=profile.get("email_notifications", True),
                daily_summary_time=profile.get("daily_summary_time"),
                default_ai_provider=profile.get("default_ai_provider"),
                created_at=resp.user.created_at,
                updated_at=resp.user.updated_at or resp.user.created_at
            ),
            access_token=resp.session.access_token,
            refresh_token=resp.session.refresh_token,
            expires_in=resp.session.expires_in
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en login: {e}")
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

@router.post("/magic-link", response_model=MessageResponse)
async def magic_link(data: MagicLinkRequest):
    """Envía magic link por email."""
    redirect = data.redirect_to or f"{settings.FRONTEND_URL}/auth/callback"
    success = await send_magic_link(data.email, redirect)
    if not success:
        raise HTTPException(status_code=500, detail="Error enviando magic link")
    return MessageResponse(message="Magic link enviado. Revisa tu email.")

@router.post("/reset-password", response_model=MessageResponse)
async def request_password_reset(data: ResetPasswordRequest):
    """Solicita reset de contraseña."""
    redirect = data.redirect_to or f"{settings.FRONTEND_URL}/auth/reset-password"
    success = await reset_password(data.email, redirect)
    if not success:
        raise HTTPException(status_code=500, detail="Error enviando email de reset")
    return MessageResponse(message="Email de recuperación enviado.")

@router.post("/update-password", response_model=MessageResponse)
async def update_password(data: UpdatePasswordRequest, user_id: str = Depends(get_current_user_id)):
    """Actualiza contraseña (usuario autenticado)."""
    try:
        await update_user(user_id, {"password": data.new_password})
        return MessageResponse(message="Contraseña actualizada")
    except Exception as e:
        logger.error(f"Error actualizando password: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Obtiene perfil del usuario actual."""
    user_id = user["sub"]
    client = get_supabase_public()
    
    # Obtener perfil extendido de la tabla usuarios
    try:
        profile_resp = client.table("usuarios").select("*").eq("id", user_id).single().execute()
        profile = profile_resp.data or {}
    except Exception:
        profile = {}
    
    # Desencriptar API keys si existen
    ai_keys = profile.get("ai_api_keys", {})
    if ai_keys:
        from app.crypto import decrypt_dict
        ai_keys = decrypt_dict(ai_keys)
    
    return UserResponse(
        id=user_id,
        email=user["email"],
        display_name=profile.get("display_name") or user["user_metadata"].get("display_name"),
        avatar_url=profile.get("avatar_url") or user["user_metadata"].get("avatar_url"),
        timezone=profile.get("timezone", "UTC"),
        locale=profile.get("locale", "es"),
        email_notifications=profile.get("email_notifications", True),
        daily_summary_time=profile.get("daily_summary_time"),
        default_ai_provider=profile.get("default_ai_provider"),
        created_at=user.get("created_at") or profile.get("created_at"),
        updated_at=profile.get("updated_at")
    )

@router.patch("/me", response_model=UserResponse)
async def update_me(data: UpdateProfileRequest, user_id: str = Depends(get_current_user_id)):
    """Actualiza perfil del usuario actual."""
    update_data = data.model_dump(exclude_unset=True)
    
    # Encriptar API keys si se envían
    if "ai_api_keys" in update_data and update_data["ai_api_keys"]:
        update_data["ai_api_keys"] = encrypt_dict(update_data["ai_api_keys"])
    
    # Actualizar en Supabase Auth (metadata)
    auth_client = get_supabase_public()
    auth_client.auth.set_session("", "")  # Necesario para admin operations
    # Nota: update_user usa admin client internamente
    from app.auth.supabase_auth import update_user as auth_update_user
    await auth_update_user(user_id, {"user_metadata": {k: v for k, v in update_data.items() if k in ["display_name", "avatar_url"]}})
    
    # Actualizar perfil extendido
    profile = await upsert_user_profile(user_id, update_data)
    
    return UserResponse(
        id=user_id,
        email=user_id,  # Se obtiene del token en get_me
        **{k: v for k, v in profile.items() if k in UserResponse.model_fields}
    )

@router.get("/oauth/{provider}", response_model=OAuthURLResponse)
async def oauth_url(provider: str, redirect_to: str = None):
    """Genera URL para OAuth (google, github, etc)."""
    client = get_supabase_public()
    redirect = redirect_to or f"{settings.FRONTEND_URL}/auth/callback"
    
    if provider not in ["google", "github", "gitlab", "bitbucket", "azure"]:
        raise HTTPException(status_code=400, detail="Proveedor no soportado")
    
    try:
        resp = client.auth.sign_in_with_oauth({
            "provider": provider,
            "options": {"redirect_to": redirect}
        })
        return OAuthURLResponse(url=resp.url, provider=provider)
    except Exception as e:
        logger.error(f"Error generando OAuth URL: {e}")
        raise HTTPException(status_code=500, detail="Error generando URL OAuth")

@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(refresh_token: str):
    """Refresca access token usando refresh token."""
    client = get_supabase_public()
    try:
        resp = client.auth.refresh_session(refresh_token)
        if not resp.session:
            raise HTTPException(status_code=401, detail="Refresh token inválido")
        
        profile = await upsert_user_profile(resp.user.id, {})
        
        return AuthResponse(
            user=UserResponse(
                id=resp.user.id,
                email=resp.user.email,
                display_name=profile.get("display_name"),
                **{k: v for k, v in profile.items() if k in UserResponse.model_fields}
            ),
            access_token=resp.session.access_token,
            refresh_token=resp.session.refresh_token,
            expires_in=resp.session.expires_in
        )
    except Exception as e:
        logger.error(f"Error refrescando token: {e}")
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")

@router.post("/logout", response_model=MessageResponse)
async def logout(user_id: str = Depends(get_current_user_id)):
    """Logout - invalida sesión en servidor (client-side borra tokens)."""
    # Supabase maneja logout client-side, aquí solo confirmamos
    return MessageResponse(message="Sesión cerrada")

@router.delete("/me", response_model=MessageResponse)
async def delete_account(user_id: str = Depends(get_current_user_id)):
    """Elimina cuenta del usuario (GDPR)."""
    from app.auth.supabase_auth import delete_user as auth_delete_user
    success = await auth_delete_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Error eliminando cuenta")
    return MessageResponse(message="Cuenta eliminada permanentemente")
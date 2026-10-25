"""Router para consentimiento parental COPPA."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from app.auth.dependencies import get_current_user_id
from app.correo import enviar_correo
import random
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/parental", tags=["parental"])

# In-memory store for verification codes (use Redis in production)
# Format: {parent_email: {"code": "123456", "child_user_id": "uuid", "expires": timestamp}}
VERIFICATION_STORE: dict[str, dict] = {}


class SendVerificationRequest(BaseModel):
    parent_email: EmailStr
    child_user_id: str


class VerifyCodeRequest(BaseModel):
    parent_email: EmailStr
    code: str


class ConsentStatusResponse(BaseModel):
    required: bool
    verified: bool
    parent_email: str | None = None


def generate_code() -> str:
    """Generate a 6-digit verification code."""
    return str(random.randint(100000, 999999))


@router.post("/send-verification")
async def send_verification(
    data: SendVerificationRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Envía código de verificación al email del padre/madre/tutor.
    Requiere que el usuario autenticado sea el mismo child_user_id (seguridad).
    """
    # Seguridad: el usuario autenticado debe coincidir con child_user_id
    if user_id != data.child_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para solicitar verificación para otro usuario"
        )

    code = generate_code()
    
    # Store code with 15-minute expiry
    import time
    VERIFICATION_STORE[data.parent_email] = {
        "code": code,
        "child_user_id": data.child_user_id,
        "expires": time.time() + 900,  # 15 minutes
    }

    # Send email
    subject = "Código de verificación parental - LifeAgente AI"
    text = f"""
Hola,

Has solicitado dar consentimiento parental para que tu hijo/a use LifeAgente AI.

Tu código de verificación de 6 dígitos es: {code}

Este código expira en 15 minutos.

Si no solicitaste esto, ignora este correo.

---
LifeAgente AI - Cumplimiento COPPA
    """.strip()
    
    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .code {{ background: #f3f4f6; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e3a8a; margin: 20px 0; }}
        .footer {{ font-size: 12px; color: #999; margin-top: 30px; }}
    </style>
</head>
<body>
    <div class="container">
        <h2>Verificación de consentimiento parental</h2>
        <p>Has solicitado dar consentimiento parental para que tu hijo/a use <strong>LifeAgente AI</strong>.</p>
        <p>Tu código de verificación de 6 dígitos es:</p>
        <div class="code">{code}</div>
        <p>Este código expira en <strong>15 minutos</strong>.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
        <div class="footer">LifeAgente AI - Cumplimiento COPPA (Children's Online Privacy Protection Act)</div>
    </div>
</body>
</html>
    """.strip()

    modo, mensaje = enviar_correo(
        destinatario=data.parent_email,
        asunto=subject,
        texto=text,
        html=html,
    )

    if modo == "error" or modo == "ninguno":
        # Clean up on failure
        VERIFICATION_STORE.pop(data.parent_email, None)
        logger.error(f"Error enviando verificación parental: {mensaje}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo enviar el correo de verificación: {mensaje}"
        )

    logger.info(f"Código de verificación parental enviado a {data.parent_email} para usuario {data.child_user_id}")
    return {"message": "Código de verificación enviado. Revisa el email del padre/madre/tutor."}


@router.post("/verify-code")
async def verify_code(data: VerifyCodeRequest):
    """
    Verifica el código de 6 dígitos enviado al email del padre/madre/tutor.
    """
    import time
    
    stored = VERIFICATION_STORE.get(data.parent_email)
    
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay código pendiente para este email o ha expirado"
        )
    
    if time.time() > stored["expires"]:
        VERIFICATION_STORE.pop(data.parent_email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El código ha expirado. Solicita uno nuevo."
        )
    
    if stored["code"] != data.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto"
        )
    
    # Success - clean up
    child_user_id = stored["child_user_id"]
    VERIFICATION_STORE.pop(data.parent_email, None)
    
    logger.info(f"Consentimiento parental verificado para usuario {child_user_id} (padre: {data.parent_email})")
    
    return {
        "message": "Consentimiento parental verificado correctamente",
        "child_user_id": child_user_id,
        "parent_email": data.parent_email,
    }


@router.get("/status", response_model=ConsentStatusResponse)
async def get_consent_status(user_id: str = Depends(get_current_user_id)):
    """
    Verifica si el usuario requiere consentimiento parental y su estado.
    En producción, consultar base de datos o localStorage del frontend.
    """
    # En implementación real, verificar en BD
    # Por ahora, el frontend maneja esto via localStorage
    return ConsentStatusResponse(
        required=False,
        verified=False,
        parent_email=None
    )
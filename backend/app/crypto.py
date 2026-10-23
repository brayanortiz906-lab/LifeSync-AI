"""Encriptación Fernet para API keys de usuarios (BYOK)."""
from cryptography.fernet import Fernet
from app.config import settings
import logging

logger = logging.getLogger(__name__)

try:
    _fernet = Fernet(settings.ENCRYPTION_KEY.encode() if isinstance(settings.ENCRYPTION_KEY, str) else settings.ENCRYPTION_KEY)
except Exception as e:
    logger.error(f"ENCRYPTION_KEY inválida: {e}. Genera: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")
    raise

def encrypt_api_key(api_key: str) -> str:
    if not api_key: return ""
    return _fernet.encrypt(api_key.encode()).decode()

def decrypt_api_key(encrypted: str) -> str:
    if not encrypted: return ""
    try: return _fernet.decrypt(encrypted.encode()).decode()
    except Exception as e:
        logger.warning(f"Error desencriptando: {e}")
        return ""

def encrypt_dict(data: dict) -> dict:
    return {k: encrypt_api_key(v) for k, v in data.items() if v}

def decrypt_dict(data: dict) -> dict:
    return {k: decrypt_api_key(v) for k, v in data.items() if v}
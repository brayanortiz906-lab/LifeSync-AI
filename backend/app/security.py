"""Cifrado de secretos (API Keys) con AES-128/Fernet.

La clave maestra se deriva de APP_SECRET_KEY mediante SHA-256, de modo que el
usuario pueda poner cualquier cadena en el .env. En producción se recomienda
usar un gestor de secretos (AWS Secrets Manager, Vault, Doppler).
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _fernet() -> Fernet:
    derivada = hashlib.sha256(settings.app_secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(derivada))


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode("utf-8")).decode("utf-8")


def descifrar(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None

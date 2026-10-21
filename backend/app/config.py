"""Configuración centralizada (patrón Settings con pydantic-settings)."""
from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                               # raíz del proyecto
SHARED_DIR = PROJECT_DIR / "shared"

# --- App empaquetada (instalador .exe) ----------------------------------- #
# Cuando LifeAgente va dentro de un .exe (PyInstaller), los archivos viven
# en una carpeta temporal que se BORRA al cerrar. Por eso:
#   1. la base de datos va a una carpeta de datos del usuario (persiste), y
#   2. los archivos de solo lectura (system_prompt, frontend) se buscan en
#      varias rutas posibles.
FROZEN = bool(getattr(sys, "frozen", False))               # True dentro del .exe
MEIPASS = Path(getattr(sys, "_MEIPASS", "")) if FROZEN else None


def _primer_existente(candidatos: list[Path]) -> Path:
    for c in candidatos:
        if c and c.exists():
            return c
    return candidatos[0]


# Carpeta de datos del usuario: %APPDATA%\LifeAgente (o ~/.lifeagente).
# Aqui vive la base de datos, los respaldos y los logs. NO se borra al cerrar.
DATA_DIR = Path(
    os.environ.get("LIFEAGENTE_DATA")
    or (Path(os.environ.get("APPDATA") or Path.home()) / "LifeAgente")
)
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except OSError:  # pragma: no cover - permisos raros
    pass

# Carpeta de la interfaz compilada (frontend/dist).
FRONTEND_DIST = _primer_existente(
    [
        (MEIPASS / "frontend" / "dist") if MEIPASS else BASE_DIR.parent / "frontend" / "dist",
        BASE_DIR.parent / "frontend" / "dist",
        Path(sys.executable).parent / "frontend" / "dist" if FROZEN else BASE_DIR / "dist",
    ]
)

# Archivo con el System Prompt (fuente de verdad del agente).
SYSTEM_PROMPT_PATH = _primer_existente(
    [
        (MEIPASS / "shared" / "system_prompt.txt") if MEIPASS else PROJECT_DIR / "shared" / "system_prompt.txt",
        PROJECT_DIR / "shared" / "system_prompt.txt",
        Path(sys.executable).parent / "shared" / "system_prompt.txt" if FROZEN else BASE_DIR / "system_prompt.txt",
    ]
)
SHARED_DIR = SYSTEM_PROMPT_PATH.parent


def _secreto_estable() -> str:
    """Clave estable entre ejecuciones.

    La clave cifra las credenciales de las IA (Fernet). Si cambiara en cada
    arranque, las claves guardadas quedarían ilegibles. Por eso se guarda una
    vez en la carpeta de datos del usuario.
    """
    archivo = DATA_DIR / "secreto.txt"
    try:
        if archivo.exists():
            valor = archivo.read_text(encoding="utf-8").strip()
            if valor:
                return valor
        import secrets as _secrets

        valor = _secrets.token_urlsafe(48)
        archivo.write_text(valor, encoding="utf-8")
        return valor
    except OSError:  # pragma: no cover
        return "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "LifeAgente AI"
    app_secret_key: str = ""
    database_url: str = ""

    default_llm_provider: str = "mock"
    default_openai_model: str = "gpt-4o-mini"
    default_gemini_model: str = "gemini-2.0-flash"

    default_currency: str = "COP"
    day_start: str = "07:00"
    day_end: str = "22:00"
    default_timezone: str = "America/Bogota"

    # --- Envio del codigo de verificacion (v11) ------------------------- #
    # Sin SMTP configurado el codigo se muestra en la respuesta (modo
    # desarrollo) y queda registrado en la consola del servidor.
    # --- Acceso con cuenta: un client id por proveedor ---------------- #
    # Lo configura UNA vez quien instala la app (env vars del despliegue).
    google_client_id: str = ""
    outlook_client_id: str = ""
    github_client_id: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_desde: str = ""

    # --- Tarea diaria (v21) -------------------------------------------- #
    # Token que protege `POST /api/permisos/ejecutar-todos`. La tarea diaria
    # de GitHub Actions lo usa para despertar la API y mandar el resumen.
    cron_token: str = ""

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def modelo_defecto(self) -> "Settings":
        """Rellena los valores que dependen de la carpeta de datos."""
        if not self.app_secret_key:
            self.app_secret_key = _secreto_estable()
        if not self.database_url:
            self.database_url = f"sqlite:///{(DATA_DIR / 'lifesync.db').as_posix()}"
        return self

    @property
    def system_prompt(self) -> str:
        """System Prompt maestro (fuente de verdad en /shared/system_prompt.txt)."""
        if SYSTEM_PROMPT_PATH.exists():
            return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        return "Eres LifeAgente, un asistente de vida y productividad. Responde en JSON."


@lru_cache
def get_settings() -> Settings:
    return Settings().modelo_defecto()


settings = get_settings()
os.makedirs(BASE_DIR, exist_ok=True)

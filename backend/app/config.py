"""Configuración centralizada (patrón Settings con pydantic-settings)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                               # raíz del proyecto
SHARED_DIR = PROJECT_DIR / "shared"
SYSTEM_PROMPT_PATH = SHARED_DIR / "system_prompt.txt"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "LifeAgente AI"
    app_secret_key: str = "dev-secret-change-me"
    database_url: str = f"sqlite:///{(BASE_DIR / 'lifesync.db').as_posix()}"

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

    @property
    def system_prompt(self) -> str:
        """System Prompt maestro (fuente de verdad en /shared/system_prompt.txt)."""
        if SYSTEM_PROMPT_PATH.exists():
            return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        return "Eres LifeAgente, un asistente de vida y productividad. Responde en JSON."


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
os.makedirs(BASE_DIR, exist_ok=True)

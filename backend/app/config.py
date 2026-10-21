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

    app_name: str = "LifeSync AI"
    app_secret_key: str = "dev-secret-change-me"
    database_url: str = f"sqlite:///{(BASE_DIR / 'lifesync.db').as_posix()}"

    default_llm_provider: str = "mock"
    default_openai_model: str = "gpt-4o-mini"
    default_gemini_model: str = "gemini-2.0-flash"

    default_currency: str = "COP"
    day_start: str = "07:00"
    day_end: str = "22:00"
    default_timezone: str = "America/Bogota"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ID de cliente OAuth de Google usado por el boton "Continuar con Google".
    # Si el despliegue define esta variable, el usuario final entra a Google
    # con un clic y sin pegar nada; si no, se le pide el suyo.
    google_client_id: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def system_prompt(self) -> str:
        """System Prompt maestro (fuente de verdad en /shared/system_prompt.txt)."""
        if SYSTEM_PROMPT_PATH.exists():
            return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        return "Eres LifeSync, un asistente de vida y productividad. Responde en JSON."


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
os.makedirs(BASE_DIR, exist_ok=True)

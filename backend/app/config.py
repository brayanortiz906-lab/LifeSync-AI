"""Settings centralizadas - Supabase + BYOK (sin GEMINI_API_KEY global)."""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field
from typing import List, Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )
    
    # App
    APP_NAME: str = "LifeAgente"
    DEBUG: bool = True
    ENVIRONMENT: str = "local"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]
    
    # Supabase
    SUPABASE_URL: str = Field(..., description="https://xxx.supabase.co")
    SUPABASE_ANON_KEY: str = Field(..., description="Clave pública anon")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., description="Service role (SOLO backend)")
    DATABASE_URL: str = Field(..., description="postgresql+asyncpg://...")
    
    # Crypto para encriptar API keys de usuarios (BYOK)
    ENCRYPTION_KEY: str = Field(..., description="32 bytes base64 para Fernet")
    
    # Google OAuth (opcional - Calendar/Drive)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    # Email (opcional)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: str = "noreply@lifeagente.local"
    
    # Frontend URL
    FRONTEND_URL: str = "http://localhost:5173"
    
    # Cron
    CRON_TOKEN: str = "cron-token-secreto"
    
    @computed_field
    @property
    def is_local(self) -> bool:
        return self.ENVIRONMENT == "local"

settings = Settings()
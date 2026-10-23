"""Pydantic schemas para Auth (Supabase)."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime

# Requests
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class MagicLinkRequest(BaseModel):
    email: EmailStr
    redirect_to: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    redirect_to: Optional[str] = None

class UpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = None
    timezone: Optional[str] = Field(None, max_length=50)
    locale: Optional[str] = Field(None, max_length=10)
    email_notifications: Optional[bool] = None
    daily_summary_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    default_ai_provider: Optional[str] = Field(None, max_length=50)
    ai_api_keys: Optional[Dict[str, str]] = None  # Se encriptan automáticamente

# Responses
class UserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: str = "UTC"
    locale: str = "es"
    email_notifications: bool = True
    daily_summary_time: Optional[str] = None
    default_ai_provider: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"

class MessageResponse(BaseModel):
    message: str
    success: bool = True

# OAuth
class OAuthURLResponse(BaseModel):
    url: str
    provider: str
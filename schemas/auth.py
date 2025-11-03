"""Authentication and authorization schemas."""
from typing import Optional
from pydantic import BaseModel, Field


class LoginTokenRequest(BaseModel):
    """Schema for login with one-time token."""
    one_time_token: str = Field(
        ...,
        min_length=32,
        max_length=128,
        description="One-time token from Telegram bot"
    )


class LoginTokenResponse(BaseModel):
    """Schema for login response."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    admin_id: int = Field(..., description="Admin ID")
    role: str = Field(..., description="Admin role")


class TokenData(BaseModel):
    """Schema for token payload data."""
    admin_id: int
    telegram_id: int
    role: str
    exp: int  # Expiration timestamp


class TokenPayload(BaseModel):
    """Schema for JWT token payload."""
    sub: str = Field(..., description="Subject (admin_id)")
    telegram_id: int = Field(..., description="Telegram ID")
    role: str = Field(..., description="Admin role")
    exp: int = Field(..., description="Expiration timestamp")
    iat: int = Field(..., description="Issued at timestamp")


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""
    refresh_token: str = Field(..., description="Refresh token")


class OneTimeToken(BaseModel):
    """Schema for one-time token generation."""
    token: str = Field(..., description="Generated one-time token")
    expires_at: int = Field(..., description="Expiration timestamp")
    admin_id: int = Field(..., description="Admin ID")


class PasswordChange(BaseModel):
    """Schema for password change (if needed in future)."""
    old_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


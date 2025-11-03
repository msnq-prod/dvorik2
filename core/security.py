"""Security utilities for authentication and authorization."""
from datetime import datetime, timedelta
from typing import Optional
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from core.config import settings
from schemas.auth import TokenData


# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password against hash.
    
    Args:
        plain_password: Plain text password
        hashed_password: Hashed password
    
    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash password.
    
    Args:
        password: Plain text password
    
    Returns:
        Hashed password
    """
    return pwd_context.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token.
    
    Args:
        data: Token payload data
        expires_delta: Token expiration time (optional)
    
    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow()
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenData]:
    """
    Decode and verify JWT access token.
    
    Args:
        token: JWT token
    
    Returns:
        TokenData if valid, None otherwise
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        admin_id: Optional[int] = payload.get("sub")
        telegram_id: Optional[int] = payload.get("telegram_id")
        role: Optional[str] = payload.get("role")
        exp: Optional[int] = payload.get("exp")
        
        if admin_id is None or telegram_id is None or role is None:
            return None
        
        return TokenData(
            admin_id=int(admin_id),
            telegram_id=telegram_id,
            role=role,
            exp=exp
        )
    
    except JWTError:
        return None


def generate_one_time_token(length: int = 64) -> str:
    """
    Generate secure one-time token for login.
    
    Args:
        length: Token length (default 64 characters)
    
    Returns:
        Random secure token
    """
    return secrets.token_urlsafe(length)


def verify_internal_api_key(api_key: str) -> bool:
    """
    Verify internal API key for system endpoints.
    
    Args:
        api_key: API key to verify
    
    Returns:
        True if valid, False otherwise
    """
    return secrets.compare_digest(api_key, settings.INTERNAL_API_KEY)


def verify_telegram_webhook(token: str, bot_type: str) -> bool:
    """
    Verify Telegram webhook token.
    
    Args:
        token: Token from webhook request
        bot_type: 'main' or 'auth'
    
    Returns:
        True if valid, False otherwise
    """
    if bot_type == "main":
        expected_token = settings.TELEGRAM_MAIN_BOT_TOKEN
    elif bot_type == "auth":
        expected_token = settings.TELEGRAM_AUTH_BOT_TOKEN
    else:
        return False
    
    return secrets.compare_digest(token, expected_token)


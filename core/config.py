"""Application configuration using pydantic-settings."""
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Database
    DB_URL: str = Field(
        ...,
        description="Async database URL (mysql+asyncmy://user:pass@host:port/db)"
    )
    DB_URL_SYNC: Optional[str] = Field(
        None,
        description="Sync database URL for Alembic (mysql+pymysql://...)"
    )
    DB_POOL_SIZE: int = Field(default=10, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=20, ge=0)
    DB_POOL_RECYCLE: int = Field(default=3600, ge=300)
    
    # Redis
    REDIS_URL: str = Field(
        ...,
        description="Redis URL (redis://host:port/db)"
    )
    
    # Telegram Bots
    TELEGRAM_MAIN_BOT_TOKEN: str = Field(..., min_length=40)
    TELEGRAM_AUTH_BOT_TOKEN: str = Field(..., min_length=40)
    TELEGRAM_CHANNEL_ID: str = Field(default="@marmeladny_dvorik")
    
    # Admin Configuration
    FIRST_SUPERADMIN_TG_ID: Optional[int] = Field(
        None,
        description="Telegram ID of the first superadmin (for initial setup)"
    )
    
    # Broadcast Settings
    DEFAULT_BROADCAST_RATE_PER_MINUTE: int = Field(default=25, ge=1, le=30)
    
    # Security
    INTERNAL_API_KEY: str = Field(..., min_length=32)
    JWT_SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=43200, ge=60)  # 30 days
    
    # Timezone
    TZ: str = Field(default="Asia/Vladivostok")
    
    # Application Settings
    DEBUG: bool = Field(default=False)
    API_HOST: str = Field(default="0.0.0.0")
    API_PORT: int = Field(default=8000, ge=1, le=65535)
    
    # Webhook URLs
    WEBHOOK_BASE_URL: str = Field(
        ...,
        description="Base URL for webhooks (https://your-domain.com)"
    )
    WEBHOOK_PATH_MAIN: str = Field(default="/webhooks/main-bot")
    WEBHOOK_PATH_AUTH: str = Field(default="/webhooks/auth-bot")
    
    # Celery Configuration
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None
    CELERY_TIMEZONE: str = Field(default="Asia/Vladivostok")
    
    # Birthday Task Configuration
    BIRTHDAY_CHECK_HOUR: int = Field(default=9, ge=0, le=23)
    BIRTHDAY_CHECK_MINUTE: int = Field(default=0, ge=0, le=59)
    
    # Subscription Cache TTL (seconds)
    SUBSCRIPTION_CACHE_TTL: int = Field(default=60, ge=30, le=300)
    
    # Code Generation
    CODE_PREFIX: str = Field(default="")
    CODE_LENGTH: int = Field(default=7, ge=7, le=32)
    
    # Rate Limiting
    TELEGRAM_RATE_LIMIT_PER_MINUTE: int = Field(default=25, ge=1, le=30)
    TELEGRAM_RETRY_BACKOFF_FACTOR: float = Field(default=2.0, ge=1.0)
    TELEGRAM_MAX_RETRIES: int = Field(default=3, ge=1, le=10)
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO")
    
    @field_validator('CELERY_BROKER_URL', mode='before')
    @classmethod
    def set_celery_broker_url(cls, v: Optional[str], info) -> str:
        """Set Celery broker URL from REDIS_URL if not provided."""
        if v is None:
            redis_url = info.data.get('REDIS_URL')
            if redis_url:
                return redis_url
        return v or ""
    
    @field_validator('CELERY_RESULT_BACKEND', mode='before')
    @classmethod
    def set_celery_result_backend(cls, v: Optional[str], info) -> str:
        """Set Celery result backend from REDIS_URL if not provided."""
        if v is None:
            redis_url = info.data.get('REDIS_URL')
            if redis_url:
                return redis_url
        return v or ""
    
    @field_validator('DB_URL_SYNC', mode='before')
    @classmethod
    def set_db_url_sync(cls, v: Optional[str], info) -> str:
        """Set sync DB URL from async URL if not provided."""
        if v is None:
            db_url = info.data.get('DB_URL')
            if db_url and 'asyncmy' in db_url:
                return db_url.replace('asyncmy', 'pymysql')
        return v or ""
    
    def get_main_webhook_url(self) -> str:
        """Get full webhook URL for main bot."""
        return f"{self.WEBHOOK_BASE_URL.rstrip('/')}{self.WEBHOOK_PATH_MAIN}"
    
    def get_auth_webhook_url(self) -> str:
        """Get full webhook URL for auth bot."""
        return f"{self.WEBHOOK_BASE_URL.rstrip('/')}{self.WEBHOOK_PATH_AUTH}"


# Create global settings instance
settings = Settings()


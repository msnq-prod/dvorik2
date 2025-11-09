from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str
    TZ: str
    DB_URL: str
    REDIS_URL: str
    TELEGRAM_MAIN_BOT_TOKEN: str
    TELEGRAM_AUTH_BOT_TOKEN: str
    TELEGRAM_WEBHOOK_MAIN_URL: str
    TELEGRAM_WEBHOOK_AUTH_URL: str
    FIRST_SUPERADMIN_TG_ID: int
    DEFAULT_BROADCAST_RATE_PER_MINUTE: int
    DEFAULT_BROADCAST_BATCH_SIZE: int

    class Config:
        env_file = ".env"


settings = Settings()

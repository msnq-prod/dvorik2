"""Main FastAPI application."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.exceptions import AppException
from core.exception_handlers import (
    app_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    general_exception_handler
)
from core.middleware import (
    RequestLoggingMiddleware,
    TestDataMiddleware,
    WebhookAuthMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware
)

# Import all routers
from routers import (
    auth_router,
    webhooks_router,
    users_router,
    discounts_router,
    discount_templates_router,
    broadcasts_router,
    segments_router,
    admins_router,
    cashiers_router,
    settings_router,
    message_templates_router,
    stats_router,
    bot_main_router,
    bot_auth_router
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Мармеладный Дворик - Loyalty System API",
    description="API for loyalty and communication system",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add custom middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, calls=100, period=60)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(TestDataMiddleware)
app.add_middleware(WebhookAuthMiddleware)

# Register exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Register routers
app.include_router(auth_router)
app.include_router(webhooks_router)
app.include_router(users_router)
app.include_router(discounts_router)
app.include_router(discount_templates_router)
app.include_router(broadcasts_router)
app.include_router(segments_router)
app.include_router(admins_router)
app.include_router(cashiers_router)
app.include_router(settings_router)
app.include_router(message_templates_router)
app.include_router(stats_router)
app.include_router(bot_main_router)
app.include_router(bot_auth_router)


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    logger.info("Starting Мармеладный Дворик API")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Database URL: {settings.DB_URL.split('@')[1] if '@' in settings.DB_URL else 'configured'}")
    logger.info(f"Redis URL: {settings.REDIS_URL}")
    
    # Initialize Redis client
    from core.redis import redis_client
    await redis_client.connect()
    logger.info("Redis client connected")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    logger.info("Shutting down Мармеладный Дворик API")
    
    # Close Redis client
    from core.redis import redis_client
    await redis_client.disconnect()
    logger.info("Redis client disconnected")
    
    # Close Telegram bot clients
    from services.telegram_client import close_clients
    await close_clients()


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "service": "Мармеладный Дворик - Loyalty System API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", tags=["Health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint with database and Redis checks."""
    from sqlalchemy import text
    from core.redis import get_redis
    
    health = {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "checks": {}
    }
    
    # Check database
    try:
        await db.execute(text("SELECT 1"))
        health["checks"]["database"] = "ok"
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["database"] = f"error: {str(e)}"
        logger.error(f"Health check: Database error - {str(e)}")
    
    # Check Redis
    try:
        redis = await get_redis()
        if redis.client:
            await redis.client.ping()
            health["checks"]["redis"] = "ok"
        else:
            health["status"] = "unhealthy"
            health["checks"]["redis"] = "error: not connected"
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["redis"] = f"error: {str(e)}"
        logger.error(f"Health check: Redis error - {str(e)}")
    
    return health


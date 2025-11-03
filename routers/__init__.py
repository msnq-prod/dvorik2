"""Routers package."""
from routers.auth import router as auth_router
from routers.webhooks import router as webhooks_router
from routers.users import router as users_router
from routers.discounts import router as discounts_router
from routers.discount_templates import router as discount_templates_router
from routers.broadcasts import router as broadcasts_router
from routers.segments import router as segments_router
from routers.admins import router as admins_router
from routers.cashiers import router as cashiers_router
from routers.settings import router as settings_router
from routers.message_templates import router as message_templates_router
from routers.stats import router as stats_router
from routers.bot_main import router as bot_main_router
from routers.bot_auth import router as bot_auth_router

__all__ = [
    "auth_router",
    "webhooks_router",
    "users_router",
    "discounts_router",
    "discount_templates_router",
    "broadcasts_router",
    "segments_router",
    "admins_router",
    "cashiers_router",
    "settings_router",
    "message_templates_router",
    "stats_router",
    "bot_main_router",
    "bot_auth_router",
]


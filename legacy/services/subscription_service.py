"""Subscription service for managing channel subscriptions."""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from core.redis import RedisClient
from core.config import settings
from services.user_service import get_user_by_telegram_id, update_user
from schemas.user import UserUpdate


async def check_subscription(
    telegram_id: int,
    redis: RedisClient
) -> Optional[bool]:
    """
    Check if user is subscribed to channel (with caching).
    
    Args:
        telegram_id: Telegram user ID
        redis: Redis client
    
    Returns:
        True if subscribed, False if not, None if check failed
    """
    # Try to get from cache first
    cached_status = await redis.get_subscription_status(telegram_id)
    
    if cached_status is not None:
        return cached_status
    
    # Cache miss, need to check via Telegram API
    # This will be done by telegram_client
    return None


async def update_subscription_status(
    db: AsyncSession,
    redis: RedisClient,
    telegram_id: int,
    is_subscribed: bool
) -> bool:
    """
    Update user subscription status in DB and cache.
    
    Args:
        db: Database session
        redis: Redis client
        telegram_id: Telegram user ID
        is_subscribed: New subscription status
    
    Returns:
        True if updated successfully
    """
    # Update in database
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        return False
    
    if user.is_subscribed != is_subscribed:
        await update_user(
            db,
            user.id,
            UserUpdate(is_subscribed=is_subscribed)
        )
    
    # Update cache
    await redis.set_subscription_status(
        telegram_id,
        is_subscribed,
        ttl=settings.SUBSCRIPTION_CACHE_TTL
    )
    
    return True


async def handle_subscription_check(
    db: AsyncSession,
    redis: RedisClient,
    telegram_id: int,
    is_subscribed: bool
) -> tuple[bool, bool]:
    """
    Handle subscription check result.
    
    Updates database and cache, determines if discount should be given.
    
    Args:
        db: Database session
        redis: Redis client
        telegram_id: Telegram user ID
        is_subscribed: Check result from Telegram API
    
    Returns:
        Tuple of (should_give_discount, subscription_status)
    """
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        return False, is_subscribed
    
    # Update subscription status
    await update_subscription_status(db, redis, telegram_id, is_subscribed)
    
    # Give discount only if:
    # 1. User is subscribed
    # 2. User wasn't subscribed before (new subscription)
    should_give_discount = is_subscribed and not user.is_subscribed
    
    return should_give_discount, is_subscribed


async def give_subscription_discount(
    db: AsyncSession,
    user_id: int
) -> Optional[dict]:
    """
    Give subscription discount to user (with recurrence check).
    
    Args:
        db: Database session
        user_id: User ID
    
    Returns:
        Discount info dict or None if can't give
    """
    from services.user_service import check_recurrence
    from services.discount_service import create_discount_for_user
    from models.discount_template import DiscountTemplateType
    
    # Check recurrence (30 days rule)
    can_receive, last_issued_at = await check_recurrence(
        db,
        user_id,
        DiscountTemplateType.SUBSCRIPTION.value
    )
    
    if not can_receive:
        # User already has subscription discount (recurrence not reached)
        return {
            "error": "RECURRENCE_NOT_REACHED",
            "message": "You already received subscription discount",
            "last_issued_at": last_issued_at
        }
    
    # Create discount
    discount = await create_discount_for_user(
        db,
        user_id,
        DiscountTemplateType.SUBSCRIPTION
    )
    
    if not discount:
        return {
            "error": "TEMPLATE_NOT_FOUND",
            "message": "Subscription discount template not found"
        }
    
    return {
        "discount_id": discount.id,
        "code": discount.code,
        "expires_at": discount.expires_at,
        "value": discount.template.format_value()
    }


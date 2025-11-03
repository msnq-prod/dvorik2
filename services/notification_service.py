"""Notification service for sending Telegram messages."""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from services.telegram_client import get_main_bot_client, get_auth_bot_client
from services.message_service import render_template
from models.user import User
from models.admin import Admin

logger = logging.getLogger(__name__)


async def send_user_notification(
    db: AsyncSession,
    user: User,
    template_key: str,
    context: Optional[Dict[str, str]] = None,
    reply_markup: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Send notification to user via main bot.
    
    Args:
        db: Database session
        user: User to notify
        template_key: Message template key
        context: Template context
        reply_markup: Inline keyboard markup
    
    Returns:
        Success status
    """
    try:
        # Render message
        message = await render_template(db, template_key, context)
        
        if not message:
            logger.error(f"Template '{template_key}' not found")
            return False
        
        # Send via main bot
        bot = get_main_bot_client()
        
        await bot.send_message(
            chat_id=user.telegram_id,
            text=message,
            reply_markup=reply_markup
        )
        
        return True
    
    except Exception as e:
        logger.error(f"Failed to send notification to user {user.id}: {e}")
        return False


async def send_admin_notification(
    db: AsyncSession,
    admin: Admin,
    message: str,
    reply_markup: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Send notification to admin via auth bot.
    
    Args:
        db: Database session
        admin: Admin to notify
        message: Message text
        reply_markup: Inline keyboard markup
    
    Returns:
        Success status
    """
    try:
        # Send via auth bot
        bot = get_auth_bot_client()
        
        await bot.send_message(
            chat_id=admin.telegram_id,
            text=message,
            reply_markup=reply_markup
        )
        
        return True
    
    except Exception as e:
        logger.error(f"Failed to send notification to admin {admin.id}: {e}")
        return False


async def send_discount_notification(
    db: AsyncSession,
    user: User,
    code: str,
    expires_at: str,
    template_key: str = "subscription_discount"
) -> bool:
    """
    Send discount code notification to user.
    
    Args:
        db: Database session
        user: User
        code: Discount code
        expires_at: Expiry date string
        template_key: Template key (subscription_discount or birthday_discount)
    
    Returns:
        Success status
    """
    return await send_user_notification(
        db,
        user=user,
        template_key=template_key,
        context={
            "code": code,
            "expires_at": expires_at
        }
    )


async def send_discount_used_notification(
    db: AsyncSession,
    user: User,
    code: str
) -> bool:
    """
    Send discount used notification to user.
    
    Args:
        db: Database session
        user: User
        code: Discount code
    
    Returns:
        Success status
    """
    return await send_user_notification(
        db,
        user=user,
        template_key="discount_used",
        context={"code": code}
    )


async def send_welcome_message(
    db: AsyncSession,
    user: User
) -> bool:
    """
    Send welcome message to new user.
    
    Args:
        db: Database session
        user: User
    
    Returns:
        Success status
    """
    return await send_user_notification(
        db,
        user=user,
        template_key="welcome",
        context={"name": user.display_name}
    )


async def send_subscription_success(
    db: AsyncSession,
    user: User
) -> bool:
    """
    Send subscription success message.
    
    Args:
        db: Database session
        user: User
    
    Returns:
        Success status
    """
    return await send_user_notification(
        db,
        user=user,
        template_key="subscription_success"
    )


async def send_cashier_approval(
    db: AsyncSession,
    cashier_telegram_id: int,
    approved: bool
) -> bool:
    """
    Send cashier approval/rejection notification.
    
    Args:
        db: Database session
        cashier_telegram_id: Cashier Telegram ID
        approved: Whether approved
    
    Returns:
        Success status
    """
    try:
        template_key = "cashier_approved" if approved else "cashier_rejected"
        message = await render_template(db, template_key)
        
        if not message:
            logger.error(f"Template '{template_key}' not found")
            return False
        
        # Send via auth bot
        bot = get_auth_bot_client()
        
        await bot.send_message(
            chat_id=cashier_telegram_id,
            text=message
        )
        
        return True
    
    except Exception as e:
        logger.error(f"Failed to send cashier notification: {e}")
        return False


async def notify_admins_by_group(
    db: AsyncSession,
    notification_group: str,
    message: str
) -> int:
    """
    Send notification to all admins in a notification group.
    
    Args:
        db: Database session
        notification_group: Notification group name
        message: Message text
    
    Returns:
        Number of successful sends
    """
    from models.admin import Admin
    from sqlalchemy import select
    
    # Get admins in notification group
    result = await db.execute(
        select(Admin).where(
            Admin.notification_groups.contains([notification_group])
        )
    )
    admins = result.scalars().all()
    
    success_count = 0
    
    for admin in admins:
        if await send_admin_notification(db, admin, message):
            success_count += 1
    
    return success_count


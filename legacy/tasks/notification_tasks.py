"""Notification tasks for sending individual messages."""
import logging
from celery import Task

from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from services.telegram_client import get_main_bot_client, get_auth_bot_client
from services.user_service import get_user_by_id
from services.admin_service import get_admin_by_id
from services.message_service import render_template

logger = logging.getLogger(__name__)


class NotificationTask(Task):
    """Base notification task with automatic retry."""
    
    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 300  # 5 minutes
    max_retries = 3
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        logger.error(f"Notification task {task_id} failed: {exc}")


@celery_app.task(
    bind=True,
    base=NotificationTask,
    name="tasks.send_user_notification",
    rate_limit="25/m"  # Telegram API rate limit
)
def send_user_notification(
    self,
    user_id: int,
    template_key: str,
    context: dict = None
):
    """
    Send notification to user.
    
    Args:
        user_id: User ID
        template_key: Message template key
        context: Template context variables
    """
    import asyncio
    
    async def _send():
        async with AsyncSessionLocal() as db:
            # Get user
            user = await get_user_by_id(db, user_id)
            
            if not user:
                logger.error(f"User {user_id} not found")
                return False
            
            # Render message
            message = await render_template(db, template_key, context or {})
            
            if not message:
                logger.error(f"Template '{template_key}' not found")
                return False
            
            # Send message
            try:
                bot = get_main_bot_client()
                
                await bot.send_message(
                    chat_id=user.telegram_id,
                    text=message
                )
                
                logger.info(f"Notification sent to user {user_id}")
                return True
            
            except Exception as e:
                error_str = str(e)
                
                # Don't retry on 403 (user blocked bot)
                if "403" in error_str or "blocked" in error_str.lower():
                    logger.info(f"User {user_id} blocked bot")
                    return False
                
                # Retry on 429 (rate limit)
                if "429" in error_str:
                    logger.warning(f"Rate limit hit, will retry")
                    raise
                
                logger.error(f"Error sending notification to user {user_id}: {e}")
                raise
    
    # Run async function
    return asyncio.run(_send())


@celery_app.task(
    bind=True,
    base=NotificationTask,
    name="tasks.notify_discount_redeemed"
)
def notify_discount_redeemed(
    self,
    user_id: int,
    code: str
):
    """
    Notify user that their discount was redeemed.
    
    Args:
        user_id: User ID
        code: Discount code
    """
    return send_user_notification(
        user_id=user_id,
        template_key="discount_used",
        context={"code": code}
    )


@celery_app.task(
    bind=True,
    name="tasks.notify_admins_about_error"
)
def notify_admins_about_error(
    self,
    notification_group: str,
    message: str,
    details: dict = None
):
    """
    Notify admins about system error.
    
    Args:
        notification_group: Admin notification group
        message: Error message
        details: Additional error details
    """
    import asyncio
    
    async def _notify():
        async with AsyncSessionLocal() as db:
            from models.admin import Admin
            from sqlalchemy import select
            
            # Get admins in notification group
            result = await db.execute(
                select(Admin).where(
                    Admin.notification_groups.contains([notification_group])
                )
            )
            admins = result.scalars().all()
            
            if not admins:
                logger.warning(f"No admins in notification group '{notification_group}'")
                return
            
            # Format message
            full_message = f"🚨 {message}"
            
            if details:
                full_message += f"\n\nDetails: {details}"
            
            # Send to all admins
            bot = get_auth_bot_client()
            success_count = 0
            
            for admin in admins:
                try:
                    await bot.send_message(
                        chat_id=admin.telegram_id,
                        text=full_message
                    )
                    success_count += 1
                
                except Exception as e:
                    logger.error(f"Error notifying admin {admin.id}: {e}")
            
            logger.info(
                f"Notified {success_count}/{len(admins)} admins in group '{notification_group}'"
            )
    
    # Run async function
    asyncio.run(_notify())


@celery_app.task(
    bind=True,
    base=NotificationTask,
    name="tasks.send_birthday_discount"
)
def send_birthday_discount(
    self,
    user_id: int,
    code: str,
    expires_at: str
):
    """
    Send birthday discount notification.
    
    Args:
        user_id: User ID
        code: Discount code
        expires_at: Expiry date string
    """
    return send_user_notification(
        user_id=user_id,
        template_key="birthday_discount",
        context={
            "code": code,
            "expires_at": expires_at
        }
    )


@celery_app.task(
    bind=True,
    base=NotificationTask,
    name="tasks.send_subscription_discount"
)
def send_subscription_discount(
    self,
    user_id: int,
    code: str,
    expires_at: str
):
    """
    Send subscription discount notification.
    
    Args:
        user_id: User ID
        code: Discount code
        expires_at: Expiry date string
    """
    return send_user_notification(
        user_id=user_id,
        template_key="subscription_discount",
        context={
            "code": code,
            "expires_at": expires_at
        }
    )


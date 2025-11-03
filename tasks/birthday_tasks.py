"""Birthday tasks for checking and sending birthday discounts."""
import logging
from datetime import datetime
from sqlalchemy import select, extract

from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from core.utils import utc_to_vvo, get_now_vvo
from models.user import User, UserStatus
from models.discount_template import DiscountTemplateType
from services.discount_service import create_discount_for_user
from services.audit_service import log_discount_issued
from tasks.notification_tasks import send_birthday_discount

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.check_birthdays")
def check_birthdays():
    """
    Check for today's birthdays and send discount codes.
    
    This task runs daily at 09:00 VVO.
    Finds users with birthday today, checks if they received birthday discount this year,
    and issues new discount if not.
    """
    import asyncio
    
    async def _check():
        async with AsyncSessionLocal() as db:
            # Get current date in VVO timezone
            today_vvo = get_now_vvo().date()
            
            logger.info(f"Checking birthdays for {today_vvo}")
            
            # Find users with birthday today
            result = await db.execute(
                select(User).where(
                    User.status == UserStatus.ACTIVE,
                    User.birthday.isnot(None),
                    extract('month', User.birthday) == today_vvo.month,
                    extract('day', User.birthday) == today_vvo.day
                )
            )
            
            users = result.scalars().all()
            
            if not users:
                logger.info("No birthdays today")
                return
            
            logger.info(f"Found {len(users)} users with birthday today")
            
            # Process each user
            success_count = 0
            
            for user in users:
                try:
                    # Check if user already received birthday discount this year
                    from models.discount import Discount
                    from models.discount_template import DiscountTemplate
                    
                    existing_result = await db.execute(
                        select(Discount)
                        .join(DiscountTemplate)
                        .where(
                            Discount.user_id == user.id,
                            DiscountTemplate.template_type == DiscountTemplateType.BIRTHDAY,
                            extract('year', Discount.created_at) == today_vvo.year
                        )
                        .limit(1)
                    )
                    
                    existing_discount = existing_result.scalar_one_or_none()
                    
                    if existing_discount:
                        logger.info(
                            f"User {user.id} already received birthday discount this year"
                        )
                        continue
                    
                    # Create birthday discount
                    discount = await create_discount_for_user(
                        db,
                        user_id=user.id,
                        template_type=DiscountTemplateType.BIRTHDAY,
                        is_test=user.is_test
                    )
                    
                    if not discount:
                        logger.error(f"Failed to create discount for user {user.id}")
                        continue
                    
                    # Log action
                    await log_discount_issued(
                        db,
                        discount_id=discount.id,
                        user_id=user.id,
                        template_type="birthday",
                        is_test=user.is_test
                    )
                    
                    await db.commit()
                    
                    # Send notification (async)
                    expires_at_str = discount.expires_at.strftime("%d.%m.%Y")
                    
                    send_birthday_discount.delay(
                        user_id=user.id,
                        code=discount.code,
                        expires_at=expires_at_str
                    )
                    
                    success_count += 1
                    logger.info(
                        f"Birthday discount issued to user {user.id}: {discount.code}"
                    )
                
                except Exception as e:
                    logger.error(f"Error processing birthday for user {user.id}: {e}")
                    continue
            
            logger.info(
                f"Birthday check completed: {success_count}/{len(users)} discounts issued"
            )
    
    # Run async function
    asyncio.run(_check())


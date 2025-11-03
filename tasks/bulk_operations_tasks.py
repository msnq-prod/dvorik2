"""Bulk operations tasks for mass data processing."""
import logging
from typing import List
from sqlalchemy import select

from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from models.user import User
from models.discount_template import DiscountTemplateType
from services.discount_service import create_discount_for_user
from services.audit_service import log_discount_issued

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.bulk_add_tags")
def bulk_add_tags(user_ids: List[int], tags: List[str]):
    """
    Add tags to multiple users.
    
    Args:
        user_ids: List of user IDs
        tags: List of tags to add
    """
    import asyncio
    
    async def _add_tags():
        async with AsyncSessionLocal() as db:
            # Get users
            result = await db.execute(
                select(User).where(User.id.in_(user_ids))
            )
            users = result.scalars().all()
            
            logger.info(f"Adding tags to {len(users)} users")
            
            # Add tags
            success_count = 0
            
            for user in users:
                try:
                    # Add tags (avoid duplicates)
                    current_tags = set(user.tags or [])
                    new_tags = current_tags.union(set(tags))
                    user.tags = list(new_tags)[:20]  # Max 20 tags
                    success_count += 1
                
                except Exception as e:
                    logger.error(f"Error adding tags to user {user.id}: {e}")
            
            await db.commit()
            
            logger.info(f"Tags added to {success_count}/{len(users)} users")
    
    # Run async function
    asyncio.run(_add_tags())


@celery_app.task(name="tasks.bulk_remove_tags")
def bulk_remove_tags(user_ids: List[int], tags: List[str]):
    """
    Remove tags from multiple users.
    
    Args:
        user_ids: List of user IDs
        tags: List of tags to remove
    """
    import asyncio
    
    async def _remove_tags():
        async with AsyncSessionLocal() as db:
            # Get users
            result = await db.execute(
                select(User).where(User.id.in_(user_ids))
            )
            users = result.scalars().all()
            
            logger.info(f"Removing tags from {len(users)} users")
            
            # Remove tags
            success_count = 0
            
            for user in users:
                try:
                    # Remove tags
                    current_tags = set(user.tags or [])
                    remaining_tags = current_tags - set(tags)
                    user.tags = list(remaining_tags)
                    success_count += 1
                
                except Exception as e:
                    logger.error(f"Error removing tags from user {user.id}: {e}")
            
            await db.commit()
            
            logger.info(f"Tags removed from {success_count}/{len(users)} users")
    
    # Run async function
    asyncio.run(_remove_tags())


@celery_app.task(name="tasks.bulk_assign_discount")
def bulk_assign_discount(user_ids: List[int]):
    """
    Assign manual discount to multiple users.
    
    Args:
        user_ids: List of user IDs
    """
    import asyncio
    
    async def _assign_discounts():
        async with AsyncSessionLocal() as db:
            # Get users
            result = await db.execute(
                select(User).where(User.id.in_(user_ids))
            )
            users = result.scalars().all()
            
            logger.info(f"Assigning discounts to {len(users)} users")
            
            # Assign discounts
            success_count = 0
            
            for user in users:
                try:
                    # Create discount
                    discount = await create_discount_for_user(
                        db,
                        user_id=user.id,
                        template_type=DiscountTemplateType.MANUAL,
                        is_test=user.is_test
                    )
                    
                    if discount:
                        # Log action
                        await log_discount_issued(
                            db,
                            discount_id=discount.id,
                            user_id=user.id,
                            template_type="manual",
                            is_test=user.is_test
                        )
                        
                        success_count += 1
                    else:
                        logger.warning(f"Failed to create discount for user {user.id}")
                
                except Exception as e:
                    logger.error(f"Error assigning discount to user {user.id}: {e}")
            
            await db.commit()
            
            logger.info(f"Discounts assigned to {success_count}/{len(users)} users")
    
    # Run async function
    asyncio.run(_assign_discounts())


@celery_app.task(name="tasks.bulk_export")
def bulk_export(export_type: str, filters: dict):
    """
    Export large datasets (>10k records).
    
    Args:
        export_type: Type of export (users, discounts, etc.)
        filters: Export filters
    
    Returns:
        Export file path or URL
    """
    import asyncio
    import csv
    import tempfile
    from datetime import datetime
    
    async def _export():
        async with AsyncSessionLocal() as db:
            logger.info(f"Starting bulk export: {export_type}")
            
            # Build query based on export type
            if export_type == "users":
                query = select(User)
                
                # Apply filters
                if filters.get("is_test") is not None:
                    query = query.where(User.is_test == filters["is_test"])
                
                if filters.get("status"):
                    query = query.where(User.status == filters["status"])
                
                # Execute query
                result = await db.execute(query)
                records = result.scalars().all()
                
                # Create CSV
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                filename = f"/tmp/users_export_{timestamp}.csv"
                
                with open(filename, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    
                    # Header
                    writer.writerow([
                        "ID", "Telegram ID", "First Name", "Last Name",
                        "Gender", "Birthday", "Phone", "Status",
                        "Is Subscribed", "Source", "Tags", "Created At"
                    ])
                    
                    # Data
                    for user in records:
                        writer.writerow([
                            user.id,
                            user.telegram_id,
                            user.first_name,
                            user.last_name,
                            user.gender.value if user.gender else "",
                            user.birthday.strftime("%Y-%m-%d") if user.birthday else "",
                            user.phone or "",
                            user.status.value,
                            user.is_subscribed,
                            user.source or "",
                            ",".join(user.tags or []),
                            user.created_at.strftime("%Y-%m-%d %H:%M:%S")
                        ])
                
                logger.info(f"Export completed: {len(records)} records, file: {filename}")
                return filename
            
            else:
                logger.error(f"Unknown export type: {export_type}")
                return None
    
    # Run async function
    return asyncio.run(_export())


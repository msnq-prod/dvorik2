"""User service for managing users."""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload

from models.user import User
from schemas.user import UserCreate, UserUpdate
from core.utils import normalize_source


async def get_user_by_telegram_id(
    db: AsyncSession,
    telegram_id: int
) -> Optional[User]:
    """
    Get user by Telegram ID.
    
    Args:
        db: Database session
        telegram_id: Telegram user ID
    
    Returns:
        User or None if not found
    """
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_id(
    db: AsyncSession,
    user_id: int
) -> Optional[User]:
    """
    Get user by ID.
    
    Args:
        db: Database session
        user_id: User ID
    
    Returns:
        User or None if not found
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def create_or_update_user(
    db: AsyncSession,
    telegram_id: int,
    data: dict,
    is_test: bool = False
) -> User:
    """
    Create or update user.
    
    Args:
        db: Database session
        telegram_id: Telegram user ID
        data: User data
        is_test: Whether this is test data
    
    Returns:
        Created or updated user
    """
    # Check if user exists
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if user:
        # Update existing user
        for key, value in data.items():
            if hasattr(user, key):
                setattr(user, key, value)
        
        # Update source_normalized if source changed
        if 'source' in data and data['source']:
            user.source_normalized = normalize_source(data['source'])
        
        # Update display_name
        user.display_name = user.compute_display_name()
        
    else:
        # Create new user
        user = User(
            telegram_id=telegram_id,
            is_test=is_test,
            **data
        )
        
        # Set source_normalized
        if user.source:
            user.source_normalized = normalize_source(user.source)
        
        # Set display_name
        user.display_name = user.compute_display_name()
        
        db.add(user)
    
    await db.flush()
    await db.refresh(user)
    
    return user


async def update_user(
    db: AsyncSession,
    user_id: int,
    data: UserUpdate
) -> Optional[User]:
    """
    Update user.
    
    Args:
        db: Database session
        user_id: User ID
        data: Update data
    
    Returns:
        Updated user or None if not found
    """
    user = await get_user_by_id(db, user_id)
    
    if not user:
        return None
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(user, key, value)
    
    # Update source_normalized if source changed
    if 'source' in update_data:
        user.source_normalized = normalize_source(user.source) if user.source else None
    
    # Update display_name
    user.display_name = user.compute_display_name()
    
    await db.flush()
    await db.refresh(user)
    
    return user


async def update_user_tags(
    db: AsyncSession,
    user_id: int,
    tags: list[str],
    operation: str = "set"
) -> Optional[User]:
    """
    Update user tags.
    
    Args:
        db: Database session
        user_id: User ID
        tags: Tags to add/remove/set
        operation: 'set', 'add', or 'remove'
    
    Returns:
        Updated user or None if not found
    """
    user = await get_user_by_id(db, user_id)
    
    if not user:
        return None
    
    current_tags = user.tags or []
    
    if operation == "set":
        user.tags = tags
    elif operation == "add":
        # Add new tags (avoid duplicates)
        existing = set(current_tags)
        for tag in tags:
            if tag not in existing:
                current_tags.append(tag)
        user.tags = current_tags
    elif operation == "remove":
        # Remove tags
        tags_to_remove = set(tags)
        user.tags = [t for t in current_tags if t not in tags_to_remove]
    
    await db.flush()
    await db.refresh(user)
    
    return user


async def bulk_add_tags(
    db: AsyncSession,
    user_ids: list[int],
    tags: list[str]
) -> int:
    """
    Add tags to multiple users.
    
    Args:
        db: Database session
        user_ids: List of user IDs
        tags: Tags to add
    
    Returns:
        Number of users updated
    """
    # This is a simplified version
    # For large datasets (>1000 users), use Celery task
    count = 0
    
    for user_id in user_ids:
        user = await update_user_tags(db, user_id, tags, operation="add")
        if user:
            count += 1
    
    return count


async def bulk_remove_tags(
    db: AsyncSession,
    user_ids: list[int],
    tags: list[str]
) -> int:
    """
    Remove tags from multiple users.
    
    Args:
        db: Database session
        user_ids: List of user IDs
        tags: Tags to remove
    
    Returns:
        Number of users updated
    """
    count = 0
    
    for user_id in user_ids:
        user = await update_user_tags(db, user_id, tags, operation="remove")
        if user:
            count += 1
    
    return count


async def check_recurrence(
    db: AsyncSession,
    user_id: int,
    template_type: str
) -> tuple[bool, Optional[datetime]]:
    """
    Check if user can receive discount again based on recurrence rule.
    
    Args:
        db: Database session
        user_id: User ID
        template_type: Template type to check
    
    Returns:
        Tuple of (can_receive, last_issued_at)
    """
    from models.discount import Discount
    from models.discount_template import DiscountTemplate
    
    # Get last discount of this type for user
    result = await db.execute(
        select(Discount)
        .join(DiscountTemplate)
        .where(
            Discount.user_id == user_id,
            DiscountTemplate.template_type == template_type
        )
        .order_by(Discount.created_at.desc())
        .limit(1)
    )
    
    last_discount = result.scalar_one_or_none()
    
    if not last_discount:
        # No previous discount, can receive
        return True, None
    
    # Get template to check recurrence rule
    template = last_discount.template
    
    if not template.recurrence:
        # No recurrence rule, can only receive once
        return False, last_discount.created_at
    
    # Check recurrence period
    recurrence_days = template.get_recurrence_days()
    
    if recurrence_days is None:
        return False, last_discount.created_at
    
    # Calculate if enough time has passed
    from datetime import timedelta
    time_passed = datetime.utcnow() - last_discount.created_at
    
    if time_passed.days >= recurrence_days:
        return True, last_discount.created_at
    else:
        return False, last_discount.created_at


async def get_users_count(
    db: AsyncSession,
    is_test: bool = False
) -> int:
    """
    Get total users count.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        Users count
    """
    result = await db.execute(
        select(func.count(User.id)).where(User.is_test == is_test)
    )
    return result.scalar() or 0


async def get_active_users_count(
    db: AsyncSession,
    is_test: bool = False
) -> int:
    """
    Get active users count.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        Active users count
    """
    from models.user import UserStatus
    
    result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.status == UserStatus.ACTIVE
        )
    )
    return result.scalar() or 0


async def get_subscribers_count(
    db: AsyncSession,
    is_test: bool = False
) -> int:
    """
    Get subscribers count.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        Subscribers count
    """
    result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.is_subscribed == True
        )
    )
    return result.scalar() or 0


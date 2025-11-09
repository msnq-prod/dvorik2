"""Discount template service."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.discount_template import DiscountTemplate, DiscountTemplateType
from schemas.discount_template import DiscountTemplateCreate, DiscountTemplateUpdate


async def get_template_by_id(
    db: AsyncSession,
    template_id: int
) -> Optional[DiscountTemplate]:
    """
    Get template by ID.
    
    Args:
        db: Database session
        template_id: Template ID
    
    Returns:
        Template or None
    """
    result = await db.execute(
        select(DiscountTemplate).where(DiscountTemplate.id == template_id)
    )
    return result.scalar_one_or_none()


async def get_active_template(
    db: AsyncSession,
    template_type: DiscountTemplateType
) -> Optional[DiscountTemplate]:
    """
    Get active template by type.
    
    Args:
        db: Database session
        template_type: Template type
    
    Returns:
        Active template or None
    """
    result = await db.execute(
        select(DiscountTemplate).where(
            DiscountTemplate.template_type == template_type,
            DiscountTemplate.is_active == True
        )
    )
    return result.scalar_one_or_none()


async def get_all_templates(
    db: AsyncSession,
    is_test: bool = False
) -> List[DiscountTemplate]:
    """
    Get all templates.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        List of templates
    """
    result = await db.execute(
        select(DiscountTemplate).where(
            DiscountTemplate.is_test == is_test
        ).order_by(DiscountTemplate.created_at.desc())
    )
    return list(result.scalars().all())


async def create_template(
    db: AsyncSession,
    data: DiscountTemplateCreate,
    is_test: bool = False
) -> DiscountTemplate:
    """
    Create discount template.
    
    Args:
        db: Database session
        data: Template data
        is_test: Whether this is test data
    
    Returns:
        Created template
    """
    template = DiscountTemplate(
        **data.model_dump(),
        is_test=is_test
    )
    
    db.add(template)
    await db.flush()
    await db.refresh(template)
    
    return template


async def update_template(
    db: AsyncSession,
    template_id: int,
    data: DiscountTemplateUpdate
) -> Optional[DiscountTemplate]:
    """
    Update discount template.
    
    Args:
        db: Database session
        template_id: Template ID
        data: Update data
    
    Returns:
        Updated template or None
    """
    template = await get_template_by_id(db, template_id)
    
    if not template:
        return None
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(template, key, value)
    
    await db.flush()
    await db.refresh(template)
    
    return template


async def check_recurrence_rule(
    db: AsyncSession,
    user_id: int,
    template: DiscountTemplate
) -> tuple[bool, Optional[str]]:
    """
    Check if user can receive discount based on recurrence rule.
    
    Args:
        db: Database session
        user_id: User ID
        template: Discount template
    
    Returns:
        Tuple of (can_receive, error_message)
    """
    from models.discount import Discount
    from datetime import datetime, timedelta
    
    if not template.recurrence:
        # No recurrence rule, check if user ever received this type
        result = await db.execute(
            select(Discount).where(
                Discount.user_id == user_id,
                Discount.template_id == template.id
            ).limit(1)
        )
        
        existing = result.scalar_one_or_none()
        
        if existing:
            return False, "You can only receive this discount once"
        
        return True, None
    
    # Get recurrence period
    recurrence_days = template.get_recurrence_days()
    
    if recurrence_days is None:
        return False, "Invalid recurrence rule"
    
    # Get last discount of this type
    result = await db.execute(
        select(Discount).where(
            Discount.user_id == user_id,
            Discount.template_id == template.id
        ).order_by(Discount.created_at.desc()).limit(1)
    )
    
    last_discount = result.scalar_one_or_none()
    
    if not last_discount:
        # No previous discount
        return True, None
    
    # Check if enough time passed
    time_passed = datetime.utcnow() - last_discount.created_at
    
    if time_passed.days >= recurrence_days:
        return True, None
    else:
        days_remaining = recurrence_days - time_passed.days
        return False, f"You can receive this discount again in {days_remaining} days"


async def calculate_expiry_date(
    template: DiscountTemplate
) -> datetime:
    """
    Calculate expiry date based on template.
    
    Args:
        template: Discount template
    
    Returns:
        Expiry datetime
    """
    from core.utils import calculate_expiry_date as calc_expiry
    
    return calc_expiry(template.validity_days)


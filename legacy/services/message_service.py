"""Message template service."""
from typing import Optional, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.message_template import MessageTemplate


async def get_template_by_key(
    db: AsyncSession,
    key: str
) -> Optional[MessageTemplate]:
    """
    Get message template by key.
    
    Args:
        db: Database session
        key: Template key
    
    Returns:
        Message template or None
    """
    result = await db.execute(
        select(MessageTemplate).where(MessageTemplate.key == key)
    )
    return result.scalar_one_or_none()


async def get_all_templates(
    db: AsyncSession
) -> List[MessageTemplate]:
    """
    Get all message templates.
    
    Args:
        db: Database session
    
    Returns:
        List of templates
    """
    result = await db.execute(
        select(MessageTemplate).order_by(MessageTemplate.key)
    )
    return list(result.scalars().all())


async def render_template(
    db: AsyncSession,
    key: str,
    context: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """
    Render message template with context.
    
    Args:
        db: Database session
        key: Template key
        context: Context variables for rendering
    
    Returns:
        Rendered message or None if template not found
    """
    template = await get_template_by_key(db, key)
    
    if not template:
        return None
    
    return template.render(context or {})


async def update_template(
    db: AsyncSession,
    key: str,
    text: str
) -> Optional[MessageTemplate]:
    """
    Update message template text.
    
    Args:
        db: Database session
        key: Template key
        text: New template text
    
    Returns:
        Updated template or None
    """
    template = await get_template_by_key(db, key)
    
    if not template:
        return None
    
    template.text = text
    
    await db.flush()
    await db.refresh(template)
    
    return template


async def create_template(
    db: AsyncSession,
    key: str,
    text: str,
    description: Optional[str] = None
) -> MessageTemplate:
    """
    Create message template.
    
    Args:
        db: Database session
        key: Template key
        text: Template text
        description: Template description
    
    Returns:
        Created template
    """
    template = MessageTemplate(
        key=key,
        text=text,
        description=description
    )
    
    db.add(template)
    await db.flush()
    await db.refresh(template)
    
    return template


# Shorthand functions for common templates

async def get_welcome_message(db: AsyncSession, user_name: str) -> str:
    """Get welcome message."""
    return await render_template(db, "welcome", {"name": user_name}) or ""


async def get_subscription_success_message(db: AsyncSession) -> str:
    """Get subscription success message."""
    return await render_template(db, "subscription_success") or ""


async def get_subscription_discount_message(
    db: AsyncSession,
    code: str,
    expires_at: str
) -> str:
    """Get subscription discount message."""
    return await render_template(db, "subscription_discount", {
        "code": code,
        "expires_at": expires_at
    }) or ""


async def get_birthday_discount_message(
    db: AsyncSession,
    code: str,
    expires_at: str
) -> str:
    """Get birthday discount message."""
    return await render_template(db, "birthday_discount", {
        "code": code,
        "expires_at": expires_at
    }) or ""


async def get_discount_used_message(
    db: AsyncSession,
    code: str
) -> str:
    """Get discount used notification message."""
    return await render_template(db, "discount_used", {
        "code": code
    }) or ""


async def get_discount_not_valid_message(db: AsyncSession) -> str:
    """Get discount not valid message."""
    return await render_template(db, "discount_not_valid") or ""


async def get_discount_expired_message(db: AsyncSession) -> str:
    """Get discount expired message."""
    return await render_template(db, "discount_expired") or ""


async def get_cashier_approved_message(db: AsyncSession) -> str:
    """Get cashier approval message."""
    return await render_template(db, "cashier_approved") or ""


async def get_cashier_rejected_message(db: AsyncSession) -> str:
    """Get cashier rejection message."""
    return await render_template(db, "cashier_rejected") or ""


async def get_help_message(db: AsyncSession) -> str:
    """Get help message."""
    return await render_template(db, "help") or ""


async def get_error_message(db: AsyncSession) -> str:
    """Get generic error message."""
    return await render_template(db, "error") or ""


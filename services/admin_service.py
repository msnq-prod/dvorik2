"""Admin service for managing admin users."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.admin import Admin, AdminRole
from core.security import hash_password, verify_password


async def get_admin_by_id(
    db: AsyncSession,
    admin_id: int
) -> Optional[Admin]:
    """
    Get admin by ID.
    
    Args:
        db: Database session
        admin_id: Admin ID
    
    Returns:
        Admin or None
    """
    result = await db.execute(
        select(Admin).where(Admin.id == admin_id)
    )
    return result.scalar_one_or_none()


async def get_admin_by_telegram_id(
    db: AsyncSession,
    telegram_id: int
) -> Optional[Admin]:
    """
    Get admin by Telegram ID.
    
    Args:
        db: Database session
        telegram_id: Telegram ID
    
    Returns:
        Admin or None
    """
    result = await db.execute(
        select(Admin).where(Admin.telegram_id == telegram_id)
    )
    return result.scalar_one_or_none()


async def get_admin_by_email(
    db: AsyncSession,
    email: str
) -> Optional[Admin]:
    """
    Get admin by email.
    
    Args:
        db: Database session
        email: Email address
    
    Returns:
        Admin or None
    """
    result = await db.execute(
        select(Admin).where(Admin.email == email)
    )
    return result.scalar_one_or_none()


async def get_all_admins(
    db: AsyncSession,
    is_test: bool = False
) -> List[Admin]:
    """
    Get all admins.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        List of admins
    """
    result = await db.execute(
        select(Admin).where(
            Admin.is_test == is_test
        ).order_by(Admin.created_at.desc())
    )
    return list(result.scalars().all())


async def create_admin(
    db: AsyncSession,
    email: str,
    password: str,
    telegram_id: int,
    full_name: str,
    role: AdminRole = AdminRole.READONLY,
    is_test: bool = False
) -> Admin:
    """
    Create admin.
    
    Args:
        db: Database session
        email: Email
        password: Plain text password
        telegram_id: Telegram ID
        full_name: Full name
        role: Admin role
        is_test: Whether this is test data
    
    Returns:
        Created admin
    """
    hashed_password = hash_password(password)
    
    admin = Admin(
        email=email,
        hashed_password=hashed_password,
        telegram_id=telegram_id,
        full_name=full_name,
        role=role,
        is_test=is_test
    )
    
    db.add(admin)
    await db.flush()
    await db.refresh(admin)
    
    return admin


async def authenticate_admin(
    db: AsyncSession,
    email: str,
    password: str
) -> Optional[Admin]:
    """
    Authenticate admin by email and password.
    
    Args:
        db: Database session
        email: Email
        password: Plain text password
    
    Returns:
        Admin if authenticated, None otherwise
    """
    admin = await get_admin_by_email(db, email)
    
    if not admin:
        return None
    
    if not verify_password(password, admin.hashed_password):
        return None
    
    return admin


async def update_admin_password(
    db: AsyncSession,
    admin_id: int,
    new_password: str
) -> Optional[Admin]:
    """
    Update admin password.
    
    Args:
        db: Database session
        admin_id: Admin ID
        new_password: New plain text password
    
    Returns:
        Updated admin or None
    """
    admin = await get_admin_by_id(db, admin_id)
    
    if not admin:
        return None
    
    admin.hashed_password = hash_password(new_password)
    
    await db.flush()
    await db.refresh(admin)
    
    return admin


async def update_admin_role(
    db: AsyncSession,
    admin_id: int,
    new_role: AdminRole
) -> Optional[Admin]:
    """
    Update admin role.
    
    Args:
        db: Database session
        admin_id: Admin ID
        new_role: New role
    
    Returns:
        Updated admin or None
    """
    admin = await get_admin_by_id(db, admin_id)
    
    if not admin:
        return None
    
    admin.role = new_role
    
    await db.flush()
    await db.refresh(admin)
    
    return admin


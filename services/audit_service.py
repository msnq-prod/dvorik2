"""Audit service for logging system actions."""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.audit_log import AuditLog, AuditAction


async def log_action(
    db: AsyncSession,
    action: AuditAction,
    admin_id: Optional[int] = None,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    payload: Optional[Dict[str, Any]] = None,
    is_test: bool = False
) -> AuditLog:
    """
    Log audit action.
    
    Args:
        db: Database session
        action: Action type
        admin_id: Admin who performed action
        user_id: Affected user
        entity_type: Entity type (e.g., 'discount', 'broadcast')
        entity_id: Entity ID
        payload: Additional JSON payload
        is_test: Whether this is test data
    
    Returns:
        Created audit log
    """
    log_entry = AuditLog(
        action=action,
        admin_id=admin_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        is_test=is_test
    )
    
    db.add(log_entry)
    await db.flush()
    
    return log_entry


async def get_logs_by_admin(
    db: AsyncSession,
    admin_id: int,
    limit: int = 100
) -> List[AuditLog]:
    """
    Get audit logs by admin.
    
    Args:
        db: Database session
        admin_id: Admin ID
        limit: Max results
    
    Returns:
        List of audit logs
    """
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.admin_id == admin_id
        ).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_logs_by_user(
    db: AsyncSession,
    user_id: int,
    limit: int = 100
) -> List[AuditLog]:
    """
    Get audit logs by user.
    
    Args:
        db: Database session
        user_id: User ID
        limit: Max results
    
    Returns:
        List of audit logs
    """
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.user_id == user_id
        ).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_logs_by_entity(
    db: AsyncSession,
    entity_type: str,
    entity_id: int,
    limit: int = 100
) -> List[AuditLog]:
    """
    Get audit logs by entity.
    
    Args:
        db: Database session
        entity_type: Entity type
        entity_id: Entity ID
        limit: Max results
    
    Returns:
        List of audit logs
    """
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id
        ).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


# Convenience methods for specific actions

async def log_user_created(
    db: AsyncSession,
    user_id: int,
    admin_id: Optional[int] = None,
    source: Optional[str] = None,
    is_test: bool = False
) -> AuditLog:
    """Log user creation."""
    return await log_action(
        db,
        action=AuditAction.USER_CREATED,
        admin_id=admin_id,
        user_id=user_id,
        entity_type="user",
        entity_id=user_id,
        payload={"source": source} if source else None,
        is_test=is_test
    )


async def log_user_updated(
    db: AsyncSession,
    user_id: int,
    admin_id: Optional[int] = None,
    changes: Optional[Dict[str, Any]] = None,
    is_test: bool = False
) -> AuditLog:
    """Log user update."""
    return await log_action(
        db,
        action=AuditAction.USER_UPDATED,
        admin_id=admin_id,
        user_id=user_id,
        entity_type="user",
        entity_id=user_id,
        payload={"changes": changes} if changes else None,
        is_test=is_test
    )


async def log_discount_issued(
    db: AsyncSession,
    discount_id: int,
    user_id: int,
    template_type: str,
    is_test: bool = False
) -> AuditLog:
    """Log discount issuance."""
    return await log_action(
        db,
        action=AuditAction.DISCOUNT_ISSUED,
        user_id=user_id,
        entity_type="discount",
        entity_id=discount_id,
        payload={"template_type": template_type},
        is_test=is_test
    )


async def log_discount_redeemed(
    db: AsyncSession,
    discount_id: int,
    user_id: int,
    cashier_id: int,
    is_test: bool = False
) -> AuditLog:
    """Log discount redemption."""
    return await log_action(
        db,
        action=AuditAction.DISCOUNT_REDEEMED,
        user_id=user_id,
        entity_type="discount",
        entity_id=discount_id,
        payload={"cashier_id": cashier_id},
        is_test=is_test
    )


async def log_broadcast_created(
    db: AsyncSession,
    broadcast_id: int,
    admin_id: int,
    is_test: bool = False
) -> AuditLog:
    """Log broadcast creation."""
    return await log_action(
        db,
        action=AuditAction.BROADCAST_CREATED,
        admin_id=admin_id,
        entity_type="broadcast",
        entity_id=broadcast_id,
        is_test=is_test
    )


async def log_broadcast_sent(
    db: AsyncSession,
    broadcast_id: int,
    admin_id: Optional[int] = None,
    stats: Optional[Dict[str, int]] = None,
    is_test: bool = False
) -> AuditLog:
    """Log broadcast sent."""
    return await log_action(
        db,
        action=AuditAction.BROADCAST_SENT,
        admin_id=admin_id,
        entity_type="broadcast",
        entity_id=broadcast_id,
        payload=stats,
        is_test=is_test
    )


async def log_admin_login(
    db: AsyncSession,
    admin_id: int,
    is_test: bool = False
) -> AuditLog:
    """Log admin login."""
    return await log_action(
        db,
        action=AuditAction.ADMIN_LOGIN,
        admin_id=admin_id,
        entity_type="admin",
        entity_id=admin_id,
        is_test=is_test
    )


async def log_settings_changed(
    db: AsyncSession,
    admin_id: int,
    changes: Dict[str, Any],
    is_test: bool = False
) -> AuditLog:
    """Log settings change."""
    return await log_action(
        db,
        action=AuditAction.SETTINGS_CHANGED,
        admin_id=admin_id,
        entity_type="settings",
        payload={"changes": changes},
        is_test=is_test
    )


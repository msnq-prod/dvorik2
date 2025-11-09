"""Discounts router for managing discount codes."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from core.database import get_db
from core.dependencies import get_current_admin, require_role
from models.admin import Admin, AdminRole
from models.discount import Discount
from models.discount_template import DiscountTemplateType
from schemas.discount import (
    DiscountCreate,
    DiscountPublic,
    DiscountFilter,
    DiscountStats
)
from schemas.error import ErrorResponse, MachineErrorCode
from services.discount_service import create_discount_for_user
from services.audit_service import log_discount_issued

router = APIRouter(prefix="/api/v1/discounts", tags=["Discounts"])


@router.get(
    "",
    response_model=List[DiscountPublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_discounts(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_test: Optional[bool] = Query(None),
    template_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of discounts with pagination and filters.
    
    Args:
        page: Page number (1-based)
        per_page: Results per page (max 100)
        user_id: Filter by user ID
        status: Filter by status (active, used, expired)
        is_test: Filter by test flag
        template_id: Filter by template ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of discounts
    """
    # Build query
    query = select(Discount)
    
    # Apply filters
    if user_id:
        query = query.where(Discount.user_id == user_id)
    
    if is_test is not None:
        query = query.where(Discount.is_test == is_test)
    
    if template_id:
        query = query.where(Discount.template_id == template_id)
    
    if status == "active":
        query = query.where(
            Discount.is_active == True,
            Discount.used_at.is_(None),
            Discount.expires_at > datetime.utcnow()
        )
    elif status == "used":
        query = query.where(Discount.used_at.isnot(None))
    elif status == "expired":
        query = query.where(
            Discount.expires_at <= datetime.utcnow(),
            Discount.used_at.is_(None)
        )
    
    # Apply pagination
    offset = (page - 1) * per_page
    query = query.order_by(Discount.created_at.desc()).offset(offset).limit(per_page)
    
    # Execute
    result = await db.execute(query)
    discounts = result.scalars().all()
    
    return [DiscountPublic.model_validate(discount) for discount in discounts]


@router.get(
    "/{discount_id}",
    response_model=DiscountPublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_discount(
    discount_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get discount by ID.
    
    Args:
        discount_id: Discount ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Discount data
    
    Raises:
        404: Discount not found
    """
    result = await db.execute(
        select(Discount).where(Discount.id == discount_id)
    )
    discount = result.scalar_one_or_none()
    
    if not discount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.DISCOUNT_NOT_FOUND.value,
                "message": "Discount not found"
            }
        )
    
    return DiscountPublic.model_validate(discount)


@router.post(
    "",
    response_model=DiscountPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def create_discount(
    data: DiscountCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Manually issue discount to user.
    
    Only owners and marketing admins can manually issue discounts.
    
    Args:
        data: Discount creation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Created discount
    
    Raises:
        403: Insufficient permissions
        404: User or template not found
    """
    # Check if user exists
    from models.user import User
    
    result = await db.execute(
        select(User).where(User.id == data.user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.USER_NOT_FOUND.value,
                "message": "User not found"
            }
        )
    
    # Create discount
    discount = await create_discount_for_user(
        db,
        user_id=data.user_id,
        template_type=DiscountTemplateType.MANUAL,
        is_test=user.is_test
    )
    
    if not discount:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": MachineErrorCode.DISCOUNT_CREATION_FAILED.value,
                "message": "Failed to create discount"
            }
        )
    
    # Log action
    await log_discount_issued(
        db,
        discount_id=discount.id,
        user_id=user.id,
        template_type="manual",
        is_test=user.is_test
    )
    
    await db.commit()
    
    return DiscountPublic.model_validate(discount)


@router.get(
    "/stats/overview",
    response_model=DiscountStats,
    responses={401: {"model": ErrorResponse}}
)
async def get_discount_stats(
    is_test: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get discount statistics.
    
    Args:
        is_test: Filter by test flag
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Discount statistics
    """
    # Total issued
    total_result = await db.execute(
        select(func.count(Discount.id)).where(Discount.is_test == is_test)
    )
    total = total_result.scalar() or 0
    
    # Active (not used, not expired)
    active_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.is_active == True,
            Discount.used_at.is_(None),
            Discount.expires_at > datetime.utcnow()
        )
    )
    active = active_result.scalar() or 0
    
    # Used
    used_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.used_at.isnot(None)
        )
    )
    used = used_result.scalar() or 0
    
    # Expired (not used, expired)
    expired_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.used_at.is_(None),
            Discount.expires_at <= datetime.utcnow()
        )
    )
    expired = expired_result.scalar() or 0
    
    return DiscountStats(
        total_issued=total,
        active=active,
        used=used,
        expired=expired,
        redemption_rate=(used / total * 100) if total > 0 else 0
    )


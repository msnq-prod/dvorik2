"""Users router for managing users."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from core.database import get_db
from core.dependencies import get_current_admin
from models.admin import Admin, AdminRole
from models.user import User
from schemas.user import (
    UserPublic,
    UserPublicWithPhone,
    UserUpdate,
    UserFilter,
    UserBulkAction,
    UserStats
)
from schemas.error import ErrorResponse, MachineErrorCode
from services.user_service import get_user_by_id, update_user, get_all_users
from services.audit_service import log_user_updated

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


@router.get(
    "",
    response_model=List[UserPublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    is_test: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    is_subscribed: Optional[bool] = Query(None),
    source: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of users with pagination and filters.
    
    Args:
        page: Page number (1-based)
        per_page: Results per page (max 100)
        is_test: Filter by test flag
        status: Filter by status
        is_subscribed: Filter by subscription status
        source: Filter by source
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of users
    """
    # Build query
    query = select(User)
    
    # Apply filters
    if is_test is not None:
        query = query.where(User.is_test == is_test)
    
    if status:
        query = query.where(User.status == status)
    
    if is_subscribed is not None:
        query = query.where(User.is_subscribed == is_subscribed)
    
    if source:
        query = query.where(User.source_normalized == source.lower())
    
    # Apply pagination
    offset = (page - 1) * per_page
    query = query.order_by(User.created_at.desc()).offset(offset).limit(per_page)
    
    # Execute
    result = await db.execute(query)
    users = result.scalars().all()
    
    # Convert to response model based on admin role
    if current_admin.role == AdminRole.READONLY:
        # Hide phone for readonly
        return [UserPublic.model_validate(user) for user in users]
    else:
        # Show phone for owner/marketing
        return [UserPublicWithPhone.model_validate(user) for user in users]


@router.get(
    "/{user_id}",
    response_model=UserPublicWithPhone,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get user by ID.
    
    Args:
        user_id: User ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        User data
    
    Raises:
        404: User not found
    """
    user = await get_user_by_id(db, user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.USER_NOT_FOUND.value,
                "message": "User not found"
            }
        )
    
    # Return with or without phone based on role
    if current_admin.role == AdminRole.READONLY:
        return UserPublic.model_validate(user)
    else:
        return UserPublicWithPhone.model_validate(user)


@router.patch(
    "/{user_id}",
    response_model=UserPublicWithPhone,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def update_user_endpoint(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update user data.
    
    Args:
        user_id: User ID
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated user data
    
    Raises:
        403: Insufficient permissions
        404: User not found
    """
    # Check permissions
    if current_admin.role == AdminRole.READONLY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": MachineErrorCode.PERMISSION_DENIED.value,
                "message": "Read-only admins cannot update users"
            }
        )
    
    # Update user
    user = await update_user(db, user_id, data)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.USER_NOT_FOUND.value,
                "message": "User not found"
            }
        )
    
    # Log action
    await log_user_updated(
        db,
        user_id=user_id,
        admin_id=current_admin.id,
        changes=data.model_dump(exclude_unset=True),
        is_test=user.is_test
    )
    
    await db.commit()
    
    return UserPublicWithPhone.model_validate(user)


@router.post(
    "/bulk",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    }
)
async def bulk_action(
    action: UserBulkAction,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Perform bulk action on multiple users.
    
    Actions:
    - add_tags: Add tags to users
    - remove_tags: Remove tags from users
    - assign_discount: Assign discount to users
    
    Args:
        action: Bulk action data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Action result
    
    Raises:
        403: Insufficient permissions
    """
    # Check permissions
    if current_admin.role == AdminRole.READONLY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": MachineErrorCode.PERMISSION_DENIED.value,
                "message": "Read-only admins cannot perform bulk actions"
            }
        )
    
    # Get users
    result = await db.execute(
        select(User).where(User.id.in_(action.user_ids))
    )
    users = result.scalars().all()
    
    success_count = 0
    
    if action.action == "add_tags":
        for user in users:
            # Add tags (avoid duplicates)
            current_tags = set(user.tags or [])
            new_tags = current_tags.union(set(action.tags or []))
            user.tags = list(new_tags)[:20]  # Max 20 tags
            success_count += 1
    
    elif action.action == "remove_tags":
        for user in users:
            # Remove tags
            current_tags = set(user.tags or [])
            remaining_tags = current_tags - set(action.tags or [])
            user.tags = list(remaining_tags)
            success_count += 1
    
    elif action.action == "assign_discount":
        # Import here to avoid circular imports
        from services.discount_service import create_discount_for_user
        from models.discount_template import DiscountTemplateType
        
        for user in users:
            discount = await create_discount_for_user(
                db,
                user_id=user.id,
                template_type=DiscountTemplateType.MANUAL,
                is_test=user.is_test
            )
            
            if discount:
                success_count += 1
    
    await db.commit()
    
    return {
        "success": True,
        "action": action.action,
        "total_users": len(action.user_ids),
        "success_count": success_count
    }


@router.get(
    "/stats/overview",
    response_model=UserStats,
    responses={401: {"model": ErrorResponse}}
)
async def get_user_stats(
    is_test: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get user statistics.
    
    Args:
        is_test: Filter by test flag
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        User statistics
    """
    # Total users
    total_result = await db.execute(
        select(func.count(User.id)).where(User.is_test == is_test)
    )
    total = total_result.scalar() or 0
    
    # Active users
    active_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.status == "active"
        )
    )
    active = active_result.scalar() or 0
    
    # Subscribed users
    subscribed_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.is_subscribed == True
        )
    )
    subscribed = subscribed_result.scalar() or 0
    
    return UserStats(
        total=total,
        active=active,
        blocked=total - active,
        subscribed=subscribed
    )


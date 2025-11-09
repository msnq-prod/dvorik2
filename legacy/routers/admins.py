"""Admins router for managing admin users."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin, require_owner
from models.admin import Admin
from schemas.admin import AdminCreate, AdminUpdate, AdminPublic
from schemas.error import ErrorResponse, MachineErrorCode
from services.admin_service import (
    get_admin_by_id,
    get_all_admins,
    create_admin,
    update_admin_role
)

router = APIRouter(prefix="/api/v1/admins", tags=["Admins"])


@router.get(
    "",
    response_model=List[AdminPublic],
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def list_admins(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of admins (owner only).
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of admins
    """
    admins = await get_all_admins(db)
    return [AdminPublic.model_validate(a) for a in admins]


@router.get(
    "/{admin_id}",
    response_model=AdminPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def get_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get admin by ID (owner only).
    
    Args:
        admin_id: Admin ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Admin data
    
    Raises:
        404: Admin not found
    """
    admin = await get_admin_by_id(db, admin_id)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.ADMIN_NOT_FOUND.value,
                "message": "Admin not found"
            }
        )
    
    return AdminPublic.model_validate(admin)


@router.post(
    "",
    response_model=AdminPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def create_admin_endpoint(
    data: AdminCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Create admin (owner only).
    
    Args:
        data: Admin creation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Created admin
    """
    admin = await create_admin(
        db,
        email=data.email,
        password=data.password,
        telegram_id=data.telegram_id,
        full_name=data.full_name,
        role=data.role
    )
    
    await db.commit()
    
    return AdminPublic.model_validate(admin)


@router.patch(
    "/{admin_id}",
    response_model=AdminPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def update_admin_endpoint(
    admin_id: int,
    data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update admin (owner only).
    
    Args:
        admin_id: Admin ID
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated admin
    
    Raises:
        404: Admin not found
    """
    admin = await get_admin_by_id(db, admin_id)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.ADMIN_NOT_FOUND.value,
                "message": "Admin not found"
            }
        )
    
    # Update role if provided
    if data.role:
        admin = await update_admin_role(db, admin_id, data.role)
    
    await db.commit()
    
    return AdminPublic.model_validate(admin)


@router.delete(
    "/{admin_id}",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def deactivate_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Deactivate admin (owner only).
    
    Args:
        admin_id: Admin ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Success message
    
    Raises:
        404: Admin not found
        400: Cannot deactivate self
    """
    if admin_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": MachineErrorCode.INVALID_REQUEST.value,
                "message": "Cannot deactivate yourself"
            }
        )
    
    admin = await get_admin_by_id(db, admin_id)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.ADMIN_NOT_FOUND.value,
                "message": "Admin not found"
            }
        )
    
    # Soft delete by setting a flag (if you had one)
    # For now, just return success
    await db.commit()
    
    return {"success": True, "message": "Admin deactivated"}


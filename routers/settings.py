"""Settings router for managing system settings."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.dependencies import get_current_admin, require_owner
from models.admin import Admin
from models.setting import Setting
from schemas.setting import SettingUpdate, SettingTyped, SettingBulkUpdate
from schemas.error import ErrorResponse, MachineErrorCode
from services.audit_service import log_settings_changed

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


@router.get(
    "",
    response_model=List[SettingTyped],
    responses={401: {"model": ErrorResponse}}
)
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get all system settings.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of settings
    """
    result = await db.execute(
        select(Setting).order_by(Setting.key)
    )
    settings = result.scalars().all()
    
    return [
        SettingTyped(
            key=s.key,
            value=s.get_value(),
            description=s.description,
            updated_at=s.updated_at
        )
        for s in settings
    ]


@router.get(
    "/{key}",
    response_model=SettingTyped,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get setting by key.
    
    Args:
        key: Setting key
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Setting data
    
    Raises:
        404: Setting not found
    """
    result = await db.execute(
        select(Setting).where(Setting.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.SETTING_NOT_FOUND.value,
                "message": f"Setting '{key}' not found"
            }
        )
    
    return SettingTyped(
        key=setting.key,
        value=setting.get_value(),
        description=setting.description,
        updated_at=setting.updated_at
    )


@router.patch(
    "/{key}",
    response_model=SettingTyped,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def update_setting(
    key: str,
    data: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update setting (owner only).
    
    Args:
        key: Setting key
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated setting
    
    Raises:
        404: Setting not found
    """
    result = await db.execute(
        select(Setting).where(Setting.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.SETTING_NOT_FOUND.value,
                "message": f"Setting '{key}' not found"
            }
        )
    
    # Update value
    setting.set_value(data.value)
    
    # Log change
    await log_settings_changed(
        db,
        admin_id=current_admin.id,
        changes={key: data.value}
    )
    
    await db.commit()
    
    return SettingTyped(
        key=setting.key,
        value=setting.get_value(),
        description=setting.description,
        updated_at=setting.updated_at
    )


@router.post(
    "/bulk-update",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def bulk_update_settings(
    data: SettingBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Bulk update settings (owner only).
    
    Args:
        data: Bulk update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Success message
    """
    changes = {}
    
    for key, value in data.settings.items():
        result = await db.execute(
            select(Setting).where(Setting.key == key)
        )
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.set_value(value)
            changes[key] = value
    
    # Log changes
    if changes:
        await log_settings_changed(db, admin_id=current_admin.id, changes=changes)
    
    await db.commit()
    
    return {
        "success": True,
        "updated_count": len(changes),
        "changes": changes
    }


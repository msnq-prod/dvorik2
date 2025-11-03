"""Cashiers router for managing cashier users."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.dependencies import get_current_admin, require_owner
from models.admin import Admin
from models.cashier import Cashier
from schemas.admin import CashierPublic, CashierActivate
from schemas.error import ErrorResponse, MachineErrorCode
from services.notification_service import send_cashier_approval

router = APIRouter(prefix="/api/v1/cashiers", tags=["Cashiers"])


@router.get(
    "",
    response_model=List[CashierPublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_cashiers(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of cashiers.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of cashiers
    """
    result = await db.execute(
        select(Cashier).order_by(Cashier.created_at.desc())
    )
    cashiers = result.scalars().all()
    
    return [CashierPublic.model_validate(c) for c in cashiers]


@router.get(
    "/{cashier_id}",
    response_model=CashierPublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_cashier(
    cashier_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get cashier by ID.
    
    Args:
        cashier_id: Cashier ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Cashier data
    
    Raises:
        404: Cashier not found
    """
    result = await db.execute(
        select(Cashier).where(Cashier.id == cashier_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.CASHIER_NOT_FOUND.value,
                "message": "Cashier not found"
            }
        )
    
    return CashierPublic.model_validate(cashier)


@router.post(
    "/{cashier_id}/activate",
    response_model=CashierPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def activate_cashier(
    cashier_id: int,
    data: CashierActivate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Activate cashier (owner only).
    
    Args:
        cashier_id: Cashier ID
        data: Activation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Activated cashier
    
    Raises:
        404: Cashier not found
    """
    result = await db.execute(
        select(Cashier).where(Cashier.id == cashier_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.CASHIER_NOT_FOUND.value,
                "message": "Cashier not found"
            }
        )
    
    # Activate cashier
    cashier.is_active = True
    cashier.approved_by_admin_id = current_admin.id
    
    if data.store_id:
        cashier.store_id = data.store_id
    
    # Send notification
    await send_cashier_approval(db, cashier.telegram_id, approved=True)
    
    await db.commit()
    
    return CashierPublic.model_validate(cashier)


@router.post(
    "/{cashier_id}/deactivate",
    response_model=CashierPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def deactivate_cashier(
    cashier_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Deactivate cashier (owner only).
    
    Args:
        cashier_id: Cashier ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Deactivated cashier
    
    Raises:
        404: Cashier not found
    """
    result = await db.execute(
        select(Cashier).where(Cashier.id == cashier_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.CASHIER_NOT_FOUND.value,
                "message": "Cashier not found"
            }
        )
    
    # Deactivate cashier
    cashier.is_active = False
    
    # Send notification
    await send_cashier_approval(db, cashier.telegram_id, approved=False)
    
    await db.commit()
    
    return CashierPublic.model_validate(cashier)


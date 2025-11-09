"""Broadcasts router for managing message campaigns."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin, require_owner, require_role
from models.admin import Admin, AdminRole
from models.broadcast import Broadcast, BroadcastStatus
from schemas.broadcast import (
    BroadcastCreate,
    BroadcastUpdate,
    BroadcastPublic,
    BroadcastSchedule,
    BroadcastSendNow,
    BroadcastStats,
    BroadcastRecipientCount
)
from schemas.error import ErrorResponse, MachineErrorCode
from services.broadcast_service import (
    get_broadcast_by_id,
    create_broadcast,
    update_broadcast,
    count_recipients,
    schedule_broadcast,
    send_broadcast_now
)
from services.audit_service import log_broadcast_created

router = APIRouter(prefix="/api/v1/broadcasts", tags=["Broadcasts"])


@router.get(
    "",
    response_model=List[BroadcastPublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_broadcasts(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of broadcasts.
    
    Args:
        page: Page number (1-based)
        per_page: Results per page (max 100)
        status: Filter by status
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of broadcasts
    """
    from sqlalchemy import select
    
    query = select(Broadcast)
    
    if status:
        query = query.where(Broadcast.status == status)
    
    offset = (page - 1) * per_page
    query = query.order_by(Broadcast.created_at.desc()).offset(offset).limit(per_page)
    
    result = await db.execute(query)
    broadcasts = result.scalars().all()
    
    return [BroadcastPublic.model_validate(b) for b in broadcasts]


@router.get(
    "/{broadcast_id}",
    response_model=BroadcastPublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get broadcast by ID.
    
    Args:
        broadcast_id: Broadcast ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Broadcast data
    
    Raises:
        404: Broadcast not found
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.BROADCAST_NOT_FOUND.value,
                "message": "Broadcast not found"
            }
        )
    
    return BroadcastPublic.model_validate(broadcast)


@router.post(
    "",
    response_model=BroadcastPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def create_broadcast_endpoint(
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Create broadcast (owner/marketing only).
    
    Args:
        data: Broadcast creation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Created broadcast
    """
    # Count recipients
    recipient_count = await count_recipients(
        db,
        filters=data.filters,
        segment_id=data.segment_id,
        is_test=False
    )
    
    # Create broadcast
    broadcast = await create_broadcast(db, data, current_admin.id)
    broadcast.recipient_count = recipient_count
    
    # Log action
    await log_broadcast_created(db, broadcast.id, current_admin.id)
    
    await db.commit()
    
    return BroadcastPublic.model_validate(broadcast)


@router.patch(
    "/{broadcast_id}",
    response_model=BroadcastPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def update_broadcast_endpoint(
    broadcast_id: int,
    data: BroadcastUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update broadcast (only in draft status).
    
    Args:
        broadcast_id: Broadcast ID
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated broadcast
    
    Raises:
        404: Broadcast not found
        400: Broadcast is not in draft status
    """
    broadcast = await update_broadcast(db, broadcast_id, data)
    
    if not broadcast:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": MachineErrorCode.BROADCAST_NOT_EDITABLE.value,
                "message": "Broadcast is not editable (only draft broadcasts can be updated)"
            }
        )
    
    await db.commit()
    
    return BroadcastPublic.model_validate(broadcast)


@router.post(
    "/{broadcast_id}/schedule",
    response_model=BroadcastPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def schedule_broadcast_endpoint(
    broadcast_id: int,
    data: BroadcastSchedule,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Schedule broadcast for later sending.
    
    Args:
        broadcast_id: Broadcast ID
        data: Schedule data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Scheduled broadcast
    
    Raises:
        404: Broadcast not found
        400: Invalid state transition
    """
    broadcast = await schedule_broadcast(db, broadcast_id, data.send_at)
    
    if not broadcast:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": MachineErrorCode.BROADCAST_INVALID_STATE.value,
                "message": "Cannot schedule broadcast in current state"
            }
        )
    
    await db.commit()
    
    return BroadcastPublic.model_validate(broadcast)


@router.post(
    "/{broadcast_id}/send-now",
    response_model=BroadcastPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def send_broadcast_now_endpoint(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Send broadcast immediately (owner only).
    
    Args:
        broadcast_id: Broadcast ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Broadcast in sending state
    
    Raises:
        404: Broadcast not found
        400: Invalid state transition
    """
    broadcast = await send_broadcast_now(db, broadcast_id)
    
    if not broadcast:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": MachineErrorCode.BROADCAST_INVALID_STATE.value,
                "message": "Cannot send broadcast in current state"
            }
        )
    
    await db.commit()
    
    return BroadcastPublic.model_validate(broadcast)


@router.get(
    "/{broadcast_id}/stats",
    response_model=BroadcastStats,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_broadcast_stats(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get broadcast statistics.
    
    Args:
        broadcast_id: Broadcast ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Broadcast statistics
    
    Raises:
        404: Broadcast not found
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.BROADCAST_NOT_FOUND.value,
                "message": "Broadcast not found"
            }
        )
    
    return BroadcastStats(
        broadcast_id=broadcast.id,
        status=broadcast.status.value,
        recipient_count=broadcast.recipient_count or 0,
        success_count=broadcast.success_count or 0,
        error_count=broadcast.error_count or 0,
        send_at=broadcast.send_at,
        completed_at=broadcast.completed_at
    )


@router.post(
    "/count-recipients",
    response_model=BroadcastRecipientCount,
    responses={401: {"model": ErrorResponse}}
)
async def count_broadcast_recipients(
    filters: Optional[dict] = None,
    segment_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Count recipients for broadcast based on filters/segment.
    
    Args:
        filters: Custom filters
        segment_id: Segment ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Recipient count
    """
    count = await count_recipients(db, filters, segment_id)
    
    return BroadcastRecipientCount(count=count)


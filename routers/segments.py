"""Segments router for user segmentation."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin, require_role
from models.admin import Admin, AdminRole
from schemas.segment import (
    SegmentCreate,
    SegmentUpdate,
    SegmentPublic,
    SegmentCount
)
from schemas.error import ErrorResponse, MachineErrorCode
from services.segment_service import (
    get_segment_by_id,
    get_all_segments,
    create_segment,
    update_segment,
    count_segment_users
)

router = APIRouter(prefix="/api/v1/segments", tags=["Segments"])


@router.get(
    "",
    response_model=List[SegmentPublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_segments(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of segments.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of segments
    """
    segments = await get_all_segments(db)
    return [SegmentPublic.model_validate(s) for s in segments]


@router.get(
    "/{segment_id}",
    response_model=SegmentPublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_segment(
    segment_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get segment by ID.
    
    Args:
        segment_id: Segment ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Segment data
    
    Raises:
        404: Segment not found
    """
    segment = await get_segment_by_id(db, segment_id)
    
    if not segment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.SEGMENT_NOT_FOUND.value,
                "message": "Segment not found"
            }
        )
    
    return SegmentPublic.model_validate(segment)


@router.post(
    "",
    response_model=SegmentPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def create_segment_endpoint(
    data: SegmentCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Create segment (owner/marketing only).
    
    Args:
        data: Segment creation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Created segment
    """
    segment = await create_segment(db, data)
    await db.commit()
    
    return SegmentPublic.model_validate(segment)


@router.patch(
    "/{segment_id}",
    response_model=SegmentPublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def update_segment_endpoint(
    segment_id: int,
    data: SegmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update segment (owner/marketing only).
    
    Args:
        segment_id: Segment ID
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated segment
    
    Raises:
        404: Segment not found
    """
    segment = await update_segment(db, segment_id, data)
    
    if not segment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.SEGMENT_NOT_FOUND.value,
                "message": "Segment not found"
            }
        )
    
    await db.commit()
    
    return SegmentPublic.model_validate(segment)


@router.get(
    "/{segment_id}/count",
    response_model=SegmentCount,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def count_segment_users_endpoint(
    segment_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Count users in segment.
    
    Args:
        segment_id: Segment ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        User count
    
    Raises:
        404: Segment not found
    """
    segment = await get_segment_by_id(db, segment_id)
    
    if not segment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.SEGMENT_NOT_FOUND.value,
                "message": "Segment not found"
            }
        )
    
    count = await count_segment_users(db, segment_id)
    
    return SegmentCount(segment_id=segment_id, user_count=count)


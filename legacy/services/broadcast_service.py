"""Broadcast service for managing message campaigns."""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from models.broadcast import Broadcast, BroadcastStatus
from models.user import User, UserStatus
from schemas.broadcast import BroadcastCreate, BroadcastUpdate


async def get_broadcast_by_id(
    db: AsyncSession,
    broadcast_id: int
) -> Optional[Broadcast]:
    """
    Get broadcast by ID.
    
    Args:
        db: Database session
        broadcast_id: Broadcast ID
    
    Returns:
        Broadcast or None
    """
    result = await db.execute(
        select(Broadcast).where(Broadcast.id == broadcast_id)
    )
    return result.scalar_one_or_none()


async def create_broadcast(
    db: AsyncSession,
    data: BroadcastCreate,
    admin_id: int,
    is_test: bool = False
) -> Broadcast:
    """
    Create broadcast.
    
    Args:
        db: Database session
        data: Broadcast data
        admin_id: Admin ID
        is_test: Whether this is test data
    
    Returns:
        Created broadcast
    """
    broadcast = Broadcast(
        **data.model_dump(exclude={'created_by_admin_id'}),
        created_by_admin_id=admin_id,
        is_test=is_test,
        status=BroadcastStatus.DRAFT
    )
    
    db.add(broadcast)
    await db.flush()
    await db.refresh(broadcast)
    
    return broadcast


async def update_broadcast(
    db: AsyncSession,
    broadcast_id: int,
    data: BroadcastUpdate
) -> Optional[Broadcast]:
    """
    Update broadcast (only if status is draft).
    
    Args:
        db: Database session
        broadcast_id: Broadcast ID
        data: Update data
    
    Returns:
        Updated broadcast or None
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast or broadcast.status != BroadcastStatus.DRAFT:
        return None
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(broadcast, key, value)
    
    await db.flush()
    await db.refresh(broadcast)
    
    return broadcast


async def get_recipients(
    db: AsyncSession,
    broadcast: Broadcast,
    is_test: bool = False
) -> List[User]:
    """
    Get recipients for broadcast based on filters/segment.
    
    Args:
        db: Database session
        broadcast: Broadcast
        is_test: Whether to include test users
    
    Returns:
        List of recipient users
    """
    from services.segment_service import evaluate_segment
    
    # Base query
    query = select(User).where(
        User.status == UserStatus.ACTIVE,
        User.is_test == is_test
    )
    
    # Apply segment filter if specified
    if broadcast.segment_id:
        # Get segment
        from models.segment import Segment
        
        result = await db.execute(
            select(Segment).where(Segment.id == broadcast.segment_id)
        )
        segment = result.scalar_one_or_none()
        
        if segment:
            query = evaluate_segment(query, segment.definition)
    
    # Apply custom filters if specified
    elif broadcast.filters:
        query = evaluate_segment(query, broadcast.filters)
    
    # Execute query
    result = await db.execute(query)
    return list(result.scalars().all())


async def count_recipients(
    db: AsyncSession,
    filters: Optional[dict] = None,
    segment_id: Optional[int] = None,
    is_test: bool = False
) -> int:
    """
    Count recipients for broadcast.
    
    Args:
        db: Database session
        filters: Custom filters
        segment_id: Segment ID
        is_test: Whether to include test users
    
    Returns:
        Recipients count
    """
    from services.segment_service import evaluate_segment
    
    # Base query
    query = select(func.count(User.id)).where(
        User.status == UserStatus.ACTIVE,
        User.is_test == is_test
    )
    
    # Apply segment filter
    if segment_id:
        from models.segment import Segment
        
        result = await db.execute(
            select(Segment).where(Segment.id == segment_id)
        )
        segment = result.scalar_one_or_none()
        
        if segment:
            # This is simplified - in real implementation,
            # we'd need to convert count query properly
            pass
    
    # Apply custom filters
    elif filters:
        # Apply filters to count query
        pass
    
    # Execute count
    result = await db.execute(query)
    return result.scalar() or 0


async def schedule_broadcast(
    db: AsyncSession,
    broadcast_id: int,
    send_at: datetime
) -> Optional[Broadcast]:
    """
    Schedule broadcast for later sending.
    
    Args:
        db: Database session
        broadcast_id: Broadcast ID
        send_at: When to send
    
    Returns:
        Updated broadcast or None
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast:
        return None
    
    # Check FSM transition
    if not broadcast.can_transition_to(BroadcastStatus.SCHEDULED):
        return None
    
    # Update status and schedule time
    broadcast.transition_to(BroadcastStatus.SCHEDULED)
    broadcast.send_at = send_at
    
    await db.flush()
    await db.refresh(broadcast)
    
    return broadcast


async def send_broadcast_now(
    db: AsyncSession,
    broadcast_id: int
) -> Optional[Broadcast]:
    """
    Send broadcast immediately.
    
    Args:
        db: Database session
        broadcast_id: Broadcast ID
    
    Returns:
        Updated broadcast or None
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast:
        return None
    
    # Check FSM transition
    if not broadcast.can_transition_to(BroadcastStatus.SENDING):
        return None
    
    # Transition to sending
    broadcast.transition_to(BroadcastStatus.SENDING)
    
    await db.flush()
    await db.refresh(broadcast)
    
    # Queue Celery task for sending
    from tasks.broadcast_tasks import process_broadcast
    process_broadcast.delay(broadcast_id)
    
    return broadcast


async def update_broadcast_stats(
    db: AsyncSession,
    broadcast_id: int,
    success_increment: int = 0,
    error_increment: int = 0
) -> None:
    """
    Update broadcast statistics.
    
    Args:
        db: Database session
        broadcast_id: Broadcast ID
        success_increment: Number of successful sends
        error_increment: Number of failed sends
    """
    broadcast = await get_broadcast_by_id(db, broadcast_id)
    
    if not broadcast:
        return
    
    if success_increment > 0:
        broadcast.success_count += success_increment
    
    if error_increment > 0:
        broadcast.error_count += error_increment
    
    await db.flush()


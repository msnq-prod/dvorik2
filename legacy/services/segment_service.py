"""Segment service for user segmentation."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.sql import Select

from models.segment import Segment
from models.user import User, UserGender, UserStatus
from schemas.segment import SegmentCreate, SegmentUpdate


async def get_segment_by_id(
    db: AsyncSession,
    segment_id: int
) -> Optional[Segment]:
    """
    Get segment by ID.
    
    Args:
        db: Database session
        segment_id: Segment ID
    
    Returns:
        Segment or None
    """
    result = await db.execute(
        select(Segment).where(Segment.id == segment_id)
    )
    return result.scalar_one_or_none()


async def get_all_segments(
    db: AsyncSession,
    is_test: bool = False
) -> List[Segment]:
    """
    Get all segments.
    
    Args:
        db: Database session
        is_test: Filter by test flag
    
    Returns:
        List of segments
    """
    result = await db.execute(
        select(Segment).where(
            Segment.is_test == is_test
        ).order_by(Segment.created_at.desc())
    )
    return list(result.scalars().all())


async def create_segment(
    db: AsyncSession,
    data: SegmentCreate,
    is_test: bool = False
) -> Segment:
    """
    Create segment.
    
    Args:
        db: Database session
        data: Segment data
        is_test: Whether this is test data
    
    Returns:
        Created segment
    """
    segment = Segment(
        **data.model_dump(),
        is_test=is_test
    )
    
    db.add(segment)
    await db.flush()
    await db.refresh(segment)
    
    return segment


async def update_segment(
    db: AsyncSession,
    segment_id: int,
    data: SegmentUpdate
) -> Optional[Segment]:
    """
    Update segment.
    
    Args:
        db: Database session
        segment_id: Segment ID
        data: Update data
    
    Returns:
        Updated segment or None
    """
    segment = await get_segment_by_id(db, segment_id)
    
    if not segment:
        return None
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(segment, key, value)
    
    await db.flush()
    await db.refresh(segment)
    
    return segment


def evaluate_segment(query: Select, definition: dict) -> Select:
    """
    Apply segment definition filters to query.
    
    Args:
        query: Base SQLAlchemy query
        definition: Segment definition dict
    
    Returns:
        Modified query with filters applied
    """
    # Apply status filter
    if 'status' in definition:
        status = UserStatus(definition['status'])
        query = query.where(User.status == status)
    
    # Apply is_subscribed filter
    if 'is_subscribed' in definition:
        query = query.where(User.is_subscribed == definition['is_subscribed'])
    
    # Apply tags filter
    if 'tags' in definition and definition['tags']:
        # User must have at least one of the specified tags
        from sqlalchemy import or_
        
        tag_conditions = []
        for tag in definition['tags']:
            tag_conditions.append(User.tags.contains([tag]))
        
        if tag_conditions:
            query = query.where(or_(*tag_conditions))
    
    # Apply source filter
    if 'source' in definition:
        query = query.where(User.source == definition['source'])
    
    if 'source_normalized' in definition:
        query = query.where(User.source_normalized == definition['source_normalized'])
    
    # Apply gender filter
    if 'gender' in definition:
        gender = UserGender(definition['gender'])
        query = query.where(User.gender == gender)
    
    # Apply birthday month filter
    if 'birthday_month' in definition:
        from sqlalchemy import extract
        month = definition['birthday_month']
        query = query.where(extract('month', User.birthday) == month)
    
    # Apply date filters
    if 'created_after' in definition:
        query = query.where(User.created_at >= definition['created_after'])
    
    if 'created_before' in definition:
        query = query.where(User.created_at <= definition['created_before'])
    
    return query


async def get_segment_users(
    db: AsyncSession,
    segment_id: int,
    is_test: bool = False
) -> List[User]:
    """
    Get users matching segment definition.
    
    Args:
        db: Database session
        segment_id: Segment ID
        is_test: Whether to include test users
    
    Returns:
        List of users
    """
    segment = await get_segment_by_id(db, segment_id)
    
    if not segment:
        return []
    
    # Build query
    query = select(User).where(User.is_test == is_test)
    query = evaluate_segment(query, segment.definition)
    
    # Execute
    result = await db.execute(query)
    return list(result.scalars().all())


async def count_segment_users(
    db: AsyncSession,
    segment_id: int,
    is_test: bool = False
) -> int:
    """
    Count users matching segment definition.
    
    Args:
        db: Database session
        segment_id: Segment ID
        is_test: Whether to include test users
    
    Returns:
        Users count
    """
    segment = await get_segment_by_id(db, segment_id)
    
    if not segment:
        return 0
    
    # Build count query
    query = select(func.count(User.id)).where(User.is_test == is_test)
    
    # Apply segment filters
    # Note: This is simplified, may need adjustment for complex queries
    if 'status' in segment.definition:
        status = UserStatus(segment.definition['status'])
        query = query.where(User.status == status)
    
    if 'is_subscribed' in segment.definition:
        query = query.where(User.is_subscribed == segment.definition['is_subscribed'])
    
    # Execute
    result = await db.execute(query)
    return result.scalar() or 0


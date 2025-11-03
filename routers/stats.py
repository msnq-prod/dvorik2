"""Statistics router for KPI and analytics."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta

from core.database import get_db
from core.dependencies import get_current_admin
from models.admin import Admin
from models.user import User
from models.discount import Discount
from models.discount_usage_log import DiscountUsageLog, DiscountUsageStatus
from models.broadcast import Broadcast
from schemas.error import ErrorResponse
from pydantic import BaseModel


class KPIStats(BaseModel):
    """KPI statistics schema."""
    total_users: int
    active_users: int
    subscribed_users: int
    total_discounts_issued: int
    total_discounts_redeemed: int
    redemption_rate: float
    total_broadcasts_sent: int
    period_start: datetime
    period_end: datetime


class DetailedStats(BaseModel):
    """Detailed statistics schema."""
    new_users_count: int
    new_subscriptions_count: int
    discounts_issued_count: int
    discounts_redeemed_count: int
    broadcasts_sent_count: int
    period_start: datetime
    period_end: datetime


router = APIRouter(prefix="/api/v1/stats", tags=["Statistics"])


@router.get(
    "/kpi",
    response_model=KPIStats,
    responses={401: {"model": ErrorResponse}}
)
async def get_kpi_stats(
    days: int = Query(30, ge=1, le=365),
    is_test: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get KPI statistics for specified period.
    
    Args:
        days: Number of days to analyze
        is_test: Filter by test flag
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        KPI statistics
    """
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)
    
    # Total users
    total_users_result = await db.execute(
        select(func.count(User.id)).where(User.is_test == is_test)
    )
    total_users = total_users_result.scalar() or 0
    
    # Active users
    active_users_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.status == "active"
        )
    )
    active_users = active_users_result.scalar() or 0
    
    # Subscribed users
    subscribed_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.is_subscribed == True
        )
    )
    subscribed_users = subscribed_result.scalar() or 0
    
    # Total discounts issued
    issued_result = await db.execute(
        select(func.count(Discount.id)).where(Discount.is_test == is_test)
    )
    total_discounts_issued = issued_result.scalar() or 0
    
    # Total discounts redeemed
    redeemed_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.used_at.isnot(None)
        )
    )
    total_discounts_redeemed = redeemed_result.scalar() or 0
    
    # Redemption rate
    redemption_rate = (
        (total_discounts_redeemed / total_discounts_issued * 100)
        if total_discounts_issued > 0
        else 0.0
    )
    
    # Total broadcasts sent
    broadcasts_result = await db.execute(
        select(func.count(Broadcast.id)).where(
            Broadcast.is_test == is_test,
            Broadcast.status == "sent"
        )
    )
    total_broadcasts_sent = broadcasts_result.scalar() or 0
    
    return KPIStats(
        total_users=total_users,
        active_users=active_users,
        subscribed_users=subscribed_users,
        total_discounts_issued=total_discounts_issued,
        total_discounts_redeemed=total_discounts_redeemed,
        redemption_rate=round(redemption_rate, 2),
        total_broadcasts_sent=total_broadcasts_sent,
        period_start=period_start,
        period_end=period_end
    )


@router.get(
    "/detailed",
    response_model=DetailedStats,
    responses={401: {"model": ErrorResponse}}
)
async def get_detailed_stats(
    days: int = Query(30, ge=1, le=365),
    is_test: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get detailed statistics for specified period.
    
    Args:
        days: Number of days to analyze
        is_test: Filter by test flag
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Detailed statistics
    """
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)
    
    # New users in period
    new_users_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.created_at >= period_start
        )
    )
    new_users_count = new_users_result.scalar() or 0
    
    # New subscriptions in period
    # (users who subscribed in period)
    new_subs_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_test == is_test,
            User.is_subscribed == True,
            User.created_at >= period_start
        )
    )
    new_subscriptions_count = new_subs_result.scalar() or 0
    
    # Discounts issued in period
    issued_in_period_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.created_at >= period_start
        )
    )
    discounts_issued_count = issued_in_period_result.scalar() or 0
    
    # Discounts redeemed in period
    redeemed_in_period_result = await db.execute(
        select(func.count(Discount.id)).where(
            Discount.is_test == is_test,
            Discount.used_at >= period_start
        )
    )
    discounts_redeemed_count = redeemed_in_period_result.scalar() or 0
    
    # Broadcasts sent in period
    broadcasts_in_period_result = await db.execute(
        select(func.count(Broadcast.id)).where(
            Broadcast.is_test == is_test,
            Broadcast.status == "sent",
            Broadcast.completed_at >= period_start
        )
    )
    broadcasts_sent_count = broadcasts_in_period_result.scalar() or 0
    
    return DetailedStats(
        new_users_count=new_users_count,
        new_subscriptions_count=new_subscriptions_count,
        discounts_issued_count=discounts_issued_count,
        discounts_redeemed_count=discounts_redeemed_count,
        broadcasts_sent_count=broadcasts_sent_count,
        period_start=period_start,
        period_end=period_end
    )


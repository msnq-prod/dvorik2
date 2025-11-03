"""Discount usage log Pydantic schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from models.discount_usage_log import DiscountUsageStatus


class DiscountUsageLogBase(BaseModel):
    """Base discount usage log schema."""
    code: str = Field(..., max_length=32)
    status: DiscountUsageStatus
    message: Optional[str] = Field(None, max_length=512)


class DiscountUsageLogInDB(DiscountUsageLogBase):
    """Discount usage log schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    discount_id: Optional[int] = None
    cashier_id: Optional[int] = None
    store_id: Optional[int] = None
    user_not_notified: bool
    is_test: bool
    created_at: datetime


class DiscountUsageLogPublic(BaseModel):
    """Discount usage log schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    code: str
    status: DiscountUsageStatus
    message: Optional[str] = None
    created_at: datetime
    
    # Related data (optional, loaded separately)
    cashier_display_name: Optional[str] = None
    store_id: Optional[int] = None


class DiscountUsageLogFilter(BaseModel):
    """Schema for filtering discount usage logs."""
    discount_id: Optional[int] = Field(None, gt=0)
    cashier_id: Optional[int] = Field(None, gt=0)
    store_id: Optional[int] = None
    status: Optional[DiscountUsageStatus] = None
    code: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    is_test: bool = Field(default=False)
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class DiscountUsageStats(BaseModel):
    """Discount usage statistics schema."""
    total_attempts: int
    successful_redemptions: int
    failed_attempts: int
    success_rate: float  # Percentage
    
    # Breakdown by error type
    already_used_count: int
    not_found_count: int
    expired_count: int
    cashier_not_active_count: int


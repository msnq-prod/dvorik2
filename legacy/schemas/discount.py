"""Discount Pydantic schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class DiscountBase(BaseModel):
    """Base discount schema."""
    code: str = Field(..., min_length=7, max_length=32)
    template_id: int = Field(..., gt=0)
    user_id: int = Field(..., gt=0)
    expires_at: datetime
    is_active: bool = Field(default=True)


class DiscountCreate(BaseModel):
    """Schema for creating a discount."""
    user_id: int = Field(..., gt=0)
    template_id: int = Field(..., gt=0)


class DiscountInDB(DiscountBase):
    """Discount schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    is_test: bool


class DiscountPublic(BaseModel):
    """Discount schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    code: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    
    # Related data
    template_id: int
    template_name: Optional[str] = None
    discount_value: Optional[str] = None


class DiscountValidationRequest(BaseModel):
    """Schema for validating a discount code."""
    code: str = Field(..., min_length=1, max_length=32)
    cashier_id: int = Field(..., gt=0)


class DiscountValidationResponse(BaseModel):
    """Schema for discount validation response."""
    valid: bool
    discount_id: Optional[int] = None
    code: str
    user_display_name: Optional[str] = None
    discount_value: Optional[str] = None
    expires_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class DiscountRedeemRequest(BaseModel):
    """Schema for redeeming a discount."""
    discount_id: int = Field(..., gt=0)
    cashier_id: int = Field(..., gt=0)
    store_id: Optional[int] = None


class DiscountRedeemResponse(BaseModel):
    """Schema for discount redemption response."""
    success: bool
    discount_id: int
    code: str
    user_notified: bool = True
    message: str
    error_code: Optional[str] = None


class DiscountFilter(BaseModel):
    """Schema for filtering discounts."""
    user_id: Optional[int] = Field(None, gt=0)
    template_id: Optional[int] = Field(None, gt=0)
    code: Optional[str] = None
    is_active: Optional[bool] = None
    is_used: Optional[bool] = None
    is_expired: Optional[bool] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    expires_after: Optional[datetime] = None
    expires_before: Optional[datetime] = None
    is_test: bool = Field(default=False)
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class DiscountStats(BaseModel):
    """Discount statistics schema."""
    total_discounts: int
    active_discounts: int
    used_discounts: int
    expired_discounts: int
    usage_rate: float  # Percentage of used discounts


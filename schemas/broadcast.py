"""Broadcast Pydantic schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from models.broadcast import BroadcastStatus, BroadcastMediaType


class BroadcastBase(BaseModel):
    """Base broadcast schema."""
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    media_type: BroadcastMediaType = Field(default=BroadcastMediaType.NONE)
    media_file_id: Optional[str] = Field(None, max_length=255)
    buttons: Optional[dict] = None
    filters: Optional[dict] = None
    segment_id: Optional[int] = Field(None, gt=0)


class BroadcastCreate(BroadcastBase):
    """Schema for creating a broadcast."""
    created_by_admin_id: int = Field(..., gt=0)


class BroadcastUpdate(BaseModel):
    """Schema for updating a broadcast (only draft broadcasts)."""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    media_type: Optional[BroadcastMediaType] = None
    media_file_id: Optional[str] = Field(None, max_length=255)
    buttons: Optional[dict] = None
    filters: Optional[dict] = None
    segment_id: Optional[int] = Field(None, gt=0)


class BroadcastInDB(BroadcastBase):
    """Broadcast schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    status: BroadcastStatus
    send_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    recipient_count: int
    success_count: int
    error_count: int
    created_by_admin_id: int
    created_at: datetime
    updated_at: datetime
    is_test: bool


class BroadcastPublic(BroadcastBase):
    """Broadcast schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    status: BroadcastStatus
    send_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    recipient_count: int
    success_count: int
    error_count: int
    created_at: datetime
    updated_at: datetime


class BroadcastStatusUpdate(BaseModel):
    """Schema for updating broadcast status."""
    status: BroadcastStatus


class BroadcastSchedule(BaseModel):
    """Schema for scheduling a broadcast."""
    broadcast_id: int = Field(..., gt=0)
    send_at: datetime


class BroadcastSendNow(BaseModel):
    """Schema for sending a broadcast immediately."""
    broadcast_id: int = Field(..., gt=0)


class BroadcastFilter(BaseModel):
    """Schema for filtering broadcasts."""
    status: Optional[BroadcastStatus] = None
    created_by_admin_id: Optional[int] = Field(None, gt=0)
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    is_test: bool = Field(default=False)
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class BroadcastStats(BaseModel):
    """Broadcast statistics schema."""
    id: int
    title: str
    status: BroadcastStatus
    recipient_count: int
    success_count: int
    error_count: int
    delivery_rate: float  # Percentage
    sent_at: Optional[datetime] = None


class BroadcastRecipientCount(BaseModel):
    """Schema for recipient count response."""
    count: int
    filters: Optional[dict] = None
    segment_id: Optional[int] = None


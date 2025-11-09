"""System settings schemas."""
from typing import Optional, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

from models.setting import SettingValueType


class SettingBase(BaseModel):
    """Base setting schema."""
    key: str = Field(..., min_length=1, max_length=100)
    value: str = Field(..., description="Setting value as string")
    value_type: SettingValueType = Field(default=SettingValueType.STRING)
    description: Optional[str] = Field(None, max_length=255)


class SettingUpdate(BaseModel):
    """Schema for updating a setting."""
    value: str = Field(..., description="New setting value as string")


class SettingInDB(SettingBase):
    """Setting schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    updated_at: datetime
    updated_by_admin_id: Optional[int] = None


class SettingPublic(BaseModel):
    """Setting schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    key: str
    value: str
    value_type: SettingValueType
    description: Optional[str] = None
    updated_at: datetime


class SettingTyped(BaseModel):
    """Setting with typed value."""
    key: str
    value: Any = Field(..., description="Typed value (string, int, bool, or dict)")
    value_type: SettingValueType
    description: Optional[str] = None


class SettingBulkUpdate(BaseModel):
    """Schema for bulk settings update."""
    settings: dict[str, str] = Field(
        ...,
        description="Dictionary of key-value pairs to update"
    )


class SystemSettings(BaseModel):
    """All system settings grouped together."""
    telegram_channel_id: str
    rate_limit_per_minute: int
    birthday_hour: int
    birthday_minute: int
    auto_broadcast_from_admins: bool
    code_prefix: str
    subscription_cache_ttl: int
    default_discount_validity_days: int
    broadcast_groups: list[dict]
    notification_groups: list[str]


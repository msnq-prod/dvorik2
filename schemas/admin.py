"""Admin Pydantic schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from models.admin import AdminRole


class AdminBase(BaseModel):
    """Base admin schema."""
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    role: AdminRole
    can_broadcast_from_chat: bool = Field(default=False)
    is_active: bool = Field(default=True)
    notification_groups: Optional[list[str]] = None


class AdminCreate(BaseModel):
    """Schema for creating an admin."""
    telegram_id: int = Field(..., gt=0)
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    role: AdminRole
    can_broadcast_from_chat: bool = Field(default=False)
    notification_groups: Optional[list[str]] = None


class AdminUpdate(BaseModel):
    """Schema for updating an admin."""
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    role: Optional[AdminRole] = None
    can_broadcast_from_chat: Optional[bool] = None
    is_active: Optional[bool] = None
    notification_groups: Optional[list[str]] = None


class AdminInDB(AdminBase):
    """Admin schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    created_at: datetime
    updated_at: datetime
    is_test: bool


class AdminPublic(AdminBase):
    """Admin schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    created_at: datetime


class AdminLogin(BaseModel):
    """Schema for admin login."""
    one_time_token: str = Field(..., min_length=32, max_length=128)


class AdminLoginResponse(BaseModel):
    """Schema for login response."""
    access_token: str
    token_type: str = "bearer"
    admin: AdminPublic


class CashierBase(BaseModel):
    """Base cashier schema."""
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    is_active: bool = Field(default=False)
    store_id: Optional[int] = None


class CashierCreate(BaseModel):
    """Schema for creating a cashier."""
    telegram_id: int = Field(..., gt=0)
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    store_id: Optional[int] = None


class CashierUpdate(BaseModel):
    """Schema for updating a cashier."""
    username: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    store_id: Optional[int] = None


class CashierInDB(CashierBase):
    """Cashier schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    approved_by_admin_id: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CashierPublic(CashierBase):
    """Cashier schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    approved_at: Optional[datetime] = None


class CashierActivate(BaseModel):
    """Schema for activating a cashier."""
    cashier_id: int = Field(..., gt=0)
    admin_id: int = Field(..., gt=0)


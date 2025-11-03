"""User Pydantic schemas."""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

from models.user import UserGender, UserStatus


class UserBase(BaseModel):
    """Base user schema."""
    username: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=512)
    phone: Optional[str] = Field(None, max_length=20)
    gender: UserGender = Field(default=UserGender.UNKNOWN)
    birthday: Optional[date] = None
    source: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = None
    status: UserStatus = Field(default=UserStatus.ACTIVE)
    is_subscribed: bool = Field(default=False)


class UserCreate(BaseModel):
    """Schema for creating a user."""
    telegram_id: int = Field(..., gt=0)
    username: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    gender: UserGender = Field(default=UserGender.UNKNOWN)
    birthday: Optional[date] = None
    source: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = None
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        """Validate tags: max 20 tags, max 32 chars each."""
        if v is None:
            return v
        
        if len(v) > 20:
            raise ValueError('Maximum 20 tags allowed')
        
        for tag in v:
            if len(tag) > 32:
                raise ValueError(f'Tag "{tag}" exceeds 32 characters')
        
        return v


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    username: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    gender: Optional[UserGender] = None
    birthday: Optional[date] = None
    tags: Optional[list[str]] = None
    status: Optional[UserStatus] = None
    is_subscribed: Optional[bool] = None
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        """Validate tags: max 20 tags, max 32 chars each."""
        if v is None:
            return v
        
        if len(v) > 20:
            raise ValueError('Maximum 20 tags allowed')
        
        for tag in v:
            if len(tag) > 32:
                raise ValueError(f'Tag "{tag}" exceeds 32 characters')
        
        return v


class UserInDB(UserBase):
    """User schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    source_normalized: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_test: bool


class UserPublic(UserBase):
    """User schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    telegram_id: int
    created_at: datetime


class UserPublicWithPhone(UserPublic):
    """User schema with phone (for owner/marketing roles)."""
    phone: Optional[str] = None


class UserFilter(BaseModel):
    """Schema for filtering users."""
    telegram_id: Optional[int] = Field(None, gt=0)
    username: Optional[str] = None
    gender: Optional[UserGender] = None
    status: Optional[UserStatus] = None
    is_subscribed: Optional[bool] = None
    source_normalized: Optional[str] = None
    tags: Optional[list[str]] = None
    birthday_month: Optional[int] = Field(None, ge=1, le=12)
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    is_test: bool = Field(default=False)
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class UserBulkAction(BaseModel):
    """Schema for bulk user actions."""
    user_ids: list[int] = Field(..., min_length=1, max_length=10000)
    action: str = Field(..., pattern=r'^(add_tags|remove_tags|assign_discount)$')
    tags: Optional[list[str]] = None
    template_id: Optional[int] = None
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        """Validate tags if provided."""
        if v is None:
            return v
        
        if len(v) > 20:
            raise ValueError('Maximum 20 tags allowed')
        
        for tag in v:
            if len(tag) > 32:
                raise ValueError(f'Tag "{tag}" exceeds 32 characters')
        
        return v


class UserStats(BaseModel):
    """User statistics schema."""
    total_users: int
    active_users: int
    subscribers: int
    users_with_birthday_this_month: int
    new_users_this_month: int


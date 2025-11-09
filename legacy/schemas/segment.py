"""Segment Pydantic schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class SegmentBase(BaseModel):
    """Base segment schema."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=512)
    definition: dict = Field(...)
    is_active: bool = Field(default=True)
    
    @field_validator('definition')
    @classmethod
    def validate_definition(cls, v: dict) -> dict:
        """Validate segment definition structure."""
        if not isinstance(v, dict):
            raise ValueError('Definition must be a dictionary')
        
        # Define allowed keys
        allowed_keys = {
            'status', 'is_subscribed', 'tags', 'source', 'source_normalized',
            'gender', 'birthday_month', 'created_after', 'created_before',
            'has_discount', 'discount_used'
        }
        
        # Check for unknown keys
        unknown_keys = set(v.keys()) - allowed_keys
        if unknown_keys:
            raise ValueError(f'Unknown keys in definition: {unknown_keys}')
        
        # Validate value types
        if 'status' in v and v['status'] not in ['active', 'blocked']:
            raise ValueError('status must be "active" or "blocked"')
        
        if 'is_subscribed' in v and not isinstance(v['is_subscribed'], bool):
            raise ValueError('is_subscribed must be a boolean')
        
        if 'tags' in v and not isinstance(v['tags'], list):
            raise ValueError('tags must be a list')
        
        if 'gender' in v and v['gender'] not in ['male', 'female', 'unknown']:
            raise ValueError('gender must be "male", "female", or "unknown"')
        
        if 'birthday_month' in v:
            month = v['birthday_month']
            if not isinstance(month, int) or month < 1 or month > 12:
                raise ValueError('birthday_month must be an integer between 1 and 12')
        
        return v


class SegmentCreate(SegmentBase):
    """Schema for creating a segment."""
    pass


class SegmentUpdate(BaseModel):
    """Schema for updating a segment."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=512)
    definition: Optional[dict] = None
    is_active: Optional[bool] = None
    
    @field_validator('definition')
    @classmethod
    def validate_definition(cls, v: Optional[dict]) -> Optional[dict]:
        """Validate segment definition structure if provided."""
        if v is None:
            return v
        
        if not isinstance(v, dict):
            raise ValueError('Definition must be a dictionary')
        
        # Define allowed keys
        allowed_keys = {
            'status', 'is_subscribed', 'tags', 'source', 'source_normalized',
            'gender', 'birthday_month', 'created_after', 'created_before',
            'has_discount', 'discount_used'
        }
        
        # Check for unknown keys
        unknown_keys = set(v.keys()) - allowed_keys
        if unknown_keys:
            raise ValueError(f'Unknown keys in definition: {unknown_keys}')
        
        # Validate value types
        if 'status' in v and v['status'] not in ['active', 'blocked']:
            raise ValueError('status must be "active" or "blocked"')
        
        if 'is_subscribed' in v and not isinstance(v['is_subscribed'], bool):
            raise ValueError('is_subscribed must be a boolean')
        
        if 'tags' in v and not isinstance(v['tags'], list):
            raise ValueError('tags must be a list')
        
        if 'gender' in v and v['gender'] not in ['male', 'female', 'unknown']:
            raise ValueError('gender must be "male", "female", or "unknown"')
        
        if 'birthday_month' in v:
            month = v['birthday_month']
            if not isinstance(month, int) or month < 1 or month > 12:
                raise ValueError('birthday_month must be an integer between 1 and 12')
        
        return v


class SegmentInDB(SegmentBase):
    """Segment schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime
    updated_at: datetime
    is_test: bool


class SegmentPublic(SegmentBase):
    """Segment schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime
    updated_at: datetime


class SegmentCount(BaseModel):
    """Schema for segment user count."""
    segment_id: int
    count: int


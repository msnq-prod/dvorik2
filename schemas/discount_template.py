"""Discount template Pydantic schemas."""
from datetime import datetime
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, ConfigDict

from models.discount_template import (
    DiscountTemplateType,
    DiscountValueType,
    DiscountUsageType
)


class DiscountTemplateBase(BaseModel):
    """Base discount template schema."""
    name: str = Field(..., min_length=1, max_length=255)
    template_type: DiscountTemplateType
    value_type: DiscountValueType
    value: Decimal = Field(..., gt=0, decimal_places=2)
    validity_days: int = Field(..., gt=0)
    recurrence: Optional[dict] = None
    usage_type: DiscountUsageType = Field(default=DiscountUsageType.SINGLE)
    is_active: bool = Field(default=True)
    description: Optional[str] = Field(None, max_length=512)
    
    @field_validator('recurrence')
    @classmethod
    def validate_recurrence(cls, v: Optional[dict]) -> Optional[dict]:
        """Validate recurrence JSON structure."""
        if v is None:
            return v
        
        if not isinstance(v, dict):
            raise ValueError('Recurrence must be a dictionary')
        
        if 'type' not in v or 'value' not in v:
            raise ValueError('Recurrence must have "type" and "value" fields')
        
        if v['type'] not in ['days', 'weeks', 'months']:
            raise ValueError('Recurrence type must be "days", "weeks", or "months"')
        
        if not isinstance(v['value'], int) or v['value'] <= 0:
            raise ValueError('Recurrence value must be a positive integer')
        
        return v


class DiscountTemplateCreate(DiscountTemplateBase):
    """Schema for creating a discount template."""
    pass


class DiscountTemplateUpdate(BaseModel):
    """Schema for updating a discount template."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    value_type: Optional[DiscountValueType] = None
    value: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    validity_days: Optional[int] = Field(None, gt=0)
    recurrence: Optional[dict] = None
    usage_type: Optional[DiscountUsageType] = None
    is_active: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=512)
    
    @field_validator('recurrence')
    @classmethod
    def validate_recurrence(cls, v: Optional[dict]) -> Optional[dict]:
        """Validate recurrence JSON structure."""
        if v is None:
            return v
        
        if not isinstance(v, dict):
            raise ValueError('Recurrence must be a dictionary')
        
        if 'type' not in v or 'value' not in v:
            raise ValueError('Recurrence must have "type" and "value" fields')
        
        if v['type'] not in ['days', 'weeks', 'months']:
            raise ValueError('Recurrence type must be "days", "weeks", or "months"')
        
        if not isinstance(v['value'], int) or v['value'] <= 0:
            raise ValueError('Recurrence value must be a positive integer')
        
        return v


class DiscountTemplateInDB(DiscountTemplateBase):
    """Discount template schema with database fields."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime
    updated_at: datetime
    is_test: bool


class DiscountTemplatePublic(DiscountTemplateBase):
    """Discount template schema for public API responses."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime
    updated_at: datetime


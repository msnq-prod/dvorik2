from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from decimal import Decimal

from app.models.discount_templates import (
    DiscountValueTypeEnum,
    DiscountEventEnum,
    DiscountUsageTypeEnum,
)


class DiscountTemplateBase(BaseModel):
    name: str
    value: Decimal
    value_type: DiscountValueTypeEnum
    recurrence: Optional[dict] = None
    event: Optional[DiscountEventEnum] = None
    usage_type: DiscountUsageTypeEnum
    is_active: bool = True
    duration_days: Optional[int] = None


class DiscountTemplateCreate(DiscountTemplateBase):
    pass


class DiscountTemplateSchema(DiscountTemplateBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

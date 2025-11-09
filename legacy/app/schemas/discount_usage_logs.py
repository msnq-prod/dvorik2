from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from app.models.discount_usage_logs import DiscountUsageStatusEnum


class DiscountUsageLogBase(BaseModel):
    discount_id: Optional[int] = None
    code: str
    cashier_id: Optional[int] = None
    user_id: Optional[int] = None
    status: DiscountUsageStatusEnum


class DiscountUsageLogCreate(DiscountUsageLogBase):
    pass


class DiscountUsageLogSchema(DiscountUsageLogBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

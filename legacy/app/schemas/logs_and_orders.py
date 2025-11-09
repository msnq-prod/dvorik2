from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from decimal import Decimal


class OrderBase(BaseModel):
    user_id: int
    order_details: Optional[dict] = None
    total_amount: Decimal


class OrderCreate(OrderBase):
    pass


class OrderSchema(OrderBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogBase(BaseModel):
    admin_id: int
    action: str
    payload: Optional[dict] = None


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogSchema(AuditLogBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

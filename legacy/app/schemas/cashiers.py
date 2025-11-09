from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CashierBase(BaseModel):
    is_active: bool = False
    approved_by_admin_id: Optional[int] = None


class CashierCreate(CashierBase):
    telegram_id: int


class CashierSchema(CashierBase):
    id: int
    telegram_id: int
    created_at: datetime

    class Config:
        from_attributes = True

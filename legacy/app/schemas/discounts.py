from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class DiscountBase(BaseModel):
    user_id: int
    template_id: Optional[int] = None
    code: str
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    is_test: bool = False


class DiscountCreate(DiscountBase):
    pass


class DiscountSchema(DiscountBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

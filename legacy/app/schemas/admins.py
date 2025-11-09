from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from app.models.admins import AdminRoleEnum


class AdminBase(BaseModel):
    role: AdminRoleEnum
    can_broadcast_from_chat: bool = False
    notification_groups: Optional[dict] = None
    is_active: bool = True


class AdminCreate(AdminBase):
    telegram_id: int


class AdminSchema(AdminBase):
    id: int
    telegram_id: int
    created_at: datetime

    class Config:
        from_attributes = True

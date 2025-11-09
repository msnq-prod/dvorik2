from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from app.models.broadcasts import (
    BroadcastMediaTypeEnum,
    BroadcastStatusEnum,
    BroadcastLogStatusEnum,
)


class BroadcastBase(BaseModel):
    media_type: BroadcastMediaTypeEnum
    body: Optional[str] = None
    status: BroadcastStatusEnum = BroadcastStatusEnum.draft
    is_test: bool = False
    scheduled_at: Optional[datetime] = None


class BroadcastCreate(BroadcastBase):
    pass


class BroadcastSchema(BroadcastBase):
    id: int
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BroadcastLogBase(BaseModel):
    broadcast_id: int
    user_id: int
    status: BroadcastLogStatusEnum
    error_message: Optional[str] = None
    error_payload: Optional[dict] = None


class BroadcastLogCreate(BroadcastLogBase):
    pass


class BroadcastLogSchema(BroadcastLogBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

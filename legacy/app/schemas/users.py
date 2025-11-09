from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from app.models.users import GenderEnum


class UserBase(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    gender: Optional[GenderEnum] = None
    birthday: Optional[datetime] = None
    is_subscribed: bool = True
    tags: Optional[dict] = None
    is_test: bool = False


class UserCreate(UserBase):
    telegram_id: int


class UserSchema(UserBase):
    id: int
    telegram_id: int
    created_at: datetime

    class Config:
        from_attributes = True

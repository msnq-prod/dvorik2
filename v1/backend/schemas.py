from pydantic import BaseModel, validator
from typing import Optional
from datetime import date, datetime


class UserBase(BaseModel):
    telegram_id: int
    first_name: str
    last_name: str
    birth_date: date
    gender: str

    @validator('birth_date', pre=True)
    def parse_birth_date(cls, v):
        if isinstance(v, str):
            try:
                return datetime.strptime(v, '%d.%m.%Y').date()
            except ValueError:
                raise ValueError("birth_date must be in DD.MM.YYYY format")
        return v


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: int
    subscribed: bool
    status: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True


class CouponBase(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    comment: Optional[str] = None
    expires_at: datetime
    is_unique: bool
    is_disposable: bool


class CouponCreate(CouponBase):
    pass


class Coupon(CouponBase):
    id: int
    user_id: Optional[int] = None
    campaign_id: Optional[int] = None
    created_at: datetime

    class Config:
        orm_mode = True


class CampaignBase(BaseModel):
    name: str


class CampaignCreate(CampaignBase):
    pass


class Campaign(CampaignBase):
    id: int
    created_at: datetime
    deleted_at: Optional[datetime] = None

    class Config:
        orm_mode = True

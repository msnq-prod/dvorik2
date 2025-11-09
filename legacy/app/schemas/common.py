from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class SegmentBase(BaseModel):
    name: str
    filters: Optional[dict] = None


class SegmentCreate(SegmentBase):
    pass


class SegmentSchema(SegmentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None


class CampaignCreate(CampaignBase):
    pass


class CampaignSchema(CampaignBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class CampaignUserBase(BaseModel):
    campaign_id: int
    user_id: int


class CampaignUserCreate(CampaignUserBase):
    pass


class CampaignUserSchema(CampaignUserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SettingBase(BaseModel):
    key: str
    value: Any


class SettingCreate(SettingBase):
    pass


class SettingSchema(SettingBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

from sqlalchemy import (
    Column,
    Integer,
    String,
    JSON,
    ForeignKey,
    func,
    DateTime,
)
from app.db import Base


class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    filters = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1024))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CampaignUser(Base):
    __tablename__ = "campaign_users"

    id = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(255), unique=True, nullable=False)
    value = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

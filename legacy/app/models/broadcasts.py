import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    JSON,
    Enum,
    func,
    DateTime,
    ForeignKey,
)
from app.db import Base


class BroadcastMediaTypeEnum(enum.Enum):
    text = "text"
    photo = "photo"
    video = "video"


class BroadcastStatusEnum(enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    sending = "sending"
    sent = "sent"
    error = "error"
    canceled = "canceled"


class BroadcastLogStatusEnum(enum.Enum):
    success = "success"
    failed = "failed"


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True)
    media_type = Column(Enum(BroadcastMediaTypeEnum), nullable=False)
    body = Column(Text)
    status = Column(Enum(BroadcastStatusEnum), nullable=False, default=BroadcastStatusEnum.draft)
    is_test = Column(Boolean, default=False)
    scheduled_at = Column(DateTime)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class BroadcastLog(Base):
    __tablename__ = "broadcast_logs"

    id = Column(Integer, primary_key=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(BroadcastLogStatusEnum), nullable=False)
    error_message = Column(Text)
    error_payload = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

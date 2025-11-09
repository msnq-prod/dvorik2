import enum
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Boolean,
    JSON,
    Enum,
    func,
    DateTime,
)
from app.db import Base


class AdminRoleEnum(enum.Enum):
    owner = "owner"
    marketing = "marketing"
    readonly = "readonly"


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    role = Column(Enum(AdminRoleEnum), nullable=False)
    can_broadcast_from_chat = Column(Boolean, default=False)
    notification_groups = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

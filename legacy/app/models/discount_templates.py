import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    JSON,
    Enum,
    func,
    DateTime,
    DECIMAL,
)
from app.db import Base


class DiscountValueTypeEnum(enum.Enum):
    percent = "percent"
    absolute = "absolute"


class DiscountEventEnum(enum.Enum):
    birthday = "birthday"
    subscription = "subscription"
    manual = "manual"


class DiscountUsageTypeEnum(enum.Enum):
    single = "single"
    multiple = "multiple"


class DiscountTemplate(Base):
    __tablename__ = "discount_templates"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    value = Column(DECIMAL(10, 2), nullable=False)
    value_type = Column(Enum(DiscountValueTypeEnum), nullable=False)
    recurrence = Column(JSON)
    event = Column(Enum(DiscountEventEnum))
    usage_type = Column(Enum(DiscountUsageTypeEnum), nullable=False)
    is_active = Column(Boolean, default=True)
    duration_days = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    func,
    DateTime,
    Enum,
)
from app.db import Base


class DiscountUsageStatusEnum(enum.Enum):
    success = "success"
    already_used = "already_used"
    not_found = "not_found"
    expired = "expired"
    cashier_not_active = "cashier_not_active"


class DiscountUsageLog(Base):
    __tablename__ = "discount_usage_logs"

    id = Column(Integer, primary_key=True)
    discount_id = Column(Integer, ForeignKey("discounts.id"))
    code = Column(String(255), nullable=False)
    cashier_id = Column(Integer, ForeignKey("cashiers.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(Enum(DiscountUsageStatusEnum), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

from sqlalchemy import (
    Column,
    Integer,
    String,
    JSON,
    ForeignKey,
    func,
    DateTime,
    DECIMAL,
)
from app.db import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    order_details = Column(JSON)
    total_amount = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey("admins.id"), nullable=False)
    action = Column(String(255), nullable=False)
    payload = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

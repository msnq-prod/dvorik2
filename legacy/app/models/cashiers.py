from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Boolean,
    ForeignKey,
    func,
    DateTime,
)
from app.db import Base


class Cashier(Base):
    __tablename__ = "cashiers"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    is_active = Column(Boolean, default=False)
    approved_by_admin_id = Column(Integer, ForeignKey("admins.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

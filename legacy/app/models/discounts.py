from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    func,
    DateTime,
)
from app.db import Base


class Discount(Base):
    __tablename__ = "discounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("discount_templates.id"))
    code = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime)
    used_at = Column(DateTime)
    is_test = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

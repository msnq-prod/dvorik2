from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Date, Enum, TIMESTAMP, DECIMAL, TEXT
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True)
    first_name = Column(String(255))
    last_name = Column(String(255))
    birth_date = Column(Date)
    gender = Column(Enum('male', 'female'))
    subscribed = Column(Boolean, default=False)
    status = Column(String(255))
    created_at = Column(TIMESTAMP)


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(255), unique=True, index=True)
    discount_type = Column(Enum('percentage', 'fixed_amount', 'comment'))
    discount_value = Column(DECIMAL(10, 2))
    comment = Column(TEXT)
    expires_at = Column(TIMESTAMP)
    is_unique = Column(Boolean)
    is_disposable = Column(Boolean)
    user_id = Column(Integer, ForeignKey("users.id"))
    campaign_id = Column(Integer, ForeignKey("campaigns.id"))
    created_at = Column(TIMESTAMP)

    owner = relationship("User")
    campaign = relationship("Campaign")


class CouponActivation(Base):
    __tablename__ = "coupon_activations"

    id = Column(Integer, primary_key=True, index=True)
    coupon_id = Column(Integer, ForeignKey("coupons.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    activated_at = Column(TIMESTAMP)

    coupon = relationship("Coupon")
    user = relationship("User")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    created_at = Column(TIMESTAMP)
    deleted_at = Column(TIMESTAMP)

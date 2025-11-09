import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    JSON,
    Enum,
    func,
)
from app.db import Base


class GenderEnum(enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    first_name = Column(String(255))
    last_name = Column(String(255))
    username = Column(String(255))
    gender = Column(Enum(GenderEnum))
    birthday = Column(Date)
    is_subscribed = Column(Boolean, default=True)
    tags = Column(JSON)
    is_test = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

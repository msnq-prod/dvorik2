"""User model for clients."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Date, Boolean, JSON, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from models.base import BaseModel


class UserGender(str, enum.Enum):
    """User gender enum."""
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class UserStatus(str, enum.Enum):
    """User status enum."""
    ACTIVE = "active"
    BLOCKED = "blocked"


class User(BaseModel):
    """
    User model representing clients in the system.
    
    Telegram users who interact with the main bot.
    """
    
    __tablename__ = "users"
    
    # Telegram identification
    telegram_id: Mapped[int] = mapped_column(
        BigInteger,
        unique=True,
        nullable=False,
        index=True,
        comment="Telegram user ID"
    )
    
    username: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Telegram username (without @)"
    )
    
    first_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="User's first name from Telegram"
    )
    
    last_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="User's last name from Telegram"
    )
    
    display_name: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Computed display name: (first_name + last_name) OR username OR 'Без имени'"
    )
    
    # Contact information
    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Phone number (optional)"
    )
    
    # Personal information
    gender: Mapped[UserGender] = mapped_column(
        SQLEnum(UserGender, native_enum=False, length=10),
        default=UserGender.UNKNOWN,
        nullable=False,
        comment="User gender"
    )
    
    birthday: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="User's birthday for birthday promotions"
    )
    
    # Campaign tracking
    source: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Source of registration (e.g., ref_autumn25)"
    )
    
    source_normalized: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        comment="Normalized source for filtering (lowercase, no prefix)"
    )
    
    # Segmentation and targeting
    tags: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Array of tags for segmentation (max 20 tags, max 32 chars each)"
    )
    
    # Status and subscription
    status: Mapped[UserStatus] = mapped_column(
        SQLEnum(UserStatus, native_enum=False, length=10),
        default=UserStatus.ACTIVE,
        nullable=False,
        index=True,
        comment="User status for broadcasts"
    )
    
    is_subscribed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
        comment="Whether user is subscribed to the Telegram channel"
    )
    
    # Relationships
    discounts: Mapped[list["Discount"]] = relationship(
        "Discount",
        back_populates="user",
        lazy="selectin"
    )
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_users_source_normalized', 'source_normalized'),
        Index('idx_users_is_subscribed', 'is_subscribed'),
        Index('idx_users_status', 'status'),
        Index('idx_users_is_test', 'is_test'),
        Index('idx_users_birthday', 'birthday'),
        Index('idx_users_telegram_id', 'telegram_id'),
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<User(id={self.id}, telegram_id={self.telegram_id}, display_name='{self.display_name}')>"
    
    def compute_display_name(self) -> str:
        """
        Compute display name according to business rules:
        (first_name + " " + last_name).strip() OR username OR "Без имени"
        """
        if self.first_name or self.last_name:
            parts = []
            if self.first_name:
                parts.append(self.first_name)
            if self.last_name:
                parts.append(self.last_name)
            return " ".join(parts).strip()
        
        if self.username:
            return self.username
        
        return "Без имени"
    
    def normalize_source(self) -> Optional[str]:
        """
        Normalize source for filtering:
        - Convert to lowercase
        - Remove common prefixes (ref_, utm_, etc.)
        """
        if not self.source:
            return None
        
        normalized = self.source.lower()
        
        # Remove common prefixes
        prefixes = ['ref_', 'utm_', 'source_']
        for prefix in prefixes:
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix):]
                break
        
        return normalized


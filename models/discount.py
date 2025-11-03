"""Discount model for issued discount codes."""
from typing import Optional
from datetime import datetime

from sqlalchemy import String, Boolean, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import BaseModel


class Discount(BaseModel):
    """
    Discount model representing issued discount codes.
    
    Each discount is tied to a user and a template.
    Codes are unique and have expiration dates.
    """
    
    __tablename__ = "discounts"
    
    # Unique discount code
    code: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
        comment="Unique discount code (3 cyrillic letters + 4 digits)"
    )
    
    # Template reference
    template_id: Mapped[int] = mapped_column(
        ForeignKey("discount_templates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Discount template this code was generated from"
    )
    
    # User reference
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="User who owns this discount"
    )
    
    # Expiration
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        index=True,
        comment="Expiration timestamp (UTC)"
    )
    
    # Redemption tracking
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        index=True,
        comment="Timestamp when discount was used (UTC) - NULL if not used yet"
    )
    
    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
        comment="Whether discount is active"
    )
    
    # Relationships
    template: Mapped["DiscountTemplate"] = relationship(
        "DiscountTemplate",
        back_populates="discounts",
        lazy="selectin"
    )
    
    user: Mapped["User"] = relationship(
        "User",
        back_populates="discounts",
        lazy="selectin"
    )
    
    usage_logs: Mapped[list["DiscountUsageLog"]] = relationship(
        "DiscountUsageLog",
        back_populates="discount",
        lazy="selectin"
    )
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_discounts_code', 'code'),
        Index('idx_discounts_user_id', 'user_id'),
        Index('idx_discounts_template_id', 'template_id'),
        Index('idx_discounts_expires_at', 'expires_at'),
        Index('idx_discounts_used_at', 'used_at'),
        Index('idx_discounts_is_active', 'is_active'),
        Index('idx_discounts_is_test', 'is_test'),
    )
    
    def __repr__(self) -> str:
        """String representation."""
        status = "used" if self.used_at else "active"
        return f"<Discount(id={self.id}, code='{self.code}', status={status})>"
    
    def is_valid(self) -> bool:
        """
        Check if discount is valid for redemption.
        
        Returns:
            True if discount can be used, False otherwise
        """
        now = datetime.utcnow()
        
        # Check if already used
        if self.used_at is not None:
            return False
        
        # Check if expired
        if self.expires_at < now:
            return False
        
        # Check if active
        if not self.is_active:
            return False
        
        return True
    
    def is_expired(self) -> bool:
        """
        Check if discount is expired.
        
        Returns:
            True if expired, False otherwise
        """
        return datetime.utcnow() > self.expires_at
    
    def mark_as_used(self) -> None:
        """Mark discount as used."""
        self.used_at = datetime.utcnow()


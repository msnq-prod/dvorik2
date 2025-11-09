"""Cashier model for offline store cashiers."""
from typing import Optional
from datetime import datetime

from sqlalchemy import BigInteger, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin


class Cashier(Base, TimestampMixin):
    """
    Cashier model representing cashiers in offline stores.
    
    Cashiers interact with the auth bot to validate and redeem discount codes.
    They do NOT have access to the admin panel.
    """
    
    __tablename__ = "cashiers"
    
    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
        nullable=False
    )
    
    # Telegram identification
    telegram_id: Mapped[int] = mapped_column(
        BigInteger,
        unique=True,
        nullable=False,
        index=True,
        comment="Telegram user ID of the cashier"
    )
    
    username: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Telegram username (without @)"
    )
    
    display_name: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Display name for UI and logs"
    )
    
    # Activation status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
        comment="Whether cashier is active (must be explicitly activated by owner)"
    )
    
    # Approval tracking
    approved_by_admin_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who approved this cashier"
    )
    
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        comment="Timestamp when cashier was approved (UTC)"
    )
    
    # Store assignment (for multi-store setup in future)
    store_id: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        comment="Store ID for multi-store setup (future feature)"
    )
    
    # Relationships
    approved_by: Mapped[Optional["Admin"]] = relationship(
        "Admin",
        foreign_keys=[approved_by_admin_id],
        lazy="selectin"
    )
    
    usage_logs: Mapped[list["DiscountUsageLog"]] = relationship(
        "DiscountUsageLog",
        back_populates="cashier",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        status = "active" if self.is_active else "inactive"
        return f"<Cashier(id={self.id}, telegram_id={self.telegram_id}, status={status})>"
    
    def activate(self, admin_id: int) -> None:
        """
        Activate cashier.
        
        Args:
            admin_id: ID of the admin approving the cashier
        """
        self.is_active = True
        self.approved_by_admin_id = admin_id
        self.approved_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        """Deactivate cashier."""
        self.is_active = False


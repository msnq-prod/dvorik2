"""Discount usage log model for auditing discount redemptions."""
from typing import Optional
from datetime import datetime
import enum

from sqlalchemy import String, ForeignKey, DateTime, Enum as SQLEnum, Boolean, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class DiscountUsageStatus(str, enum.Enum):
    """Discount usage status enum."""
    SUCCESS = "success"
    ALREADY_USED = "already_used"
    NOT_FOUND = "not_found"
    EXPIRED = "expired"
    CASHIER_NOT_ACTIVE = "cashier_not_active"
    INVALID = "invalid"


class DiscountUsageLog(Base):
    """
    Discount usage log model for auditing all redemption attempts.
    
    This table is critical for KPI tracking and audit.
    Records both successful and failed redemption attempts.
    """
    
    __tablename__ = "discount_usage_logs"
    
    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
        nullable=False
    )
    
    # Discount reference (nullable for not found codes)
    discount_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("discounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Discount ID (NULL if code was not found)"
    )
    
    # Code that was attempted (for failed attempts)
    code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
        comment="Discount code that was entered"
    )
    
    # Cashier who attempted redemption
    cashier_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("cashiers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Cashier who attempted to redeem the code"
    )
    
    # Store reference (for future multi-store setup)
    store_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        index=True,
        comment="Store ID for multi-store setup"
    )
    
    # Status of the redemption attempt
    status: Mapped[DiscountUsageStatus] = mapped_column(
        SQLEnum(DiscountUsageStatus, native_enum=False, length=30),
        nullable=False,
        index=True,
        comment="Status: success, already_used, not_found, expired, cashier_not_active, invalid"
    )
    
    # Error/success message
    message: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Detailed message about the attempt (truncated to 512 chars)"
    )
    
    # User notification tracking
    user_not_notified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="True if user notification failed (e.g., bot blocked by user)"
    )
    
    # Test flag
    is_test: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
        comment="Flag to mark test data"
    )
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        nullable=False,
        index=True,
        comment="Timestamp of the attempt (UTC)"
    )
    
    # Relationships
    discount: Mapped[Optional["Discount"]] = relationship(
        "Discount",
        back_populates="usage_logs",
        lazy="selectin"
    )
    
    cashier: Mapped[Optional["Cashier"]] = relationship(
        "Cashier",
        back_populates="usage_logs",
        lazy="selectin"
    )
    
    # Indexes for performance and reporting
    __table_args__ = (
        Index('idx_usage_logs_created_at', 'created_at'),
        Index('idx_usage_logs_cashier_id', 'cashier_id'),
        Index('idx_usage_logs_status', 'status'),
        Index('idx_usage_logs_discount_id', 'discount_id'),
        Index('idx_usage_logs_code', 'code'),
        Index('idx_usage_logs_is_test', 'is_test'),
        Index('idx_usage_logs_store_id', 'store_id'),
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<DiscountUsageLog(id={self.id}, code='{self.code}', status={self.status.value})>"
    
    @classmethod
    def log_success(
        cls,
        discount_id: int,
        code: str,
        cashier_id: int,
        store_id: Optional[int] = None,
        user_notified: bool = True,
        is_test: bool = False
    ) -> "DiscountUsageLog":
        """
        Create a success log entry.
        
        Args:
            discount_id: ID of the redeemed discount
            code: Discount code
            cashier_id: ID of the cashier
            store_id: Optional store ID
            user_notified: Whether user was notified
            is_test: Whether this is test data
        
        Returns:
            New DiscountUsageLog instance
        """
        return cls(
            discount_id=discount_id,
            code=code,
            cashier_id=cashier_id,
            store_id=store_id,
            status=DiscountUsageStatus.SUCCESS,
            message="Discount successfully redeemed",
            user_not_notified=not user_notified,
            is_test=is_test
        )
    
    @classmethod
    def log_failure(
        cls,
        code: str,
        status: DiscountUsageStatus,
        message: str,
        cashier_id: Optional[int] = None,
        discount_id: Optional[int] = None,
        store_id: Optional[int] = None,
        is_test: bool = False
    ) -> "DiscountUsageLog":
        """
        Create a failure log entry.
        
        Args:
            code: Discount code that was attempted
            status: Failure status
            message: Error message
            cashier_id: Optional cashier ID
            discount_id: Optional discount ID (if code was found)
            store_id: Optional store ID
            is_test: Whether this is test data
        
        Returns:
            New DiscountUsageLog instance
        """
        # Truncate message to 512 characters
        truncated_message = message[:512] if len(message) > 512 else message
        
        return cls(
            discount_id=discount_id,
            code=code,
            cashier_id=cashier_id,
            store_id=store_id,
            status=status,
            message=truncated_message,
            is_test=is_test
        )


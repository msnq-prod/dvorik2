"""Discount template model."""
from typing import Optional
from decimal import Decimal
import enum

from sqlalchemy import String, Enum as SQLEnum, Boolean, Integer, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import BaseModel


class DiscountTemplateType(str, enum.Enum):
    """Discount template type enum."""
    SUBSCRIPTION = "subscription"
    BIRTHDAY = "birthday"
    MANUAL = "manual"


class DiscountValueType(str, enum.Enum):
    """Discount value type enum."""
    PERCENT = "percent"
    FIXED = "fixed"


class DiscountUsageType(str, enum.Enum):
    """Discount usage type enum."""
    SINGLE = "single"  # Code is marked as used after redemption
    SHARED = "shared"  # Code can be used multiple times


class DiscountTemplate(BaseModel):
    """
    Discount template model.
    
    Templates define the rules for generating discount codes.
    Each template can have recurrence rules for automatic re-issuing.
    """
    
    __tablename__ = "discount_templates"
    
    # Template identification
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Template name for admin panel"
    )
    
    template_type: Mapped[DiscountTemplateType] = mapped_column(
        SQLEnum(DiscountTemplateType, native_enum=False, length=20),
        nullable=False,
        index=True,
        comment="Type: subscription (for channel subscription), birthday, manual"
    )
    
    # Discount value
    value_type: Mapped[DiscountValueType] = mapped_column(
        SQLEnum(DiscountValueType, native_enum=False, length=10),
        nullable=False,
        comment="Value type: percent or fixed amount"
    )
    
    value: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Discount value (percentage or fixed amount)"
    )
    
    # Validity
    validity_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=30,
        comment="Number of days the discount is valid"
    )
    
    # Recurrence rules
    recurrence: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Recurrence rule: e.g., {'type': 'days', 'value': 30} for re-issuing after 30 days"
    )
    
    # Usage type
    usage_type: Mapped[DiscountUsageType] = mapped_column(
        SQLEnum(DiscountUsageType, native_enum=False, length=10),
        default=DiscountUsageType.SINGLE,
        nullable=False,
        comment="Usage type: single (code marked as used) or shared (reusable)"
    )
    
    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
        comment="Whether template is active and can be used"
    )
    
    # Description
    description: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Template description for admin panel"
    )
    
    # Relationships
    discounts: Mapped[list["Discount"]] = relationship(
        "Discount",
        back_populates="template",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<DiscountTemplate(id={self.id}, name='{self.name}', type={self.template_type.value})>"
    
    def calculate_expiry_days(self) -> int:
        """
        Calculate expiry days for this template.
        
        Returns:
            Number of days until expiry
        """
        return self.validity_days
    
    def get_recurrence_days(self) -> Optional[int]:
        """
        Get recurrence period in days.
        
        Returns:
            Number of days for recurrence, or None if no recurrence
        """
        if not self.recurrence:
            return None
        
        recurrence_type = self.recurrence.get("type")
        recurrence_value = self.recurrence.get("value")
        
        if recurrence_type == "days" and recurrence_value:
            return int(recurrence_value)
        
        # Add more recurrence types if needed (weeks, months, etc.)
        return None
    
    def format_value(self) -> str:
        """
        Format discount value for display.
        
        Returns:
            Formatted string (e.g., "10%", "500₽")
        """
        if self.value_type == DiscountValueType.PERCENT:
            return f"{self.value}%"
        else:
            return f"{self.value}₽"


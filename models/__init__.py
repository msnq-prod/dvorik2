"""Models package - exports all database models."""

# Import Base first
from models.base import Base, BaseModel, TimestampMixin

# Import all models for Alembic to detect
from models.user import User, UserGender, UserStatus
from models.admin import Admin, AdminRole
from models.cashier import Cashier

from models.discount_template import (
    DiscountTemplate,
    DiscountTemplateType,
    DiscountValueType,
    DiscountUsageType
)
from models.discount import Discount
from models.discount_usage_log import DiscountUsageLog, DiscountUsageStatus

from models.broadcast import Broadcast, BroadcastStatus, BroadcastMediaType
from models.message_template import MessageTemplate
from models.segment import Segment

from models.setting import Setting, SettingValueType
from models.audit_log import AuditLog, AuditAction

__all__ = [
    # Base
    "Base",
    "BaseModel",
    "TimestampMixin",
    
    # Users
    "User",
    "UserGender",
    "UserStatus",
    
    # Admins and Cashiers
    "Admin",
    "AdminRole",
    "Cashier",
    
    # Discounts
    "DiscountTemplate",
    "DiscountTemplateType",
    "DiscountValueType",
    "DiscountUsageType",
    "Discount",
    "DiscountUsageLog",
    "DiscountUsageStatus",
    
    # Broadcasts
    "Broadcast",
    "BroadcastStatus",
    "BroadcastMediaType",
    "MessageTemplate",
    "Segment",
    
    # System
    "Setting",
    "SettingValueType",
    "AuditLog",
    "AuditAction",
]


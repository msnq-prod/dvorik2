"""Admin model for system administrators."""
from typing import Optional
import enum

from sqlalchemy import BigInteger, String, Boolean, JSON, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.base import BaseModel


class AdminRole(str, enum.Enum):
    """Admin role enum."""
    OWNER = "owner"
    MARKETING = "marketing"
    READONLY = "readonly"


class Admin(BaseModel):
    """
    Admin model representing system administrators.
    
    Admins have access to the web admin panel with different permission levels.
    """
    
    __tablename__ = "admins"
    
    # Telegram identification
    telegram_id: Mapped[int] = mapped_column(
        BigInteger,
        unique=True,
        nullable=False,
        index=True,
        comment="Telegram user ID of the admin"
    )
    
    username: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Telegram username (without @)"
    )
    
    display_name: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Display name for UI"
    )
    
    # Role and permissions
    role: Mapped[AdminRole] = mapped_column(
        SQLEnum(AdminRole, native_enum=False, length=20),
        nullable=False,
        index=True,
        comment="Admin role: owner (full access), marketing (limited), readonly (view only)"
    )
    
    can_broadcast_from_chat: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Permission to send broadcasts directly from Telegram chat"
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
        comment="Whether admin account is active"
    )
    
    # Notification preferences
    notification_groups: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Array of notification groups admin is subscribed to (e.g., ['errors', 'cashier_logs', 'settings'])"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<Admin(id={self.id}, telegram_id={self.telegram_id}, role={self.role.value})>"
    
    def has_permission(self, permission: str) -> bool:
        """
        Check if admin has a specific permission.
        
        Args:
            permission: Permission name (e.g., 'manage_settings', 'view_users', 'send_broadcasts')
        
        Returns:
            True if admin has permission, False otherwise
        """
        # Owner has all permissions
        if self.role == AdminRole.OWNER:
            return True
        
        # Marketing role permissions
        if self.role == AdminRole.MARKETING:
            marketing_permissions = {
                'view_users', 'edit_users', 'export_users',
                'view_broadcasts', 'create_broadcasts', 'send_broadcasts',
                'view_segments', 'create_segments', 'edit_segments',
                'view_discounts', 'create_discounts',
                'view_templates'
            }
            return permission in marketing_permissions
        
        # Readonly role permissions
        if self.role == AdminRole.READONLY:
            readonly_permissions = {
                'view_users', 'view_broadcasts', 'view_segments',
                'view_discounts', 'view_templates', 'view_cashiers',
                'view_audit_logs'
            }
            return permission in readonly_permissions
        
        return False
    
    def can_modify_settings(self) -> bool:
        """Check if admin can modify system settings (owner only)."""
        return self.role == AdminRole.OWNER
    
    def can_manage_admins(self) -> bool:
        """Check if admin can manage other admins (owner only)."""
        return self.role == AdminRole.OWNER
    
    def can_activate_cashiers(self) -> bool:
        """Check if admin can activate/deactivate cashiers (owner only)."""
        return self.role == AdminRole.OWNER


"""Audit log model for tracking critical actions."""
from typing import Optional
from datetime import datetime
import enum

from sqlalchemy import String, BigInteger, ForeignKey, DateTime, Enum as SQLEnum, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class AuditAction(str, enum.Enum):
    """Audit action enum."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ACTIVATE = "activate"
    DEACTIVATE = "deactivate"
    LOGIN = "login"
    LOGOUT = "logout"


class AuditLog(Base):
    """
    Audit log model for tracking all critical actions.
    
    Logs changes to:
    - Admin roles and permissions
    - Cashier activations
    - System settings
    - Discount templates
    - User data modifications
    """
    
    __tablename__ = "audit_logs"
    
    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
        nullable=False
    )
    
    # Entity information
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Type of entity (e.g., 'user', 'admin', 'cashier', 'setting', 'discount_template')"
    )
    
    entity_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        index=True,
        comment="ID of the entity (NULL for system-wide actions)"
    )
    
    # Action
    action: Mapped[AuditAction] = mapped_column(
        SQLEnum(AuditAction, native_enum=False, length=20),
        nullable=False,
        index=True,
        comment="Action performed: create, update, delete, activate, deactivate, login, logout"
    )
    
    # Actor (who performed the action)
    admin_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Admin who performed the action (NULL for system actions)"
    )
    
    # Details
    payload: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Action details (before/after values, additional context)"
    )
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        nullable=False,
        index=True,
        comment="Timestamp of the action (UTC)"
    )
    
    # Test flag
    is_test: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
        comment="Flag to mark test data"
    )
    
    # Relationships
    admin: Mapped[Optional["Admin"]] = relationship(
        "Admin",
        foreign_keys=[admin_id],
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<AuditLog(id={self.id}, entity_type='{self.entity_type}', action={self.action.value})>"
    
    @classmethod
    def log_action(
        cls,
        entity_type: str,
        action: AuditAction,
        entity_id: Optional[int] = None,
        admin_id: Optional[int] = None,
        payload: Optional[dict] = None,
        is_test: bool = False
    ) -> "AuditLog":
        """
        Create audit log entry.
        
        Args:
            entity_type: Type of entity (e.g., 'user', 'setting')
            action: Action performed
            entity_id: Optional entity ID
            admin_id: Optional admin ID
            payload: Optional action details
            is_test: Whether this is test data
        
        Returns:
            New AuditLog instance
        """
        return cls(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            admin_id=admin_id,
            payload=payload,
            is_test=is_test
        )
    
    @classmethod
    def log_setting_change(
        cls,
        setting_key: str,
        old_value: str,
        new_value: str,
        admin_id: int,
        is_test: bool = False
    ) -> "AuditLog":
        """
        Log setting change.
        
        Args:
            setting_key: Setting key
            old_value: Previous value
            new_value: New value
            admin_id: Admin who made the change
            is_test: Whether this is test data
        
        Returns:
            New AuditLog instance
        """
        return cls.log_action(
            entity_type="setting",
            action=AuditAction.UPDATE,
            admin_id=admin_id,
            payload={
                "key": setting_key,
                "before": old_value,
                "after": new_value
            },
            is_test=is_test
        )
    
    @classmethod
    def log_cashier_activation(
        cls,
        cashier_id: int,
        admin_id: int,
        is_test: bool = False
    ) -> "AuditLog":
        """
        Log cashier activation.
        
        Args:
            cashier_id: Cashier ID
            admin_id: Admin who activated
            is_test: Whether this is test data
        
        Returns:
            New AuditLog instance
        """
        return cls.log_action(
            entity_type="cashier",
            entity_id=cashier_id,
            action=AuditAction.ACTIVATE,
            admin_id=admin_id,
            is_test=is_test
        )
    
    @classmethod
    def log_admin_role_change(
        cls,
        admin_id_target: int,
        old_role: str,
        new_role: str,
        changed_by_admin_id: int,
        is_test: bool = False
    ) -> "AuditLog":
        """
        Log admin role change.
        
        Args:
            admin_id_target: Admin whose role was changed
            old_role: Previous role
            new_role: New role
            changed_by_admin_id: Admin who made the change
            is_test: Whether this is test data
        
        Returns:
            New AuditLog instance
        """
        return cls.log_action(
            entity_type="admin",
            entity_id=admin_id_target,
            action=AuditAction.UPDATE,
            admin_id=changed_by_admin_id,
            payload={
                "field": "role",
                "before": old_role,
                "after": new_role
            },
            is_test=is_test
        )


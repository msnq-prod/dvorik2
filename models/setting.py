"""System settings model."""
from typing import Optional, Any
from datetime import datetime
import json
import enum

from sqlalchemy import String, Text, Enum as SQLEnum, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class SettingValueType(str, enum.Enum):
    """Setting value type enum."""
    STRING = "string"
    INT = "int"
    BOOL = "bool"
    JSON = "json"


class Setting(Base):
    """
    System settings model for storing configurable parameters.
    
    All system-wide settings are stored here.
    Only owner role can modify settings.
    Changes are logged in audit_logs.
    """
    
    __tablename__ = "settings"
    
    # Setting key (primary key)
    key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        nullable=False,
        comment="Unique setting key (e.g., 'telegram_channel_id', 'birthday_hour')"
    )
    
    # Value (stored as text, converted based on value_type)
    value: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Setting value (stored as text, converted based on value_type)"
    )
    
    # Value type for proper conversion
    value_type: Mapped[SettingValueType] = mapped_column(
        SQLEnum(SettingValueType, native_enum=False, length=10),
        default=SettingValueType.STRING,
        nullable=False,
        comment="Value type: string, int, bool, json"
    )
    
    # Description for admin panel
    description: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Setting description for admin panel"
    )
    
    # Change tracking
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        comment="Last update timestamp (UTC)"
    )
    
    updated_by_admin_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who last updated this setting"
    )
    
    # Relationships
    updated_by: Mapped[Optional["Admin"]] = relationship(
        "Admin",
        foreign_keys=[updated_by_admin_id],
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<Setting(key='{self.key}', value='{self.value}')>"
    
    def get_value(self) -> Any:
        """
        Get typed value.
        
        Returns:
            Value converted to appropriate type
        """
        if self.value_type == SettingValueType.STRING:
            return self.value
        
        elif self.value_type == SettingValueType.INT:
            try:
                return int(self.value)
            except ValueError:
                return 0
        
        elif self.value_type == SettingValueType.BOOL:
            return self.value.lower() in ('true', '1', 'yes', 'on')
        
        elif self.value_type == SettingValueType.JSON:
            try:
                return json.loads(self.value)
            except json.JSONDecodeError:
                return {}
        
        return self.value
    
    def set_value(self, value: Any) -> None:
        """
        Set typed value.
        
        Args:
            value: Value to set (will be converted to string)
        """
        if self.value_type == SettingValueType.JSON:
            self.value = json.dumps(value, ensure_ascii=False)
        elif self.value_type == SettingValueType.BOOL:
            self.value = str(bool(value)).lower()
        else:
            self.value = str(value)
    
    @classmethod
    def get_default_settings(cls) -> list[dict]:
        """
        Get list of default settings to seed database.
        
        Returns:
            List of setting dictionaries
        """
        return [
            {
                "key": "telegram_channel_id",
                "value": "@marmeladny_dvorik",
                "value_type": SettingValueType.STRING,
                "description": "Telegram channel ID for subscription checks"
            },
            {
                "key": "rate_limit_per_minute",
                "value": "25",
                "value_type": SettingValueType.INT,
                "description": "Maximum broadcast messages per minute (Telegram API limit)"
            },
            {
                "key": "birthday_hour",
                "value": "9",
                "value_type": SettingValueType.INT,
                "description": "Hour to send birthday greetings (Vladivostok timezone)"
            },
            {
                "key": "birthday_minute",
                "value": "0",
                "value_type": SettingValueType.INT,
                "description": "Minute to send birthday greetings"
            },
            {
                "key": "auto_broadcast_from_admins",
                "value": "true",
                "value_type": SettingValueType.BOOL,
                "description": "Allow admins to send broadcasts directly from Telegram chat"
            },
            {
                "key": "code_prefix",
                "value": "",
                "value_type": SettingValueType.STRING,
                "description": "Optional prefix for discount codes"
            },
            {
                "key": "subscription_cache_ttl",
                "value": "60",
                "value_type": SettingValueType.INT,
                "description": "Cache TTL for subscription checks (seconds)"
            },
            {
                "key": "default_discount_validity_days",
                "value": "30",
                "value_type": SettingValueType.INT,
                "description": "Default validity period for discounts (days)"
            },
            {
                "key": "broadcast_groups",
                "value": json.dumps([
                    {"id": "all", "name": "Все пользователи"},
                    {"id": "subscribers", "name": "Подписчики"},
                    {"id": "vip", "name": "VIP клиенты"}
                ], ensure_ascii=False),
                "value_type": SettingValueType.JSON,
                "description": "Available broadcast groups for admins"
            },
            {
                "key": "notification_groups",
                "value": json.dumps([
                    "errors",
                    "cashier_logs",
                    "settings",
                    "broadcasts"
                ], ensure_ascii=False),
                "value_type": SettingValueType.JSON,
                "description": "Available notification groups for admins"
            }
        ]


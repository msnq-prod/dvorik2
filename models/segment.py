"""Segment model for user segmentation."""
from typing import Optional

from sqlalchemy import String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import BaseModel


class Segment(BaseModel):
    """
    Segment model for defining user groups based on criteria.
    
    Segments are used for targeted broadcasts and filtering.
    Definition contains JSON query for filtering users.
    """
    
    __tablename__ = "segments"
    
    # Segment identification
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
        comment="Segment name for admin panel"
    )
    
    # Description
    description: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Segment description"
    )
    
    # Filter definition
    definition: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        comment="JSON filter definition for user selection"
    )
    
    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
        comment="Whether segment is active"
    )
    
    # Relationships
    broadcasts: Mapped[list["Broadcast"]] = relationship(
        "Broadcast",
        back_populates="segment",
        lazy="selectin"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<Segment(id={self.id}, name='{self.name}')>"
    
    def validate_definition(self) -> bool:
        """
        Validate segment definition structure.
        
        Valid definition structure:
        {
            "status": "active",
            "is_subscribed": true,
            "tags": ["vip", "premium"],
            "source": "ref_autumn25",
            "gender": "female",
            "birthday_month": 12,
            "created_after": "2024-01-01",
            "created_before": "2024-12-31"
        }
        
        Returns:
            True if definition is valid
        """
        if not isinstance(self.definition, dict):
            return False
        
        # Define allowed keys
        allowed_keys = {
            "status", "is_subscribed", "tags", "source", "source_normalized",
            "gender", "birthday_month", "created_after", "created_before",
            "has_discount", "discount_used"
        }
        
        # Check for unknown keys
        unknown_keys = set(self.definition.keys()) - allowed_keys
        if unknown_keys:
            return False
        
        # Validate value types
        if "status" in self.definition and self.definition["status"] not in ["active", "blocked"]:
            return False
        
        if "is_subscribed" in self.definition and not isinstance(self.definition["is_subscribed"], bool):
            return False
        
        if "tags" in self.definition and not isinstance(self.definition["tags"], list):
            return False
        
        if "gender" in self.definition and self.definition["gender"] not in ["male", "female", "unknown"]:
            return False
        
        if "birthday_month" in self.definition:
            month = self.definition["birthday_month"]
            if not isinstance(month, int) or month < 1 or month > 12:
                return False
        
        return True
    
    @classmethod
    def get_default_segments(cls) -> list[dict]:
        """
        Get list of default segments to seed database.
        
        Returns:
            List of segment dictionaries
        """
        return [
            {
                "name": "Все активные",
                "description": "Все активные пользователи",
                "definition": {"status": "active"},
                "is_active": True
            },
            {
                "name": "Подписчики",
                "description": "Пользователи, подписанные на канал",
                "definition": {"status": "active", "is_subscribed": True},
                "is_active": True
            },
            {
                "name": "VIP",
                "description": "VIP клиенты",
                "definition": {"status": "active", "tags": ["vip"]},
                "is_active": True
            },
            {
                "name": "Именинники этого месяца",
                "description": "Пользователи с днём рождения в текущем месяце",
                "definition": {"status": "active", "birthday_month": None},  # Will be set dynamically
                "is_active": True
            },
            {
                "name": "Женщины",
                "description": "Женщины",
                "definition": {"status": "active", "gender": "female"},
                "is_active": True
            },
            {
                "name": "Мужчины",
                "description": "Мужчины",
                "definition": {"status": "active", "gender": "male"},
                "is_active": True
            }
        ]


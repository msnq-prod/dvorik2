"""Broadcast model for message campaigns."""
from typing import Optional
from datetime import datetime
import enum

from sqlalchemy import String, Text, ForeignKey, DateTime, Enum as SQLEnum, Integer, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import BaseModel


class BroadcastStatus(str, enum.Enum):
    """Broadcast status enum following FSM."""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    ERROR = "error"


class BroadcastMediaType(str, enum.Enum):
    """Broadcast media type enum."""
    NONE = "none"
    PHOTO = "photo"
    VIDEO = "video"
    DOCUMENT = "document"


class Broadcast(BaseModel):
    """
    Broadcast model representing message campaigns.
    
    Follows strict FSM for status transitions.
    Can be filtered by segment or custom filters.
    """
    
    __tablename__ = "broadcasts"
    
    # Content
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Broadcast title for admin panel"
    )
    
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Message content (supports HTML/Markdown)"
    )
    
    # Media
    media_type: Mapped[BroadcastMediaType] = mapped_column(
        SQLEnum(BroadcastMediaType, native_enum=False, length=20),
        default=BroadcastMediaType.NONE,
        nullable=False,
        comment="Media type: none, photo, video, document"
    )
    
    media_file_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Telegram file_id for media (uploaded via bot first)"
    )
    
    # Buttons/Inline keyboard
    buttons: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Inline keyboard buttons configuration"
    )
    
    # Targeting
    filters: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Custom filters for recipient selection (JSON query)"
    )
    
    segment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("segments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Predefined segment for targeting"
    )
    
    # Status and scheduling
    status: Mapped[BroadcastStatus] = mapped_column(
        SQLEnum(BroadcastStatus, native_enum=False, length=20),
        default=BroadcastStatus.DRAFT,
        nullable=False,
        index=True,
        comment="Status: draft, scheduled, sending, sent, error"
    )
    
    send_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        index=True,
        comment="Scheduled send time (UTC)"
    )
    
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        comment="Actual send completion time (UTC)"
    )
    
    # Statistics
    recipient_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total number of target recipients"
    )
    
    success_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Number of successfully delivered messages"
    )
    
    error_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Number of failed deliveries"
    )
    
    # Creator tracking
    created_by_admin_id: Mapped[int] = mapped_column(
        ForeignKey("admins.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Admin who created this broadcast"
    )
    
    # Relationships
    created_by: Mapped["Admin"] = relationship(
        "Admin",
        foreign_keys=[created_by_admin_id],
        lazy="selectin"
    )
    
    segment: Mapped[Optional["Segment"]] = relationship(
        "Segment",
        back_populates="broadcasts",
        lazy="selectin"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_broadcasts_status', 'status'),
        Index('idx_broadcasts_send_at', 'send_at'),
        Index('idx_broadcasts_created_by_admin_id', 'created_by_admin_id'),
        Index('idx_broadcasts_is_test', 'is_test'),
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<Broadcast(id={self.id}, title='{self.title}', status={self.status.value})>"
    
    def can_transition_to(self, new_status: BroadcastStatus) -> bool:
        """
        Check if transition to new status is allowed according to FSM.
        
        Allowed transitions:
        - draft -> scheduled
        - scheduled -> sending (by Celery Beat or Owner command)
        - sending -> sent (when all chunks complete)
        - sending -> error (on critical failure)
        - sent/error -> scheduled (retry)
        
        Args:
            new_status: Target status
        
        Returns:
            True if transition is allowed
        """
        allowed_transitions = {
            BroadcastStatus.DRAFT: [BroadcastStatus.SCHEDULED],
            BroadcastStatus.SCHEDULED: [BroadcastStatus.SENDING],
            BroadcastStatus.SENDING: [BroadcastStatus.SENT, BroadcastStatus.ERROR],
            BroadcastStatus.SENT: [BroadcastStatus.SCHEDULED],  # Retry
            BroadcastStatus.ERROR: [BroadcastStatus.SCHEDULED],  # Retry
        }
        
        return new_status in allowed_transitions.get(self.status, [])
    
    def transition_to(self, new_status: BroadcastStatus) -> bool:
        """
        Transition to new status if allowed.
        
        Args:
            new_status: Target status
        
        Returns:
            True if transition was successful
        """
        if self.can_transition_to(new_status):
            self.status = new_status
            
            # Update timestamps
            if new_status == BroadcastStatus.SENT:
                self.sent_at = datetime.utcnow()
            
            return True
        
        return False
    
    def increment_success(self) -> None:
        """Increment success counter."""
        self.success_count += 1
    
    def increment_error(self) -> None:
        """Increment error counter."""
        self.error_count += 1


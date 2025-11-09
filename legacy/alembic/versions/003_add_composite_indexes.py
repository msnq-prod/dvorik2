"""Add composite indexes for performance optimization

Revision ID: 003_add_composite_indexes
Revises: 002_seed_initial_data
Create Date: 2024-11-03 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003_add_composite_indexes'
down_revision: Union[str, None] = '002_seed_initial_data'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add composite indexes for critical queries."""
    
    # Priority 1: Critical for performance
    
    # Discount code validation (code + is_active + expires_at)
    # Used in: cashier bot when validating discount code
    op.create_index(
        'idx_discounts_code_validation',
        'discounts',
        ['code', 'is_active', 'expires_at']
    )
    
    # Broadcast scheduler (status + send_at + is_test)
    # Used in: Celery Beat to find scheduled broadcasts
    op.create_index(
        'idx_broadcasts_scheduler',
        'broadcasts',
        ['status', 'send_at', 'is_test']
    )
    
    # Usage logs KPI (status + created_at + is_test)
    # Used in: Dashboard and reports for success/failure statistics
    op.create_index(
        'idx_usage_logs_kpi',
        'discount_usage_logs',
        ['status', sa.text('created_at DESC'), 'is_test']
    )
    
    # Priority 2: Important for UX
    
    # Birthday check (birthday + status + is_test)
    # Used in: Daily Celery Beat task to find birthdays
    op.create_index(
        'idx_users_birthday_check',
        'users',
        ['birthday', 'status', 'is_test']
    )
    
    # User's active discounts (user_id + is_active + expires_at)
    # Used in: "Личный кабинет" to show user's active discounts
    op.create_index(
        'idx_discounts_user_active',
        'discounts',
        ['user_id', 'is_active', 'expires_at']
    )
    
    # Priority 3: Optimization
    
    # User segmentation (status + is_subscribed + is_test)
    # Used in: Broadcast recipient selection
    op.create_index(
        'idx_users_segmentation',
        'users',
        ['status', 'is_subscribed', 'is_test']
    )
    
    # Discount recurrence check (user_id + template_id + created_at DESC)
    # Used in: Checking if user can receive discount again (30 days rule)
    op.create_index(
        'idx_discounts_recurrence',
        'discounts',
        ['user_id', 'template_id', sa.text('created_at DESC')]
    )
    
    # Cashier statistics (cashier_id + created_at + status)
    # Used in: Admin panel to show cashier performance
    op.create_index(
        'idx_usage_logs_cashier_stats',
        'discount_usage_logs',
        ['cashier_id', sa.text('created_at DESC'), 'status']
    )


def downgrade() -> None:
    """Remove composite indexes."""
    op.drop_index('idx_usage_logs_cashier_stats', table_name='discount_usage_logs')
    op.drop_index('idx_discounts_recurrence', table_name='discounts')
    op.drop_index('idx_users_segmentation', table_name='users')
    op.drop_index('idx_discounts_user_active', table_name='discounts')
    op.drop_index('idx_users_birthday_check', table_name='users')
    op.drop_index('idx_usage_logs_kpi', table_name='discount_usage_logs')
    op.drop_index('idx_broadcasts_scheduler', table_name='broadcasts')
    op.drop_index('idx_discounts_code_validation', table_name='discounts')


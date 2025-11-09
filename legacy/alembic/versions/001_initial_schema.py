"""Initial schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2024-11-03 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables."""
    
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('first_name', sa.String(255), nullable=True),
        sa.Column('last_name', sa.String(255), nullable=True),
        sa.Column('display_name', sa.String(512), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('gender', sa.String(10), nullable=False, server_default='unknown'),
        sa.Column('birthday', sa.Date(), nullable=True),
        sa.Column('source', sa.String(255), nullable=True),
        sa.Column('source_normalized', sa.String(255), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='active'),
        sa.Column('is_subscribed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('telegram_id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    # Indexes for users
    op.create_index('idx_users_telegram_id', 'users', ['telegram_id'])
    op.create_index('idx_users_source_normalized', 'users', ['source_normalized'])
    op.create_index('idx_users_is_subscribed', 'users', ['is_subscribed'])
    op.create_index('idx_users_status', 'users', ['status'])
    op.create_index('idx_users_is_test', 'users', ['is_test'])
    op.create_index('idx_users_birthday', 'users', ['birthday'])
    
    # Admins table
    op.create_table(
        'admins',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('display_name', sa.String(512), nullable=True),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('can_broadcast_from_chat', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('notification_groups', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('telegram_id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_admins_telegram_id', 'admins', ['telegram_id'])
    op.create_index('idx_admins_role', 'admins', ['role'])
    op.create_index('idx_admins_is_active', 'admins', ['is_active'])
    
    # Cashiers table
    op.create_table(
        'cashiers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('display_name', sa.String(512), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('approved_by_admin_id', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('store_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('telegram_id'),
        sa.ForeignKeyConstraint(['approved_by_admin_id'], ['admins.id'], ondelete='SET NULL'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_cashiers_telegram_id', 'cashiers', ['telegram_id'])
    op.create_index('idx_cashiers_is_active', 'cashiers', ['is_active'])
    
    # Discount templates table
    op.create_table(
        'discount_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('template_type', sa.String(20), nullable=False),
        sa.Column('value_type', sa.String(10), nullable=False),
        sa.Column('value', sa.Numeric(10, 2), nullable=False),
        sa.Column('validity_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('recurrence', sa.JSON(), nullable=True),
        sa.Column('usage_type', sa.String(10), nullable=False, server_default='single'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('description', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_discount_templates_template_type', 'discount_templates', ['template_type'])
    op.create_index('idx_discount_templates_is_active', 'discount_templates', ['is_active'])
    
    # Discounts table
    op.create_table(
        'discounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        sa.ForeignKeyConstraint(['template_id'], ['discount_templates.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_discounts_code', 'discounts', ['code'])
    op.create_index('idx_discounts_user_id', 'discounts', ['user_id'])
    op.create_index('idx_discounts_template_id', 'discounts', ['template_id'])
    op.create_index('idx_discounts_expires_at', 'discounts', ['expires_at'])
    op.create_index('idx_discounts_used_at', 'discounts', ['used_at'])
    op.create_index('idx_discounts_is_active', 'discounts', ['is_active'])
    op.create_index('idx_discounts_is_test', 'discounts', ['is_test'])
    
    # Discount usage logs table
    op.create_table(
        'discount_usage_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('discount_id', sa.Integer(), nullable=True),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('cashier_id', sa.Integer(), nullable=True),
        sa.Column('store_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('message', sa.String(512), nullable=True),
        sa.Column('user_not_notified', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['discount_id'], ['discounts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['cashier_id'], ['cashiers.id'], ondelete='SET NULL'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_usage_logs_created_at', 'discount_usage_logs', ['created_at'])
    op.create_index('idx_usage_logs_cashier_id', 'discount_usage_logs', ['cashier_id'])
    op.create_index('idx_usage_logs_status', 'discount_usage_logs', ['status'])
    op.create_index('idx_usage_logs_discount_id', 'discount_usage_logs', ['discount_id'])
    op.create_index('idx_usage_logs_code', 'discount_usage_logs', ['code'])
    op.create_index('idx_usage_logs_is_test', 'discount_usage_logs', ['is_test'])
    op.create_index('idx_usage_logs_store_id', 'discount_usage_logs', ['store_id'])
    
    # Segments table
    op.create_table(
        'segments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(512), nullable=True),
        sa.Column('definition', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_segments_name', 'segments', ['name'])
    op.create_index('idx_segments_is_active', 'segments', ['is_active'])
    
    # Broadcasts table
    op.create_table(
        'broadcasts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('media_type', sa.String(20), nullable=False, server_default='none'),
        sa.Column('media_file_id', sa.String(255), nullable=True),
        sa.Column('buttons', sa.JSON(), nullable=True),
        sa.Column('filters', sa.JSON(), nullable=True),
        sa.Column('segment_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('send_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('recipient_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('success_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by_admin_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['segment_id'], ['segments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_admin_id'], ['admins.id'], ondelete='RESTRICT'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_broadcasts_status', 'broadcasts', ['status'])
    op.create_index('idx_broadcasts_send_at', 'broadcasts', ['send_at'])
    op.create_index('idx_broadcasts_created_by_admin_id', 'broadcasts', ['created_by_admin_id'])
    op.create_index('idx_broadcasts_is_test', 'broadcasts', ['is_test'])
    
    # Message templates table
    op.create_table(
        'message_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_message_templates_key', 'message_templates', ['key'])
    
    # Settings table
    op.create_table(
        'settings',
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('value_type', sa.String(10), nullable=False, server_default='string'),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_by_admin_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
        sa.ForeignKeyConstraint(['updated_by_admin_id'], ['admins.id'], ondelete='SET NULL'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    # Audit logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.BigInteger(), nullable=True),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['admin_id'], ['admins.id'], ondelete='SET NULL'),
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci'
    )
    
    op.create_index('idx_audit_logs_entity_type', 'audit_logs', ['entity_type'])
    op.create_index('idx_audit_logs_entity_id', 'audit_logs', ['entity_id'])
    op.create_index('idx_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('idx_audit_logs_admin_id', 'audit_logs', ['admin_id'])
    op.create_index('idx_audit_logs_created_at', 'audit_logs', ['created_at'])
    op.create_index('idx_audit_logs_is_test', 'audit_logs', ['is_test'])


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('audit_logs')
    op.drop_table('settings')
    op.drop_table('message_templates')
    op.drop_table('broadcasts')
    op.drop_table('segments')
    op.drop_table('discount_usage_logs')
    op.drop_table('discounts')
    op.drop_table('discount_templates')
    op.drop_table('cashiers')
    op.drop_table('admins')
    op.drop_table('users')


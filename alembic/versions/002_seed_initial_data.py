"""Seed initial data

Revision ID: 002_seed_initial_data
Revises: 001_initial_schema
Create Date: 2024-11-03 14:30:00.000000

"""
from typing import Sequence, Union
import os
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
from sqlalchemy import String, Text, Integer, Boolean, JSON as SAJSON, DateTime

# revision identifiers, used by Alembic.
revision: str = '002_seed_initial_data'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Insert initial data."""
    
    # Define tables for bulk insert
    message_templates = table(
        'message_templates',
        column('key', String),
        column('body', Text),
        column('variables', SAJSON),
        column('description', String),
        column('is_test', Boolean)
    )
    
    settings = table(
        'settings',
        column('key', String),
        column('value', Text),
        column('value_type', String),
        column('description', String)
    )
    
    segments = table(
        'segments',
        column('name', String),
        column('description', String),
        column('definition', SAJSON),
        column('is_active', Boolean),
        column('is_test', Boolean)
    )
    
    discount_templates = table(
        'discount_templates',
        column('name', String),
        column('template_type', String),
        column('value_type', String),
        column('value', sa.Numeric),
        column('validity_days', Integer),
        column('recurrence', SAJSON),
        column('usage_type', String),
        column('is_active', Boolean),
        column('description', String),
        column('is_test', Boolean)
    )
    
    admins = table(
        'admins',
        column('telegram_id', sa.BigInteger),
        column('username', String),
        column('display_name', String),
        column('role', String),
        column('can_broadcast_from_chat', Boolean),
        column('is_active', Boolean),
        column('notification_groups', SAJSON),
        column('is_test', Boolean)
    )
    
    # Insert message templates
    op.bulk_insert(message_templates, [
        {
            'key': 'welcome',
            'body': '👋 Привет, {{first_name}}!\n\nДобро пожаловать в систему лояльности «Мармеладный Дворик».',
            'variables': json.dumps(['first_name']),
            'description': 'Welcome message for new users',
            'is_test': False
        },
        {
            'key': 'subscription_prompt',
            'body': '📢 Подпишитесь на наш канал {{channel_link}} и получите скидку!',
            'variables': json.dumps(['channel_link']),
            'description': 'Prompt to subscribe to channel',
            'is_test': False
        },
        {
            'key': 'subscription_success',
            'body': '✅ Отлично! Вы подписаны на канал.\n\n🎁 Ваш код скидки: <code>{{discount_code}}</code>\nДействителен до: {{discount_expires_at}}',
            'variables': json.dumps(['discount_code', 'discount_expires_at']),
            'description': 'Success message after subscription',
            'is_test': False
        },
        {
            'key': 'birthday_greeting',
            'body': '🎉 С Днём Рождения, {{first_name}}!\n\n🎁 Специально для вас скидка: <code>{{discount_code}}</code>\nДействительна до: {{discount_expires_at}}',
            'variables': json.dumps(['first_name', 'discount_code', 'discount_expires_at']),
            'description': 'Birthday greeting with discount',
            'is_test': False
        },
        {
            'key': 'discount_redeemed',
            'body': '✅ Ваша скидка <code>{{discount_code}}</code> успешно использована.\n\nСпасибо за покупку!',
            'variables': json.dumps(['discount_code']),
            'description': 'Notification when discount is redeemed',
            'is_test': False
        },
        {
            'key': 'discount_issued',
            'body': '🎁 Вам выдана новая скидка!\n\nКод: <code>{{discount_code}}</code>\nСкидка: {{discount_value}}\nДействительна до: {{discount_expires_at}}',
            'variables': json.dumps(['discount_code', 'discount_value', 'discount_expires_at']),
            'description': 'Notification when new discount is issued',
            'is_test': False
        },
        {
            'key': 'cashier_welcome',
            'body': '👋 Добро пожаловать в систему погашения скидок!\n\nОтправьте мне код скидки для проверки.',
            'variables': json.dumps([]),
            'description': 'Welcome message for cashiers',
            'is_test': False
        },
        {
            'key': 'cashier_not_active',
            'body': '⚠️ Ваша учётная запись кассира не активирована.\n\nОбратитесь к администратору.',
            'variables': json.dumps([]),
            'description': 'Message when cashier is not activated',
            'is_test': False
        },
        {
            'key': 'code_not_found',
            'body': '❌ Код <code>{{code}}</code> не найден.\n\nПроверьте правильность ввода.',
            'variables': json.dumps(['code']),
            'description': 'Message when discount code is not found',
            'is_test': False
        },
        {
            'key': 'code_expired',
            'body': '❌ Код <code>{{code}}</code> истёк.\n\nСрок действия истёк: {{expires_at}}',
            'variables': json.dumps(['code', 'expires_at']),
            'description': 'Message when discount code is expired',
            'is_test': False
        },
        {
            'key': 'code_already_used',
            'body': '❌ Код <code>{{code}}</code> уже использован.\n\nИспользован: {{used_at}}',
            'variables': json.dumps(['code', 'used_at']),
            'description': 'Message when discount code was already used',
            'is_test': False
        }
    ])
    
    # Insert system settings
    op.bulk_insert(settings, [
        {
            'key': 'telegram_channel_id',
            'value': '@marmeladny_dvorik',
            'value_type': 'string',
            'description': 'Telegram channel ID for subscription checks'
        },
        {
            'key': 'rate_limit_per_minute',
            'value': '25',
            'value_type': 'int',
            'description': 'Maximum broadcast messages per minute (Telegram API limit)'
        },
        {
            'key': 'birthday_hour',
            'value': '9',
            'value_type': 'int',
            'description': 'Hour to send birthday greetings (Vladivostok timezone)'
        },
        {
            'key': 'birthday_minute',
            'value': '0',
            'value_type': 'int',
            'description': 'Minute to send birthday greetings'
        },
        {
            'key': 'auto_broadcast_from_admins',
            'value': 'true',
            'value_type': 'bool',
            'description': 'Allow admins to send broadcasts directly from Telegram chat'
        },
        {
            'key': 'code_prefix',
            'value': '',
            'value_type': 'string',
            'description': 'Optional prefix for discount codes'
        },
        {
            'key': 'subscription_cache_ttl',
            'value': '60',
            'value_type': 'int',
            'description': 'Cache TTL for subscription checks (seconds)'
        },
        {
            'key': 'default_discount_validity_days',
            'value': '30',
            'value_type': 'int',
            'description': 'Default validity period for discounts (days)'
        },
        {
            'key': 'broadcast_groups',
            'value': json.dumps([
                {'id': 'all', 'name': 'Все пользователи'},
                {'id': 'subscribers', 'name': 'Подписчики'},
                {'id': 'vip', 'name': 'VIP клиенты'}
            ], ensure_ascii=False),
            'value_type': 'json',
            'description': 'Available broadcast groups for admins'
        },
        {
            'key': 'notification_groups',
            'value': json.dumps([
                'errors',
                'cashier_logs',
                'settings',
                'broadcasts'
            ], ensure_ascii=False),
            'value_type': 'json',
            'description': 'Available notification groups for admins'
        }
    ])
    
    # Insert default segments
    op.bulk_insert(segments, [
        {
            'name': 'Все активные',
            'description': 'Все активные пользователи',
            'definition': json.dumps({'status': 'active'}),
            'is_active': True,
            'is_test': False
        },
        {
            'name': 'Подписчики',
            'description': 'Пользователи, подписанные на канал',
            'definition': json.dumps({'status': 'active', 'is_subscribed': True}),
            'is_active': True,
            'is_test': False
        },
        {
            'name': 'VIP',
            'description': 'VIP клиенты',
            'definition': json.dumps({'status': 'active', 'tags': ['vip']}),
            'is_active': True,
            'is_test': False
        },
        {
            'name': 'Женщины',
            'description': 'Женщины',
            'definition': json.dumps({'status': 'active', 'gender': 'female'}),
            'is_active': True,
            'is_test': False
        },
        {
            'name': 'Мужчины',
            'description': 'Мужчины',
            'definition': json.dumps({'status': 'active', 'gender': 'male'}),
            'is_active': True,
            'is_test': False
        }
    ])
    
    # Insert default discount templates
    op.bulk_insert(discount_templates, [
        {
            'name': 'Скидка за подписку',
            'template_type': 'subscription',
            'value_type': 'percent',
            'value': 10.00,
            'validity_days': 30,
            'recurrence': json.dumps({'type': 'days', 'value': 30}),
            'usage_type': 'single',
            'is_active': True,
            'description': 'Скидка 10% за подписку на канал (выдается раз в 30 дней)',
            'is_test': False
        },
        {
            'name': 'Скидка на День Рождения',
            'template_type': 'birthday',
            'value_type': 'percent',
            'value': 15.00,
            'validity_days': 7,
            'recurrence': None,
            'usage_type': 'single',
            'is_active': True,
            'description': 'Скидка 15% на День Рождения (действует 7 дней)',
            'is_test': False
        }
    ])
    
    # Insert first superadmin if FIRST_SUPERADMIN_TG_ID is set
    first_superadmin_tg_id = os.getenv('FIRST_SUPERADMIN_TG_ID')
    if first_superadmin_tg_id:
        try:
            tg_id = int(first_superadmin_tg_id)
            op.bulk_insert(admins, [
                {
                    'telegram_id': tg_id,
                    'username': None,
                    'display_name': 'Superadmin',
                    'role': 'owner',
                    'can_broadcast_from_chat': True,
                    'is_active': True,
                    'notification_groups': json.dumps(['errors', 'cashier_logs', 'settings', 'broadcasts']),
                    'is_test': False
                }
            ])
        except ValueError:
            pass  # Invalid telegram_id, skip


def downgrade() -> None:
    """Remove initial data."""
    op.execute("DELETE FROM discount_templates WHERE is_test = 0")
    op.execute("DELETE FROM segments WHERE is_test = 0")
    op.execute("DELETE FROM settings")
    op.execute("DELETE FROM message_templates WHERE is_test = 0")
    op.execute("DELETE FROM admins WHERE is_test = 0")


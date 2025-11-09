"""Services package."""
from services.user_service import (
    get_user_by_id,
    get_user_by_telegram_id,
    create_user,
    update_user,
    get_all_users,
    delete_user
)
from services.subscription_service import (
    subscribe_user,
    unsubscribe_user,
    issue_subscription_discount
)
from services.discount_service import (
    create_discount_for_user,
    validate_discount_code,
    redeem_discount,
    find_discount_by_code
)
from services.template_service import (
    get_template_by_id,
    get_active_template,
    create_template,
    update_template
)
from services.broadcast_service import (
    get_broadcast_by_id,
    create_broadcast,
    update_broadcast,
    get_recipients,
    schedule_broadcast,
    send_broadcast_now
)
from services.segment_service import (
    get_segment_by_id,
    get_all_segments,
    create_segment,
    update_segment,
    get_segment_users
)
from services.telegram_client import (
    TelegramClient,
    get_main_bot_client,
    get_auth_bot_client
)
from services.admin_service import (
    get_admin_by_id,
    get_admin_by_telegram_id,
    get_admin_by_email,
    create_admin,
    authenticate_admin
)
from services.message_service import (
    get_template_by_key,
    render_template,
    get_welcome_message,
    get_subscription_success_message
)
from services.audit_service import (
    log_action,
    log_user_created,
    log_discount_issued,
    log_broadcast_sent
)
from services.notification_service import (
    send_user_notification,
    send_admin_notification,
    send_discount_notification,
    send_welcome_message
)

__all__ = [
    # User service
    "get_user_by_id",
    "get_user_by_telegram_id",
    "create_user",
    "update_user",
    "get_all_users",
    "delete_user",
    # Subscription service
    "subscribe_user",
    "unsubscribe_user",
    "issue_subscription_discount",
    # Discount service
    "create_discount_for_user",
    "validate_discount_code",
    "redeem_discount",
    "find_discount_by_code",
    # Template service
    "get_template_by_id",
    "get_active_template",
    "create_template",
    "update_template",
    # Broadcast service
    "get_broadcast_by_id",
    "create_broadcast",
    "update_broadcast",
    "get_recipients",
    "schedule_broadcast",
    "send_broadcast_now",
    # Segment service
    "get_segment_by_id",
    "get_all_segments",
    "create_segment",
    "update_segment",
    "get_segment_users",
    # Telegram client
    "TelegramClient",
    "get_main_bot_client",
    "get_auth_bot_client",
    # Admin service
    "get_admin_by_id",
    "get_admin_by_telegram_id",
    "get_admin_by_email",
    "create_admin",
    "authenticate_admin",
    # Message service
    "get_template_by_key",
    "render_template",
    "get_welcome_message",
    "get_subscription_success_message",
    # Audit service
    "log_action",
    "log_user_created",
    "log_discount_issued",
    "log_broadcast_sent",
    # Notification service
    "send_user_notification",
    "send_admin_notification",
    "send_discount_notification",
    "send_welcome_message",
]


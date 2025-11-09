"""Tasks package for Celery background jobs."""
from tasks.broadcast_tasks import send_broadcast_chunk, process_broadcast
from tasks.notification_tasks import (
    send_user_notification,
    notify_discount_redeemed,
    notify_admins_about_error,
    send_birthday_discount,
    send_subscription_discount
)
from tasks.birthday_tasks import check_birthdays
from tasks.scheduled_broadcast_tasks import check_scheduled_broadcasts
from tasks.bulk_operations_tasks import (
    bulk_add_tags,
    bulk_remove_tags,
    bulk_assign_discount,
    bulk_export
)

__all__ = [
    # Broadcast tasks
    "send_broadcast_chunk",
    "process_broadcast",
    # Notification tasks
    "send_user_notification",
    "notify_discount_redeemed",
    "notify_admins_about_error",
    "send_birthday_discount",
    "send_subscription_discount",
    # Birthday tasks
    "check_birthdays",
    # Scheduled broadcast tasks
    "check_scheduled_broadcasts",
    # Bulk operations tasks
    "bulk_add_tags",
    "bulk_remove_tags",
    "bulk_assign_discount",
    "bulk_export",
]


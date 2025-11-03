"""Celery application configuration."""
from celery import Celery
from celery.schedules import crontab

from core.config import settings


# Create Celery app
celery_app = Celery(
    "marmeladny_dvorik",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.broadcast_tasks",
        "tasks.notification_tasks",
        "tasks.birthday_tasks",
        "tasks.scheduled_broadcast_tasks",
        "tasks.bulk_operations_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    # Timezone
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=True,
    
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    
    # Rate limiting (Telegram API limits)
    task_default_rate_limit=f"{settings.TELEGRAM_RATE_LIMIT_PER_MINUTE}/m",
    
    # Retry settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Result backend settings
    result_expires=3600,  # 1 hour
    result_backend_transport_options={
        "master_name": "mymaster",
    },
    
    # Worker settings
    worker_prefetch_multiplier=1,  # One task at a time for rate limiting
    worker_max_tasks_per_child=1000,
    
    # Beat schedule
    beat_schedule={
        # Check birthdays daily at 09:00 Vladivostok time
        "check-birthdays-daily": {
            "task": "tasks.birthday_tasks.check_birthdays",
            "schedule": crontab(
                hour=settings.BIRTHDAY_CHECK_HOUR,
                minute=settings.BIRTHDAY_CHECK_MINUTE,
            ),
        },
        # Check scheduled broadcasts every minute
        "check-scheduled-broadcasts": {
            "task": "tasks.scheduled_broadcast_tasks.check_scheduled_broadcasts",
            "schedule": crontab(minute="*"),  # Every minute
        },
    },
)

# Optional: Configure task routes for different queues
celery_app.conf.task_routes = {
    "tasks.broadcast_tasks.*": {"queue": "broadcasts"},
    "tasks.notification_tasks.*": {"queue": "notifications"},
    "tasks.birthday_tasks.*": {"queue": "birthdays"},
    "tasks.bulk_operations_tasks.*": {"queue": "bulk"},
}


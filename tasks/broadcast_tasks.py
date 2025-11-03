"""Broadcast tasks for sending mass messages."""
import logging
from typing import List
from celery import Task
from sqlalchemy import select

from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from models.broadcast import Broadcast, BroadcastStatus
from models.user import User
from services.telegram_client import get_main_bot_client
from services.broadcast_service import get_broadcast_by_id, get_recipients, update_broadcast_stats

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1000  # Users per chunk
RATE_LIMIT_PER_MINUTE = 25  # Telegram API rate limit


class BroadcastTask(Task):
    """Base task with automatic retry on rate limit."""
    
    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600  # 10 minutes
    max_retries = 3
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        logger.error(f"Broadcast task {task_id} failed: {exc}")


@celery_app.task(
    bind=True,
    base=BroadcastTask,
    name="tasks.send_broadcast_chunk",
    rate_limit=f"{RATE_LIMIT_PER_MINUTE}/m"
)
def send_broadcast_chunk(
    self,
    broadcast_id: int,
    user_ids: List[int]
):
    """
    Send broadcast to chunk of users.
    
    Args:
        broadcast_id: Broadcast ID
        user_ids: List of user IDs to send to
    """
    import asyncio
    
    async def _send():
        async with AsyncSessionLocal() as db:
            # Get broadcast
            broadcast = await get_broadcast_by_id(db, broadcast_id)
            
            if not broadcast:
                logger.error(f"Broadcast {broadcast_id} not found")
                return
            
            # Get users
            result = await db.execute(
                select(User).where(User.id.in_(user_ids))
            )
            users = result.scalars().all()
            
            # Send messages
            bot = get_main_bot_client()
            success_count = 0
            error_count = 0
            
            for user in users:
                try:
                    # Determine send method based on media type
                    if broadcast.media_type == "text":
                        await bot.send_message(
                            chat_id=user.telegram_id,
                            text=broadcast.message,
                            reply_markup=broadcast.inline_keyboard
                        )
                    elif broadcast.media_type == "photo":
                        await bot.send_photo(
                            chat_id=user.telegram_id,
                            photo=broadcast.media_file_id,
                            caption=broadcast.message,
                            reply_markup=broadcast.inline_keyboard
                        )
                    elif broadcast.media_type == "video":
                        await bot.send_video(
                            chat_id=user.telegram_id,
                            video=broadcast.media_file_id,
                            caption=broadcast.message,
                            reply_markup=broadcast.inline_keyboard
                        )
                    
                    success_count += 1
                
                except Exception as e:
                    error_str = str(e)
                    
                    # Don't retry on 403 (user blocked bot)
                    if "403" in error_str or "blocked" in error_str.lower():
                        logger.info(f"User {user.id} blocked bot, skipping")
                        error_count += 1
                        continue
                    
                    # Retry on 429 (rate limit)
                    if "429" in error_str:
                        logger.warning(f"Rate limit hit, will retry")
                        raise
                    
                    logger.error(f"Error sending to user {user.id}: {e}")
                    error_count += 1
            
            # Update broadcast stats
            await update_broadcast_stats(
                db,
                broadcast_id=broadcast_id,
                success_increment=success_count,
                error_increment=error_count
            )
            
            await db.commit()
            
            logger.info(
                f"Broadcast {broadcast_id} chunk completed: "
                f"{success_count} success, {error_count} errors"
            )
    
    # Run async function
    asyncio.run(_send())


@celery_app.task(
    bind=True,
    name="tasks.process_broadcast"
)
def process_broadcast(self, broadcast_id: int):
    """
    Process broadcast by splitting into chunks and sending.
    
    Args:
        broadcast_id: Broadcast ID
    """
    import asyncio
    
    async def _process():
        async with AsyncSessionLocal() as db:
            # Get broadcast
            broadcast = await get_broadcast_by_id(db, broadcast_id)
            
            if not broadcast:
                logger.error(f"Broadcast {broadcast_id} not found")
                return
            
            # Check status
            if broadcast.status != BroadcastStatus.SENDING:
                logger.error(
                    f"Broadcast {broadcast_id} is not in sending state: {broadcast.status}"
                )
                return
            
            # Get recipients
            recipients = await get_recipients(db, broadcast, is_test=broadcast.is_test)
            
            if not recipients:
                logger.warning(f"No recipients for broadcast {broadcast_id}")
                
                # Mark as sent
                broadcast.transition_to(BroadcastStatus.SENT)
                await db.commit()
                
                return
            
            logger.info(
                f"Processing broadcast {broadcast_id} with {len(recipients)} recipients"
            )
            
            # Split into chunks
            recipient_ids = [user.id for user in recipients]
            chunks = [
                recipient_ids[i:i + CHUNK_SIZE]
                for i in range(0, len(recipient_ids), CHUNK_SIZE)
            ]
            
            logger.info(f"Split into {len(chunks)} chunks")
            
            # Queue chunk tasks
            for chunk in chunks:
                send_broadcast_chunk.delay(broadcast_id, chunk)
            
            # Mark as sent (will be updated as chunks complete)
            broadcast.transition_to(BroadcastStatus.SENT)
            await db.commit()
            
            logger.info(f"Broadcast {broadcast_id} processing initiated")
    
    # Run async function
    asyncio.run(_process())


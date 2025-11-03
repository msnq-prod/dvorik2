"""Scheduled broadcast tasks for checking and triggering broadcasts."""
import logging
from datetime import datetime
from sqlalchemy import select

from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from core.utils import utc_to_vvo, vvo_to_utc, get_now_vvo
from models.broadcast import Broadcast, BroadcastStatus
from tasks.broadcast_tasks import process_broadcast

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.check_scheduled_broadcasts")
def check_scheduled_broadcasts():
    """
    Check for scheduled broadcasts that need to be sent.
    
    This task runs every minute and looks for broadcasts with:
    - status = 'scheduled'
    - send_at <= NOW (in VVO timezone)
    
    Then triggers the broadcast processing.
    """
    import asyncio
    
    async def _check():
        async with AsyncSessionLocal() as db:
            # Get current time in VVO
            now_vvo = get_now_vvo()
            
            # Convert to UTC for database comparison
            now_utc = vvo_to_utc(now_vvo)
            
            # Find scheduled broadcasts that should be sent
            result = await db.execute(
                select(Broadcast).where(
                    Broadcast.status == BroadcastStatus.SCHEDULED,
                    Broadcast.send_at <= now_utc
                )
            )
            
            broadcasts = result.scalars().all()
            
            if not broadcasts:
                logger.debug("No scheduled broadcasts to send")
                return
            
            logger.info(f"Found {len(broadcasts)} broadcasts to send")
            
            # Process each broadcast
            for broadcast in broadcasts:
                try:
                    # Transition to sending state
                    if not broadcast.can_transition_to(BroadcastStatus.SENDING):
                        logger.warning(
                            f"Broadcast {broadcast.id} cannot transition to sending"
                        )
                        continue
                    
                    broadcast.transition_to(BroadcastStatus.SENDING)
                    await db.commit()
                    
                    # Queue broadcast processing task
                    process_broadcast.delay(broadcast.id)
                    
                    logger.info(f"Broadcast {broadcast.id} queued for sending")
                
                except Exception as e:
                    logger.error(f"Error processing broadcast {broadcast.id}: {e}")
                    await db.rollback()
                    
                    # Mark as error
                    try:
                        broadcast.transition_to(BroadcastStatus.ERROR)
                        await db.commit()
                    except:
                        pass
    
    # Run async function
    asyncio.run(_check())


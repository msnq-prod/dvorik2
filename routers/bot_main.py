"""Main bot webhook handler for client interactions."""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import RedisClient
from services.user_service import get_user_by_telegram_id, create_user, update_user
from services.subscription_service import subscribe_user, issue_subscription_discount
from services.telegram_client import get_main_bot_client
from services.message_service import render_template
from services.discount_service import find_discount_by_code
from models.user import UserGender
from schemas.user import UserUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Telegram Webhooks"])


async def parse_source_from_start(start_param: Optional[str]) -> Optional[str]:
    """
    Parse source from /start command deep link parameter.
    
    Args:
        start_param: Start parameter (e.g., "ref_instagram")
    
    Returns:
        Source string or None
    """
    if not start_param:
        return None
    
    if start_param.startswith("ref_"):
        return start_param[4:]  # Remove "ref_" prefix
    
    return start_param


async def handle_start_command(
    db: AsyncSession,
    telegram_id: int,
    first_name: str,
    last_name: Optional[str],
    username: Optional[str],
    start_param: Optional[str]
):
    """
    Handle /start command.
    
    Creates new user or updates existing one.
    Sends welcome message.
    
    Args:
        db: Database session
        telegram_id: User's Telegram ID
        first_name: User's first name
        last_name: User's last name
        username: User's username
        start_param: Deep link parameter
    """
    bot = get_main_bot_client()
    
    # Check if user exists
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        # Parse source from deep link
        source = await parse_source_from_start(start_param)
        
        # Create new user
        user = await create_user(
            db,
            telegram_id=telegram_id,
            first_name=first_name,
            last_name=last_name,
            username=username,
            source=source
        )
        
        await db.commit()
        
        logger.info(f"New user created: {user.id} (source: {source})")
    
    # Send welcome message
    welcome_text = await render_template(
        db,
        "welcome",
        {"name": user.display_name}
    )
    
    # Create inline keyboard
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🔔 Подписаться на рассылку", "callback_data": "subscribe"}
            ],
            [
                {"text": "🎁 Мои скидки", "callback_data": "my_discounts"}
            ],
            [
                {"text": "ℹ️ Помощь", "callback_data": "help"}
            ]
        ]
    }
    
    await bot.send_message(
        chat_id=telegram_id,
        text=welcome_text or "Добро пожаловать в Мармеладный Дворик! 🍬",
        reply_markup=keyboard
    )


async def handle_callback_subscribe(
    db: AsyncSession,
    redis: RedisClient,
    telegram_id: int,
    callback_query_id: str
):
    """
    Handle subscription callback.
    
    Args:
        db: Database session
        redis: Redis client
        telegram_id: User's Telegram ID
        callback_query_id: Callback query ID
    """
    bot = get_main_bot_client()
    
    # Get user
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        await bot.send_message(
            chat_id=telegram_id,
            text="Пользователь не найден. Пожалуйста, нажмите /start"
        )
        return
    
    if user.is_subscribed:
        await bot.send_message(
            chat_id=telegram_id,
            text="Вы уже подписаны на рассылку! ✅"
        )
        return
    
    # Subscribe user
    await subscribe_user(db, user.id)
    
    # Issue subscription discount
    discount = await issue_subscription_discount(db, user.id)
    
    await db.commit()
    
    # Send confirmation
    if discount:
        text = await render_template(
            db,
            "subscription_discount",
            {
                "code": discount.code,
                "expires_at": discount.expires_at.strftime("%d.%m.%Y")
            }
        )
    else:
        text = await render_template(db, "subscription_success")
    
    await bot.send_message(
        chat_id=telegram_id,
        text=text or "Спасибо за подписку! 🎉"
    )
    
    logger.info(f"User {user.id} subscribed, discount: {discount.code if discount else 'none'}")


async def handle_callback_my_discounts(
    db: AsyncSession,
    telegram_id: int
):
    """
    Handle "my discounts" callback.
    
    Shows list of user's active discounts.
    
    Args:
        db: Database session
        telegram_id: User's Telegram ID
    """
    from sqlalchemy import select
    from models.discount import Discount
    from datetime import datetime
    
    bot = get_main_bot_client()
    
    # Get user
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        await bot.send_message(
            chat_id=telegram_id,
            text="Пользователь не найден. Пожалуйста, нажмите /start"
        )
        return
    
    # Get active discounts
    result = await db.execute(
        select(Discount).where(
            Discount.user_id == user.id,
            Discount.is_active == True,
            Discount.used_at.is_(None),
            Discount.expires_at > datetime.utcnow()
        ).order_by(Discount.expires_at)
    )
    
    discounts = list(result.scalars().all())
    
    if not discounts:
        text = "У вас пока нет активных скидок.\n\n"
        text += "Подпишитесь на рассылку, чтобы получить скидку! 🎁"
    else:
        text = "🎁 <b>Ваши активные скидки:</b>\n\n"
        
        for discount in discounts:
            text += f"<b>{discount.code}</b>\n"
            text += f"Скидка: {discount.template.format_value()}\n"
            text += f"Действует до: {discount.expires_at.strftime('%d.%m.%Y')}\n"
            text += "—————————————\n"
        
        text += "\n💡 Покажите код кассиру для активации скидки"
    
    await bot.send_message(
        chat_id=telegram_id,
        text=text,
        parse_mode="HTML"
    )


async def handle_awaiting_birthday(
    db: AsyncSession,
    redis: RedisClient,
    telegram_id: int,
    text: str
):
    """
    Handle birthday input from user.
    
    Expected formats:
    - DD.MM.YYYY
    - DD.MM.YY
    - DD/MM/YYYY
    
    Args:
        db: Database session
        redis: Redis client
        telegram_id: User's Telegram ID
        text: Birthday text
    """
    from core.utils import normalize_birthday
    
    bot = get_main_bot_client()
    
    # Parse birthday
    birthday = normalize_birthday(text)
    
    if not birthday:
        await bot.send_message(
            chat_id=telegram_id,
            text="Неверный формат даты. Пожалуйста, введите дату рождения в формате ДД.ММ.ГГГГ (например, 25.12.1990)"
        )
        return
    
    # Get user
    user = await get_user_by_telegram_id(db, telegram_id)
    
    if not user:
        await bot.send_message(
            chat_id=telegram_id,
            text="Пользователь не найден. Пожалуйста, нажмите /start"
        )
        return
    
    # Update birthday
    await update_user(db, user.id, UserUpdate(birthday=birthday))
    await db.commit()
    
    # Clear FSM state
    await redis.delete_fsm_state(telegram_id)
    
    await bot.send_message(
        chat_id=telegram_id,
        text="Спасибо! Дата рождения сохранена. В день рождения вы получите специальную скидку! 🎂🎁"
    )
    
    logger.info(f"User {user.id} updated birthday: {birthday}")


@router.post("/main-bot")
async def main_bot_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Main bot webhook endpoint.
    
    Handles:
    - /start command with source tracking
    - Text messages (FSM: awaiting_birthday)
    - Callback queries (subscribe, my_discounts)
    - Broadcast from chat (for admins with can_broadcast_from_chat flag)
    
    Args:
        request: Request object
        db: Database session
    
    Returns:
        Success response
    """
    try:
        # Parse webhook data
        data: Dict[str, Any] = await request.json()
        
        redis = RedisClient()
        
        # Handle message
        if "message" in data:
            message = data["message"]
            telegram_id = message["from"]["id"]
            first_name = message["from"].get("first_name", "")
            last_name = message["from"].get("last_name")
            username = message["from"].get("username")
            
            # Handle /start command
            if "text" in message and message["text"].startswith("/start"):
                parts = message["text"].split(" ", 1)
                start_param = parts[1] if len(parts) > 1 else None
                
                await handle_start_command(
                    db,
                    telegram_id,
                    first_name,
                    last_name,
                    username,
                    start_param
                )
            
            # Handle text message (FSM)
            elif "text" in message:
                text = message["text"]
                
                # Check FSM state
                fsm_state = await redis.get_fsm_state(telegram_id)
                
                if fsm_state == "awaiting_birthday":
                    await handle_awaiting_birthday(db, redis, telegram_id, text)
                else:
                    # Unknown message
                    bot = get_main_bot_client()
                    await bot.send_message(
                        chat_id=telegram_id,
                        text="Я не понимаю эту команду. Нажмите /start для начала."
                    )
        
        # Handle callback query
        elif "callback_query" in data:
            callback = data["callback_query"]
            telegram_id = callback["from"]["id"]
            callback_query_id = callback["id"]
            callback_data = callback["data"]
            
            if callback_data == "subscribe":
                await handle_callback_subscribe(db, redis, telegram_id, callback_query_id)
            
            elif callback_data == "my_discounts":
                await handle_callback_my_discounts(db, telegram_id)
            
            elif callback_data == "help":
                help_text = await render_template(db, "help")
                bot = get_main_bot_client()
                await bot.send_message(
                    chat_id=telegram_id,
                    text=help_text or "Помощь: /start - начать, /help - помощь"
                )
        
        return {"ok": True}
    
    except Exception as e:
        logger.error(f"Error processing main bot webhook: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}


"""Auth bot webhook handler for cashiers and admins."""
import logging
from typing import Dict, Any
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import generate_one_time_token
from services.telegram_client import get_auth_bot_client
from services.discount_service import validate_discount_code, redeem_discount, find_discount_by_code
from services.admin_service import get_admin_by_telegram_id
from services.message_service import render_template
from models.cashier import Cashier
from models.admin import Admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Telegram Webhooks"])


async def handle_cashier_start(
    db: AsyncSession,
    telegram_id: int,
    first_name: str
):
    """
    Handle /start command for cashier.
    
    Args:
        db: Database session
        telegram_id: Cashier's Telegram ID
        first_name: Cashier's first name
    """
    bot = get_auth_bot_client()
    
    # Check if cashier exists
    result = await db.execute(
        select(Cashier).where(Cashier.telegram_id == telegram_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier:
        # Create pending cashier
        cashier = Cashier(
            telegram_id=telegram_id,
            is_active=False  # Needs approval
        )
        db.add(cashier)
        await db.commit()
        
        await bot.send_message(
            chat_id=telegram_id,
            text="Спасибо за регистрацию! Ваш аккаунт ожидает одобрения администратором. ⏳"
        )
        
        logger.info(f"New cashier registered: {cashier.id}")
        return
    
    if not cashier.is_active:
        await bot.send_message(
            chat_id=telegram_id,
            text="Ваш аккаунт ожидает одобрения администратором. ⏳"
        )
        return
    
    # Active cashier
    welcome_text = f"Добро пожаловать, {first_name}! 👋\n\n"
    welcome_text += "Для проверки скидки отправьте код скидки.\n\n"
    welcome_text += "Формат: <code>ABC1234</code>"
    
    await bot.send_message(
        chat_id=telegram_id,
        text=welcome_text,
        parse_mode="HTML"
    )


async def handle_admin_start(
    db: AsyncSession,
    telegram_id: int,
    admin: Admin
):
    """
    Handle /start command for admin.
    
    Generates one-time token for admin panel login.
    
    Args:
        db: Database session
        telegram_id: Admin's Telegram ID
        admin: Admin object
    """
    bot = get_auth_bot_client()
    
    # Generate one-time token
    token = await generate_one_time_token(telegram_id)
    
    # Create deep link
    from core.config import settings
    admin_panel_url = f"{settings.API_BASE_URL}/admin/login?token={token}"
    
    text = f"🔐 <b>Вход в админ-панель</b>\n\n"
    text += f"Привет, {admin.full_name}!\n\n"
    text += f"Нажмите кнопку ниже для входа в админ-панель:\n"
    
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🚀 Войти в админ-панель", "url": admin_panel_url}
            ]
        ]
    }
    
    await bot.send_message(
        chat_id=telegram_id,
        text=text,
        parse_mode="HTML",
        reply_markup=keyboard
    )
    
    logger.info(f"Admin {admin.id} requested login token")


async def handle_discount_code_input(
    db: AsyncSession,
    telegram_id: int,
    code: str
):
    """
    Handle discount code validation from cashier.
    
    Args:
        db: Database session
        telegram_id: Cashier's Telegram ID
        code: Discount code
    """
    bot = get_auth_bot_client()
    
    # Get cashier
    result = await db.execute(
        select(Cashier).where(Cashier.telegram_id == telegram_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier or not cashier.is_active:
        await bot.send_message(
            chat_id=telegram_id,
            text="Ваш аккаунт не активен. Обратитесь к администратору."
        )
        return
    
    # Validate code
    validation_result = await validate_discount_code(
        db,
        code=code,
        cashier_id=cashier.id,
        is_test=False
    )
    
    if not validation_result["valid"]:
        # Invalid code
        error_messages = {
            "CODE_NOT_FOUND": "❌ Код не найден",
            "CODE_ALREADY_USED": "❌ Код уже использован",
            "CODE_EXPIRED": "❌ Код истёк",
            "CODE_INACTIVE": "❌ Код неактивен",
            "CASHIER_NOT_ACTIVE": "❌ Ваш аккаунт неактивен"
        }
        
        error_code = validation_result.get("error_code", "UNKNOWN")
        error_text = error_messages.get(error_code, "❌ Ошибка проверки кода")
        
        await bot.send_message(
            chat_id=telegram_id,
            text=error_text
        )
        
        await db.commit()
        return
    
    # Valid code - show confirmation
    discount_id = validation_result["discount_id"]
    user_name = validation_result["user_display_name"]
    discount_value = validation_result["discount_value"]
    expires_at = validation_result["expires_at"]
    
    text = f"✅ <b>Код действителен!</b>\n\n"
    text += f"<b>Код:</b> {code}\n"
    text += f"<b>Клиент:</b> {user_name}\n"
    text += f"<b>Скидка:</b> {discount_value}\n"
    text += f"<b>Действует до:</b> {expires_at.strftime('%d.%m.%Y %H:%M')}\n\n"
    text += "Погасить скидку?"
    
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "✅ Погасить", "callback_data": f"redeem_{discount_id}"}
            ],
            [
                {"text": "❌ Отменить", "callback_data": "cancel"}
            ]
        ]
    }
    
    await bot.send_message(
        chat_id=telegram_id,
        text=text,
        parse_mode="HTML",
        reply_markup=keyboard
    )
    
    await db.commit()


async def handle_redeem_callback(
    db: AsyncSession,
    telegram_id: int,
    discount_id: int
):
    """
    Handle discount redemption callback.
    
    Args:
        db: Database session
        telegram_id: Cashier's Telegram ID
        discount_id: Discount ID to redeem
    """
    bot = get_auth_bot_client()
    
    # Get cashier
    result = await db.execute(
        select(Cashier).where(Cashier.telegram_id == telegram_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier or not cashier.is_active:
        await bot.send_message(
            chat_id=telegram_id,
            text="Ваш аккаунт не активен. Обратитесь к администратору."
        )
        return
    
    # Redeem discount
    result = await redeem_discount(
        db,
        discount_id=discount_id,
        cashier_id=cashier.id,
        store_id=cashier.store_id,
        is_test=False
    )
    
    if not result["success"]:
        await bot.send_message(
            chat_id=telegram_id,
            text=f"❌ Ошибка погашения: {result.get('message', 'Unknown error')}"
        )
        return
    
    await db.commit()
    
    # Send success message
    text = f"✅ <b>Скидка погашена!</b>\n\n"
    text += f"<b>Код:</b> {result['code']}\n\n"
    text += "Спасибо! 🎉"
    
    await bot.send_message(
        chat_id=telegram_id,
        text=text,
        parse_mode="HTML"
    )
    
    # Notify user
    from tasks.notification_tasks import notify_discount_redeemed
    notify_discount_redeemed.delay(
        user_id=result["user_id"],
        code=result["code"]
    )
    
    logger.info(f"Discount {discount_id} redeemed by cashier {cashier.id}")


@router.post("/auth-bot")
async def auth_bot_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Auth bot webhook endpoint.
    
    Handles:
    - /start command (different for cashiers and admins)
    - Text messages with discount codes (for cashiers)
    - Callback queries (redeem_discount)
    - Admin login token generation
    
    Args:
        request: Request object
        db: Database session
    
    Returns:
        Success response
    """
    try:
        # Parse webhook data
        data: Dict[str, Any] = await request.json()
        
        # Handle message
        if "message" in data:
            message = data["message"]
            telegram_id = message["from"]["id"]
            first_name = message["from"].get("first_name", "")
            
            # Check if user is admin
            admin = await get_admin_by_telegram_id(db, telegram_id)
            
            # Handle /start command
            if "text" in message and message["text"].startswith("/start"):
                if admin:
                    await handle_admin_start(db, telegram_id, admin)
                else:
                    await handle_cashier_start(db, telegram_id, first_name)
            
            # Handle text message (discount code)
            elif "text" in message and not admin:
                text = message["text"].strip().upper()
                
                # Check if it looks like a discount code
                if len(text) >= 5 and len(text) <= 10:
                    await handle_discount_code_input(db, telegram_id, text)
                else:
                    bot = get_auth_bot_client()
                    await bot.send_message(
                        chat_id=telegram_id,
                        text="Пожалуйста, отправьте код скидки (например: ABC1234)"
                    )
        
        # Handle callback query
        elif "callback_query" in data:
            callback = data["callback_query"]
            telegram_id = callback["from"]["id"]
            callback_data = callback["data"]
            
            if callback_data.startswith("redeem_"):
                discount_id = int(callback_data.split("_")[1])
                await handle_redeem_callback(db, telegram_id, discount_id)
            
            elif callback_data == "cancel":
                bot = get_auth_bot_client()
                await bot.send_message(
                    chat_id=telegram_id,
                    text="Операция отменена."
                )
        
        return {"ok": True}
    
    except Exception as e:
        logger.error(f"Error processing auth bot webhook: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}


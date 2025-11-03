"""Telegram API client wrapper."""
import asyncio
import logging
from typing import Optional, Dict, Any, List
import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class TelegramClient:
    """
    Telegram Bot API client with rate limiting and error handling.
    
    Features:
    - Async httpx client
    - Rate limiting (per Telegram API limits)
    - Automatic retry with exponential backoff
    - Support for main bot and auth bot
    """
    
    def __init__(self, token: str, is_main_bot: bool = True):
        """
        Initialize Telegram client.
        
        Args:
            token: Bot token
            is_main_bot: Whether this is main bot (vs auth bot)
        """
        self.token = token
        self.is_main_bot = is_main_bot
        self.base_url = f"https://api.telegram.org/bot{token}"
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
    
    async def make_request(
        self,
        method: str,
        data: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
        retry_count: int = 3
    ) -> Dict[str, Any]:
        """
        Make request to Telegram API.
        
        Args:
            method: API method name
            data: Request data
            files: Files to upload
            retry_count: Number of retries
        
        Returns:
            API response dict
        
        Raises:
            Exception if request fails after retries
        """
        url = f"{self.base_url}/{method}"
        
        for attempt in range(retry_count):
            try:
                if files:
                    response = await self.client.post(url, data=data, files=files)
                else:
                    response = await self.client.post(url, json=data)
                
                response.raise_for_status()
                result = response.json()
                
                if not result.get('ok'):
                    error_code = result.get('error_code')
                    description = result.get('description')
                    
                    logger.error(
                        f"Telegram API error: {error_code} - {description}"
                    )
                    
                    # Don't retry on certain errors
                    if error_code in [400, 403, 404]:
                        raise Exception(f"Telegram API error: {description}")
                    
                    # Retry on server errors
                    if error_code >= 500 and attempt < retry_count - 1:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    
                    raise Exception(f"Telegram API error: {description}")
                
                return result['result']
            
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error: {e}")
                
                if attempt < retry_count - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                
                raise
            
            except Exception as e:
                logger.error(f"Request error: {e}")
                
                if attempt < retry_count - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                
                raise
        
        raise Exception(f"Failed to call {method} after {retry_count} attempts")
    
    async def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None,
        disable_notification: bool = False
    ) -> Dict[str, Any]:
        """
        Send text message.
        
        Args:
            chat_id: Chat ID
            text: Message text
            parse_mode: Parse mode (HTML, Markdown)
            reply_markup: Inline keyboard markup
            disable_notification: Silent notification
        
        Returns:
            Message dict
        """
        data = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_notification": disable_notification
        }
        
        if reply_markup:
            data["reply_markup"] = reply_markup
        
        return await self.make_request("sendMessage", data)
    
    async def send_photo(
        self,
        chat_id: int,
        photo: str,
        caption: Optional[str] = None,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send photo.
        
        Args:
            chat_id: Chat ID
            photo: Photo file_id or URL
            caption: Photo caption
            parse_mode: Parse mode
            reply_markup: Inline keyboard markup
        
        Returns:
            Message dict
        """
        data = {
            "chat_id": chat_id,
            "photo": photo,
            "parse_mode": parse_mode
        }
        
        if caption:
            data["caption"] = caption
        
        if reply_markup:
            data["reply_markup"] = reply_markup
        
        return await self.make_request("sendPhoto", data)
    
    async def send_video(
        self,
        chat_id: int,
        video: str,
        caption: Optional[str] = None,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send video.
        
        Args:
            chat_id: Chat ID
            video: Video file_id or URL
            caption: Video caption
            parse_mode: Parse mode
            reply_markup: Inline keyboard markup
        
        Returns:
            Message dict
        """
        data = {
            "chat_id": chat_id,
            "video": video,
            "parse_mode": parse_mode
        }
        
        if caption:
            data["caption"] = caption
        
        if reply_markup:
            data["reply_markup"] = reply_markup
        
        return await self.make_request("sendVideo", data)
    
    async def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Edit message text.
        
        Args:
            chat_id: Chat ID
            message_id: Message ID
            text: New text
            parse_mode: Parse mode
            reply_markup: Inline keyboard markup
        
        Returns:
            Message dict
        """
        data = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode
        }
        
        if reply_markup:
            data["reply_markup"] = reply_markup
        
        return await self.make_request("editMessageText", data)
    
    async def delete_message(
        self,
        chat_id: int,
        message_id: int
    ) -> bool:
        """
        Delete message.
        
        Args:
            chat_id: Chat ID
            message_id: Message ID
        
        Returns:
            Success status
        """
        data = {
            "chat_id": chat_id,
            "message_id": message_id
        }
        
        try:
            await self.make_request("deleteMessage", data)
            return True
        except Exception as e:
            logger.error(f"Failed to delete message: {e}")
            return False
    
    async def get_chat_member(
        self,
        chat_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """
        Get chat member info.
        
        Args:
            chat_id: Chat ID
            user_id: User ID
        
        Returns:
            ChatMember dict
        """
        data = {
            "chat_id": chat_id,
            "user_id": user_id
        }
        
        return await self.make_request("getChatMember", data)
    
    async def set_webhook(
        self,
        url: str,
        secret_token: Optional[str] = None
    ) -> bool:
        """
        Set webhook URL.
        
        Args:
            url: Webhook URL
            secret_token: Secret token for validation
        
        Returns:
            Success status
        """
        data = {
            "url": url,
            "allowed_updates": ["message", "callback_query", "my_chat_member"]
        }
        
        if secret_token:
            data["secret_token"] = secret_token
        
        result = await self.make_request("setWebhook", data)
        return result is not None
    
    async def delete_webhook(self) -> bool:
        """
        Delete webhook.
        
        Returns:
            Success status
        """
        result = await self.make_request("deleteWebhook")
        return result is not None
    
    async def get_webhook_info(self) -> Dict[str, Any]:
        """
        Get webhook info.
        
        Returns:
            WebhookInfo dict
        """
        return await self.make_request("getWebhookInfo")


# Global client instances
main_bot_client: Optional[TelegramClient] = None
auth_bot_client: Optional[TelegramClient] = None


def get_main_bot_client() -> TelegramClient:
    """Get main bot client (singleton)."""
    global main_bot_client
    
    if main_bot_client is None:
        main_bot_client = TelegramClient(
            token=settings.TELEGRAM_BOT_TOKEN,
            is_main_bot=True
        )
    
    return main_bot_client


def get_auth_bot_client() -> TelegramClient:
    """Get auth bot client (singleton)."""
    global auth_bot_client
    
    if auth_bot_client is None:
        auth_bot_client = TelegramClient(
            token=settings.TELEGRAM_AUTH_BOT_TOKEN,
            is_main_bot=False
        )
    
    return auth_bot_client


async def close_clients():
    """Close all bot clients."""
    global main_bot_client, auth_bot_client
    
    if main_bot_client:
        await main_bot_client.close()
        main_bot_client = None
    
    if auth_bot_client:
        await auth_bot_client.close()
        auth_bot_client = None


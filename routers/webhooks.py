"""Webhooks router for setting up Telegram webhooks."""
from fastapi import APIRouter, Header, HTTPException, status
from typing import Optional

from core.config import settings
from services.telegram_client import get_main_bot_client, get_auth_bot_client
from schemas.error import ErrorResponse, MachineErrorCode

router = APIRouter(prefix="/internal", tags=["Internal"])


@router.post(
    "/set-webhooks",
    responses={
        200: {"description": "Webhooks set successfully"},
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def set_webhooks(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    """
    Set webhooks for both Telegram bots.
    
    This is a protected endpoint that should only be called by internal services
    or during deployment. Requires INTERNAL_API_KEY for authentication.
    
    Args:
        x_api_key: Internal API key from header
    
    Returns:
        Success message
    
    Raises:
        401: Invalid or missing API key
        500: Failed to set webhooks
    """
    # Verify API key
    if not x_api_key or x_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": MachineErrorCode.AUTH_INVALID_API_KEY.value,
                "message": "Invalid or missing API key"
            }
        )
    
    try:
        # Set main bot webhook
        main_bot = get_main_bot_client()
        main_webhook_url = settings.get_webhook_url(is_main_bot=True)
        
        await main_bot.set_webhook(
            url=main_webhook_url,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET
        )
        
        # Set auth bot webhook
        auth_bot = get_auth_bot_client()
        auth_webhook_url = settings.get_webhook_url(is_main_bot=False)
        
        await auth_bot.set_webhook(
            url=auth_webhook_url,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET
        )
        
        return {
            "success": True,
            "message": "Webhooks set successfully",
            "main_bot_webhook": main_webhook_url,
            "auth_bot_webhook": auth_webhook_url
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": MachineErrorCode.SYSTEM_ERROR.value,
                "message": f"Failed to set webhooks: {str(e)}"
            }
        )


@router.post(
    "/delete-webhooks",
    responses={
        200: {"description": "Webhooks deleted successfully"},
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def delete_webhooks(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    """
    Delete webhooks for both Telegram bots.
    
    Useful for development or when switching to polling mode.
    
    Args:
        x_api_key: Internal API key from header
    
    Returns:
        Success message
    
    Raises:
        401: Invalid or missing API key
        500: Failed to delete webhooks
    """
    # Verify API key
    if not x_api_key or x_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": MachineErrorCode.AUTH_INVALID_API_KEY.value,
                "message": "Invalid or missing API key"
            }
        )
    
    try:
        # Delete main bot webhook
        main_bot = get_main_bot_client()
        await main_bot.delete_webhook()
        
        # Delete auth bot webhook
        auth_bot = get_auth_bot_client()
        await auth_bot.delete_webhook()
        
        return {
            "success": True,
            "message": "Webhooks deleted successfully"
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error_code": MachineErrorCode.SYSTEM_ERROR.value,
                "message": f"Failed to delete webhooks: {str(e)}"
            }
        )


@router.get(
    "/webhook-info",
    responses={
        200: {"description": "Webhook info retrieved"},
        401: {"model": ErrorResponse}
    }
)
async def get_webhook_info(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    """
    Get webhook info for both bots.
    
    Args:
        x_api_key: Internal API key from header
    
    Returns:
        Webhook info for both bots
    
    Raises:
        401: Invalid or missing API key
    """
    # Verify API key
    if not x_api_key or x_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": MachineErrorCode.AUTH_INVALID_API_KEY.value,
                "message": "Invalid or missing API key"
            }
        )
    
    try:
        # Get main bot webhook info
        main_bot = get_main_bot_client()
        main_info = await main_bot.get_webhook_info()
        
        # Get auth bot webhook info
        auth_bot = get_auth_bot_client()
        auth_info = await auth_bot.get_webhook_info()
        
        return {
            "main_bot": main_info,
            "auth_bot": auth_info
        }
    
    except Exception as e:
        return {
            "error": f"Failed to get webhook info: {str(e)}"
        }


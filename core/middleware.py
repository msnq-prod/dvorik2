"""Middleware for FastAPI application."""
import time
import uuid
import logging
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging all requests."""
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Log request and response details.
        
        Args:
            request: Request object
            call_next: Next middleware or endpoint
        
        Returns:
            Response
        """
        # Generate request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Start timer
        start_time = time.time()
        
        # Log request
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query_params": str(request.query_params),
                "client_host": request.client.host if request.client else None
            }
        )
        
        # Process request
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Log response
        logger.info(
            f"Request completed: {request.method} {request.url.path} - {response.status_code}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2)
            }
        )
        
        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        
        return response


class TestDataMiddleware(BaseHTTPMiddleware):
    """Middleware for determining if request is for test data."""
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Determine if request is for test data based on headers.
        
        Args:
            request: Request object
            call_next: Next middleware or endpoint
        
        Returns:
            Response
        """
        # Check for test data header
        is_test = request.headers.get("X-Test-Data") == "true"
        
        # Store in request state
        request.state.is_test = is_test
        
        # Process request
        response = await call_next(request)
        
        return response


class WebhookAuthMiddleware(BaseHTTPMiddleware):
    """Middleware for authenticating Telegram webhooks."""
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Authenticate webhook requests.
        
        Args:
            request: Request object
            call_next: Next middleware or endpoint
        
        Returns:
            Response
        """
        # Only check webhook endpoints
        if not request.url.path.startswith("/webhooks/"):
            return await call_next(request)
        
        from core.config import settings
        
        # Get secret token from header
        secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        
        # Verify token
        if secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
            logger.warning(
                f"Invalid webhook secret token from {request.client.host if request.client else 'unknown'}",
                extra={
                    "path": request.url.path,
                    "received_token": secret_token[:10] + "..." if secret_token else None
                }
            )
            
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid webhook secret"}
            )
        
        # Process request
        response = await call_next(request)
        
        return response


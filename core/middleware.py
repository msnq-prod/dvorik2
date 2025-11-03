"""Middleware for FastAPI application."""
import time
import uuid
import logging
from typing import Callable
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware for rate limiting API requests.
    
    Limits requests per IP address to prevent abuse and DDoS attacks.
    """
    
    def __init__(
        self,
        app,
        calls: int = 100,
        period: int = 60,
        exclude_paths: list[str] = None
    ):
        """
        Initialize rate limiter.
        
        Args:
            app: FastAPI application
            calls: Maximum number of calls per period
            period: Time period in seconds
            exclude_paths: List of paths to exclude from rate limiting
        """
        super().__init__(app)
        self.calls = calls
        self.period = period
        self.exclude_paths = exclude_paths or ["/health", "/api/docs", "/api/redoc", "/api/openapi.json"]
        self.clients: dict[str, list[float]] = defaultdict(list)
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Check rate limit and process request.
        
        Args:
            request: Request object
            call_next: Next middleware or endpoint
        
        Returns:
            Response or 429 error
        """
        # Skip rate limiting for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)
        
        # Get client IP
        client = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Clean old requests
        self.clients[client] = [
            req_time for req_time in self.clients[client]
            if now - req_time < self.period
        ]
        
        # Check rate limit
        if len(self.clients[client]) >= self.calls:
            logger.warning(
                f"Rate limit exceeded for {client}",
                extra={
                    "client": client,
                    "path": request.url.path,
                    "calls": len(self.clients[client]),
                    "limit": self.calls
                }
            )
            
            return JSONResponse(
                status_code=429,
                content={
                    "error_code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Maximum {self.calls} requests per {self.period} seconds."
                },
                headers={
                    "Retry-After": str(self.period)
                }
            )
        
        # Add current request
        self.clients[client].append(now)
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.calls)
        response.headers["X-RateLimit-Remaining"] = str(self.calls - len(self.clients[client]))
        response.headers["X-RateLimit-Reset"] = str(int(now + self.period))
        
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware for adding security headers to all responses.
    
    Implements common security headers to protect against:
    - XSS attacks
    - Clickjacking
    - MIME type sniffing
    - etc.
    """
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Add security headers to response.
        
        Args:
            request: Request object
            call_next: Next middleware or endpoint
        
        Returns:
            Response with security headers
        """
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Only add HSTS if using HTTPS
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Content Security Policy (basic)
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        
        return response


"""Exception handlers for FastAPI."""
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.exceptions import AppException
from schemas.error import ErrorResponse, ValidationErrorResponse, MachineErrorCode

logger = logging.getLogger(__name__)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """
    Handle custom application exceptions.
    
    Args:
        request: Request object
        exc: Application exception
    
    Returns:
        JSON response with error details
    """
    logger.warning(
        f"Application exception: {exc.error_code.value} - {exc.message}",
        extra={
            "error_code": exc.error_code.value,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.error_code.value,
            "message": exc.message
        }
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
) -> JSONResponse:
    """
    Handle Pydantic validation errors.
    
    Args:
        request: Request object
        exc: Validation exception
    
    Returns:
        JSON response with validation errors
    """
    logger.warning(
        f"Validation error on {request.url.path}",
        extra={
            "errors": exc.errors(),
            "path": request.url.path,
            "method": request.method
        }
    )
    
    # Format validation errors
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"][1:])  # Skip 'body'
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"]
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_code": MachineErrorCode.VALIDATION_ERROR.value,
            "message": "Validation failed",
            "errors": errors
        }
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException
) -> JSONResponse:
    """
    Handle HTTP exceptions.
    
    Args:
        request: Request object
        exc: HTTP exception
    
    Returns:
        JSON response with error details
    """
    logger.warning(
        f"HTTP exception: {exc.status_code} - {exc.detail}",
        extra={
            "status_code": exc.status_code,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    # Map status code to machine error code
    error_code_map = {
        401: MachineErrorCode.AUTH_INVALID_TOKEN,
        403: MachineErrorCode.PERMISSION_DENIED,
        404: MachineErrorCode.RESOURCE_NOT_FOUND,
        429: MachineErrorCode.RATE_LIMIT_EXCEEDED,
        500: MachineErrorCode.SYSTEM_ERROR,
    }
    
    error_code = error_code_map.get(
        exc.status_code,
        MachineErrorCode.SYSTEM_ERROR
    )
    
    # Check if detail is a dict with error_code
    if isinstance(exc.detail, dict) and "error_code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.detail
        )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": error_code.value,
            "message": str(exc.detail)
        }
    )


async def general_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    """
    Handle unexpected exceptions.
    
    Args:
        request: Request object
        exc: Exception
    
    Returns:
        JSON response with error details
    """
    logger.error(
        f"Unexpected exception: {type(exc).__name__} - {str(exc)}",
        exc_info=True,
        extra={
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error_code": MachineErrorCode.SYSTEM_ERROR.value,
            "message": "Internal server error"
        }
    )


"""Custom exceptions for the application."""
from typing import Optional

from schemas.error import MachineErrorCode


class AppException(Exception):
    """Base application exception."""
    
    def __init__(
        self,
        message: str,
        error_code: MachineErrorCode,
        status_code: int = 400
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(message)


class AuthenticationException(AppException):
    """Authentication failed."""
    
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message=message,
            error_code=MachineErrorCode.AUTH_INVALID_TOKEN,
            status_code=401
        )


class PermissionDeniedException(AppException):
    """Permission denied."""
    
    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            message=message,
            error_code=MachineErrorCode.PERMISSION_DENIED,
            status_code=403
        )


class ResourceNotFoundException(AppException):
    """Resource not found."""
    
    def __init__(
        self,
        resource_type: str,
        resource_id: Optional[int] = None
    ):
        message = f"{resource_type} not found"
        if resource_id:
            message = f"{resource_type} with ID {resource_id} not found"
        
        # Map resource type to error code
        error_code_map = {
            "User": MachineErrorCode.USER_NOT_FOUND,
            "Discount": MachineErrorCode.DISCOUNT_NOT_FOUND,
            "Broadcast": MachineErrorCode.BROADCAST_NOT_FOUND,
            "Admin": MachineErrorCode.ADMIN_NOT_FOUND,
            "Cashier": MachineErrorCode.CASHIER_NOT_FOUND,
            "Template": MachineErrorCode.TEMPLATE_NOT_FOUND,
            "Segment": MachineErrorCode.SEGMENT_NOT_FOUND,
            "Setting": MachineErrorCode.SETTING_NOT_FOUND,
        }
        
        error_code = error_code_map.get(
            resource_type,
            MachineErrorCode.RESOURCE_NOT_FOUND
        )
        
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=404
        )


class ValidationException(AppException):
    """Validation error."""
    
    def __init__(self, message: str, field: Optional[str] = None):
        self.field = field
        super().__init__(
            message=message,
            error_code=MachineErrorCode.VALIDATION_ERROR,
            status_code=400
        )


class RecurrenceNotReachedError(AppException):
    """User cannot receive discount yet (recurrence period not reached)."""
    
    def __init__(self, days_remaining: int):
        super().__init__(
            message=f"You can receive this discount again in {days_remaining} days",
            error_code=MachineErrorCode.DISCOUNT_RECURRENCE_NOT_REACHED,
            status_code=400
        )


class CashierNotActiveError(AppException):
    """Cashier account is not active."""
    
    def __init__(self):
        super().__init__(
            message="Cashier account is not active",
            error_code=MachineErrorCode.CASHIER_NOT_ACTIVE,
            status_code=403
        )


class DiscountAlreadyUsedError(AppException):
    """Discount code already used."""
    
    def __init__(self):
        super().__init__(
            message="This discount code has already been used",
            error_code=MachineErrorCode.DISCOUNT_ALREADY_USED,
            status_code=400
        )


class DiscountExpiredError(AppException):
    """Discount code expired."""
    
    def __init__(self):
        super().__init__(
            message="This discount code has expired",
            error_code=MachineErrorCode.DISCOUNT_EXPIRED,
            status_code=400
        )


class DiscountInvalidError(AppException):
    """Discount code is invalid."""
    
    def __init__(self):
        super().__init__(
            message="This discount code is invalid",
            error_code=MachineErrorCode.DISCOUNT_INVALID,
            status_code=400
        )


class BroadcastNotEditableError(AppException):
    """Broadcast cannot be edited in current state."""
    
    def __init__(self):
        super().__init__(
            message="Broadcast cannot be edited (only draft broadcasts can be updated)",
            error_code=MachineErrorCode.BROADCAST_NOT_EDITABLE,
            status_code=400
        )


class BroadcastInvalidStateError(AppException):
    """Broadcast state transition is invalid."""
    
    def __init__(self, message: str):
        super().__init__(
            message=message,
            error_code=MachineErrorCode.BROADCAST_INVALID_STATE,
            status_code=400
        )


class RateLimitExceededError(AppException):
    """Rate limit exceeded."""
    
    def __init__(self, retry_after: Optional[int] = None):
        message = "Rate limit exceeded"
        if retry_after:
            message = f"Rate limit exceeded. Retry after {retry_after} seconds"
        
        super().__init__(
            message=message,
            error_code=MachineErrorCode.RATE_LIMIT_EXCEEDED,
            status_code=429
        )


class TelegramAPIError(AppException):
    """Telegram API error."""
    
    def __init__(self, message: str):
        super().__init__(
            message=f"Telegram API error: {message}",
            error_code=MachineErrorCode.TELEGRAM_API_ERROR,
            status_code=500
        )


class SystemError(AppException):
    """Internal system error."""
    
    def __init__(self, message: str = "Internal system error"):
        super().__init__(
            message=message,
            error_code=MachineErrorCode.SYSTEM_ERROR,
            status_code=500
        )


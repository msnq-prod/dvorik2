"""Error response schemas with machine-readable codes."""
from typing import Optional, Any
from enum import Enum
from pydantic import BaseModel, Field


class MachineErrorCode(str, Enum):
    """Machine-readable error codes for API responses."""
    
    # General errors
    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    
    # User errors
    USER_NOT_FOUND = "USER_NOT_FOUND"
    USER_BLOCKED = "USER_BLOCKED"
    TAG_TOO_MANY = "TAG_TOO_MANY"
    TAG_TOO_LONG = "TAG_TOO_LONG"
    
    # Discount errors
    CODE_NOT_FOUND = "CODE_NOT_FOUND"
    CODE_ALREADY_USED = "CODE_ALREADY_USED"
    CODE_EXPIRED = "CODE_EXPIRED"
    CODE_INACTIVE = "CODE_INACTIVE"
    RECURRENCE_NOT_REACHED = "RECURRENCE_NOT_REACHED"
    TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND"
    TEMPLATE_INACTIVE = "TEMPLATE_INACTIVE"
    
    # Cashier errors
    CASHIER_NOT_FOUND = "CASHIER_NOT_FOUND"
    CASHIER_NOT_ACTIVE = "CASHIER_NOT_ACTIVE"
    CASHIER_ALREADY_EXISTS = "CASHIER_ALREADY_EXISTS"
    
    # Admin errors
    ADMIN_NOT_FOUND = "ADMIN_NOT_FOUND"
    ADMIN_NOT_ACTIVE = "ADMIN_NOT_ACTIVE"
    ADMIN_INSUFFICIENT_PERMISSIONS = "ADMIN_INSUFFICIENT_PERMISSIONS"
    
    # Broadcast errors
    BROADCAST_NOT_FOUND = "BROADCAST_NOT_FOUND"
    BROADCAST_INVALID_STATUS = "BROADCAST_INVALID_STATUS"
    BROADCAST_INVALID_TRANSITION = "BROADCAST_INVALID_TRANSITION"
    BROADCAST_RECIPIENTS_EMPTY = "BROADCAST_RECIPIENTS_EMPTY"
    
    # Segment errors
    SEGMENT_NOT_FOUND = "SEGMENT_NOT_FOUND"
    SEGMENT_INVALID = "SEGMENT_INVALID"
    SEGMENT_DEFINITION_INVALID = "SEGMENT_DEFINITION_INVALID"
    
    # Setting errors
    SETTING_NOT_FOUND = "SETTING_NOT_FOUND"
    SETTING_INVALID_VALUE = "SETTING_INVALID_VALUE"
    
    # Auth errors
    TOKEN_INVALID = "TOKEN_INVALID"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    ONE_TIME_TOKEN_INVALID = "ONE_TIME_TOKEN_INVALID"
    ONE_TIME_TOKEN_USED = "ONE_TIME_TOKEN_USED"
    
    # RBAC errors
    RBAC_VIOLATION = "RBAC_VIOLATION"
    OWNER_ONLY = "OWNER_ONLY"
    MARKETING_READONLY_FORBIDDEN = "MARKETING_READONLY_FORBIDDEN"
    
    # Rate limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    TELEGRAM_API_ERROR = "TELEGRAM_API_ERROR"


class ErrorResponse(BaseModel):
    """Standard error response schema."""
    code: MachineErrorCode = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Any] = Field(None, description="Additional error details")
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "code": "CODE_ALREADY_USED",
                    "message": "Discount code has already been used",
                    "details": {
                        "code": "АБВ1234",
                        "used_at": "2024-11-01T10:30:00Z"
                    }
                },
                {
                    "code": "TAG_TOO_MANY",
                    "message": "Maximum 20 tags allowed",
                    "details": {
                        "current_count": 25,
                        "max_allowed": 20
                    }
                }
            ]
        }
    }


class ValidationErrorDetail(BaseModel):
    """Detail for validation errors."""
    field: str
    message: str
    value: Optional[Any] = None


class ValidationErrorResponse(ErrorResponse):
    """Validation error response with field-level details."""
    code: MachineErrorCode = MachineErrorCode.VALIDATION_ERROR
    details: Optional[list[ValidationErrorDetail]] = None


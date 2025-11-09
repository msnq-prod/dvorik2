"""Schemas package - exports all Pydantic schemas."""

# User schemas
from schemas.user import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserInDB,
    UserPublic,
    UserPublicWithPhone,
    UserFilter,
    UserBulkAction,
    UserStats
)

# Admin and Cashier schemas
from schemas.admin import (
    AdminBase,
    AdminCreate,
    AdminUpdate,
    AdminInDB,
    AdminPublic,
    AdminLogin,
    AdminLoginResponse,
    CashierBase,
    CashierCreate,
    CashierUpdate,
    CashierInDB,
    CashierPublic,
    CashierActivate
)

# Discount template schemas
from schemas.discount_template import (
    DiscountTemplateBase,
    DiscountTemplateCreate,
    DiscountTemplateUpdate,
    DiscountTemplateInDB,
    DiscountTemplatePublic
)

# Discount schemas
from schemas.discount import (
    DiscountBase,
    DiscountCreate,
    DiscountInDB,
    DiscountPublic,
    DiscountValidationRequest,
    DiscountValidationResponse,
    DiscountRedeemRequest,
    DiscountRedeemResponse,
    DiscountFilter,
    DiscountStats
)

# Discount usage log schemas
from schemas.discount_usage_log import (
    DiscountUsageLogBase,
    DiscountUsageLogInDB,
    DiscountUsageLogPublic,
    DiscountUsageLogFilter,
    DiscountUsageStats
)

# Broadcast schemas
from schemas.broadcast import (
    BroadcastBase,
    BroadcastCreate,
    BroadcastUpdate,
    BroadcastInDB,
    BroadcastPublic,
    BroadcastStatusUpdate,
    BroadcastSchedule,
    BroadcastSendNow,
    BroadcastFilter,
    BroadcastStats,
    BroadcastRecipientCount
)

# Segment schemas
from schemas.segment import (
    SegmentBase,
    SegmentCreate,
    SegmentUpdate,
    SegmentInDB,
    SegmentPublic,
    SegmentCount
)

# Error schemas
from schemas.error import (
    MachineErrorCode,
    ErrorResponse,
    ValidationErrorDetail,
    ValidationErrorResponse
)

# Auth schemas
from schemas.auth import (
    LoginTokenRequest,
    LoginTokenResponse,
    TokenData,
    TokenPayload,
    RefreshTokenRequest,
    OneTimeToken,
    PasswordChange
)

# Setting schemas
from schemas.setting import (
    SettingBase,
    SettingUpdate,
    SettingInDB,
    SettingPublic,
    SettingTyped,
    SettingBulkUpdate,
    SystemSettings
)

__all__ = [
    # Users
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "UserPublic",
    "UserPublicWithPhone",
    "UserFilter",
    "UserBulkAction",
    "UserStats",
    
    # Admins and Cashiers
    "AdminBase",
    "AdminCreate",
    "AdminUpdate",
    "AdminInDB",
    "AdminPublic",
    "AdminLogin",
    "AdminLoginResponse",
    "CashierBase",
    "CashierCreate",
    "CashierUpdate",
    "CashierInDB",
    "CashierPublic",
    "CashierActivate",
    
    # Discount Templates
    "DiscountTemplateBase",
    "DiscountTemplateCreate",
    "DiscountTemplateUpdate",
    "DiscountTemplateInDB",
    "DiscountTemplatePublic",
    
    # Discounts
    "DiscountBase",
    "DiscountCreate",
    "DiscountInDB",
    "DiscountPublic",
    "DiscountValidationRequest",
    "DiscountValidationResponse",
    "DiscountRedeemRequest",
    "DiscountRedeemResponse",
    "DiscountFilter",
    "DiscountStats",
    
    # Discount Usage Logs
    "DiscountUsageLogBase",
    "DiscountUsageLogInDB",
    "DiscountUsageLogPublic",
    "DiscountUsageLogFilter",
    "DiscountUsageStats",
    
    # Broadcasts
    "BroadcastBase",
    "BroadcastCreate",
    "BroadcastUpdate",
    "BroadcastInDB",
    "BroadcastPublic",
    "BroadcastStatusUpdate",
    "BroadcastSchedule",
    "BroadcastSendNow",
    "BroadcastFilter",
    "BroadcastStats",
    "BroadcastRecipientCount",
    
    # Segments
    "SegmentBase",
    "SegmentCreate",
    "SegmentUpdate",
    "SegmentInDB",
    "SegmentPublic",
    "SegmentCount",
    
    # Errors
    "MachineErrorCode",
    "ErrorResponse",
    "ValidationErrorDetail",
    "ValidationErrorResponse",
    
    # Auth
    "LoginTokenRequest",
    "LoginTokenResponse",
    "TokenData",
    "TokenPayload",
    "RefreshTokenRequest",
    "OneTimeToken",
    "PasswordChange",
    
    # Settings
    "SettingBase",
    "SettingUpdate",
    "SettingInDB",
    "SettingPublic",
    "SettingTyped",
    "SettingBulkUpdate",
    "SystemSettings",
]


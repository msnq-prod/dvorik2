"""Discount service for managing discount codes."""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.discount import Discount
from models.discount_template import DiscountTemplate, DiscountTemplateType
from models.discount_usage_log import DiscountUsageLog, DiscountUsageStatus
from models.cashier import Cashier
from core.utils import generate_discount_code, normalize_code, try_find_code_variants, calculate_expiry_date


async def get_active_template_by_type(
    db: AsyncSession,
    template_type: DiscountTemplateType
) -> Optional[DiscountTemplate]:
    """
    Get active template by type.
    
    Args:
        db: Database session
        template_type: Template type
    
    Returns:
        Active template or None
    """
    result = await db.execute(
        select(DiscountTemplate).where(
            DiscountTemplate.template_type == template_type,
            DiscountTemplate.is_active == True
        )
    )
    return result.scalar_one_or_none()


async def create_discount_for_user(
    db: AsyncSession,
    user_id: int,
    template_type: DiscountTemplateType,
    is_test: bool = False
) -> Optional[Discount]:
    """
    Create discount for user based on template type.
    
    Args:
        db: Database session
        user_id: User ID
        template_type: Template type
        is_test: Whether this is test data
    
    Returns:
        Created discount or None if template not found
    """
    # Get active template
    template = await get_active_template_by_type(db, template_type)
    
    if not template:
        return None
    
    # Generate unique code
    max_attempts = 10
    code = None
    
    for _ in range(max_attempts):
        generated_code = generate_discount_code()
        
        # Check if code already exists
        result = await db.execute(
            select(Discount).where(Discount.code == generated_code)
        )
        
        if result.scalar_one_or_none() is None:
            code = generated_code
            break
    
    if code is None:
        # Failed to generate unique code
        return None
    
    # Calculate expiry date
    expires_at = calculate_expiry_date(template.validity_days)
    
    # Create discount
    discount = Discount(
        code=code,
        template_id=template.id,
        user_id=user_id,
        expires_at=expires_at,
        is_test=is_test
    )
    
    db.add(discount)
    await db.flush()
    await db.refresh(discount)
    
    return discount


async def find_discount_by_code(
    db: AsyncSession,
    code: str
) -> Optional[Discount]:
    """
    Find discount by code (with flexible search).
    
    Tries multiple variants:
    1. As-is
    2. Uppercase
    3. Without prefix
    
    Args:
        db: Database session
        code: Discount code
    
    Returns:
        Discount or None
    """
    variants = try_find_code_variants(code)
    
    for variant in variants:
        result = await db.execute(
            select(Discount).where(Discount.code == variant)
        )
        discount = result.scalar_one_or_none()
        
        if discount:
            return discount
    
    return None


async def validate_discount_code(
    db: AsyncSession,
    code: str,
    cashier_id: int,
    is_test: bool = False
) -> dict:
    """
    Validate discount code for redemption.
    
    Multi-step validation:
    1. Code exists
    2. Code is active
    3. Code is not expired
    4. Code is not used
    5. Cashier is active
    
    Args:
        db: Database session
        code: Discount code
        cashier_id: Cashier ID
        is_test: Whether this is test data
    
    Returns:
        Validation result dict
    """
    # Check cashier
    result = await db.execute(
        select(Cashier).where(Cashier.id == cashier_id)
    )
    cashier = result.scalar_one_or_none()
    
    if not cashier or not cashier.is_active:
        # Log failed attempt
        await log_discount_usage(
            db,
            code=code,
            cashier_id=cashier_id,
            status=DiscountUsageStatus.CASHIER_NOT_ACTIVE,
            message="Cashier is not active",
            is_test=is_test
        )
        
        return {
            "valid": False,
            "error_code": "CASHIER_NOT_ACTIVE",
            "error_message": "Cashier account is not active"
        }
    
    # Find discount
    discount = await find_discount_by_code(db, code)
    
    if not discount:
        # Log failed attempt
        await log_discount_usage(
            db,
            code=code,
            cashier_id=cashier_id,
            status=DiscountUsageStatus.NOT_FOUND,
            message=f"Discount code '{code}' not found",
            is_test=is_test
        )
        
        return {
            "valid": False,
            "error_code": "CODE_NOT_FOUND",
            "error_message": f"Discount code '{code}' not found"
        }
    
    # Check if already used
    if discount.used_at is not None:
        # Log failed attempt
        await log_discount_usage(
            db,
            code=code,
            discount_id=discount.id,
            cashier_id=cashier_id,
            status=DiscountUsageStatus.ALREADY_USED,
            message=f"Code already used at {discount.used_at}",
            is_test=is_test
        )
        
        return {
            "valid": False,
            "error_code": "CODE_ALREADY_USED",
            "error_message": f"This code was already used",
            "used_at": discount.used_at
        }
    
    # Check if expired
    if discount.is_expired():
        # Log failed attempt
        await log_discount_usage(
            db,
            code=code,
            discount_id=discount.id,
            cashier_id=cashier_id,
            status=DiscountUsageStatus.EXPIRED,
            message=f"Code expired at {discount.expires_at}",
            is_test=is_test
        )
        
        return {
            "valid": False,
            "error_code": "CODE_EXPIRED",
            "error_message": "This code has expired",
            "expires_at": discount.expires_at
        }
    
    # Check if active
    if not discount.is_active:
        # Log failed attempt
        await log_discount_usage(
            db,
            code=code,
            discount_id=discount.id,
            cashier_id=cashier_id,
            status=DiscountUsageStatus.INVALID,
            message="Code is not active",
            is_test=is_test
        )
        
        return {
            "valid": False,
            "error_code": "CODE_INACTIVE",
            "error_message": "This code is not active"
        }
    
    # All checks passed
    return {
        "valid": True,
        "discount_id": discount.id,
        "code": discount.code,
        "user_display_name": discount.user.display_name,
        "discount_value": discount.template.format_value(),
        "expires_at": discount.expires_at
    }


async def redeem_discount(
    db: AsyncSession,
    discount_id: int,
    cashier_id: int,
    store_id: Optional[int] = None,
    is_test: bool = False
) -> dict:
    """
    Redeem discount code (atomic operation).
    
    Args:
        db: Database session
        discount_id: Discount ID
        cashier_id: Cashier ID
        store_id: Optional store ID
        is_test: Whether this is test data
    
    Returns:
        Redemption result dict
    """
    # Get discount
    result = await db.execute(
        select(Discount).where(Discount.id == discount_id)
    )
    discount = result.scalar_one_or_none()
    
    if not discount:
        return {
            "success": False,
            "error_code": "DISCOUNT_NOT_FOUND",
            "message": "Discount not found"
        }
    
    # Validate one more time (race condition check)
    if not discount.is_valid():
        return {
            "success": False,
            "error_code": "CODE_INVALID",
            "message": "Code is no longer valid"
        }
    
    # Mark as used (atomic)
    discount.mark_as_used()
    
    # Log successful redemption
    await log_discount_usage(
        db,
        code=discount.code,
        discount_id=discount.id,
        cashier_id=cashier_id,
        store_id=store_id,
        status=DiscountUsageStatus.SUCCESS,
        message="Discount successfully redeemed",
        is_test=is_test
    )
    
    await db.flush()
    
    return {
        "success": True,
        "discount_id": discount.id,
        "code": discount.code,
        "user_id": discount.user_id,
        "message": "Discount successfully redeemed"
    }


async def log_discount_usage(
    db: AsyncSession,
    code: str,
    cashier_id: int,
    status: DiscountUsageStatus,
    message: str,
    discount_id: Optional[int] = None,
    store_id: Optional[int] = None,
    user_not_notified: bool = False,
    is_test: bool = False
) -> DiscountUsageLog:
    """
    Log discount usage attempt.
    
    Args:
        db: Database session
        code: Discount code
        cashier_id: Cashier ID
        status: Usage status
        message: Log message
        discount_id: Optional discount ID
        store_id: Optional store ID
        user_not_notified: Whether user notification failed
        is_test: Whether this is test data
    
    Returns:
        Created log entry
    """
    # Truncate message to 512 characters
    truncated_message = message[:512] if len(message) > 512 else message
    
    log_entry = DiscountUsageLog(
        discount_id=discount_id,
        code=code,
        cashier_id=cashier_id,
        store_id=store_id,
        status=status,
        message=truncated_message,
        user_not_notified=user_not_notified,
        is_test=is_test
    )
    
    db.add(log_entry)
    await db.flush()
    
    return log_entry


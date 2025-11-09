"""Auth router for admin authentication."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import create_access_token, verify_one_time_token
from core.dependencies import get_current_admin
from schemas.auth import LoginTokenRequest, LoginTokenResponse, TokenPayload
from schemas.error import ErrorResponse, MachineErrorCode
from services.admin_service import get_admin_by_telegram_id, authenticate_admin
from services.audit_service import log_admin_login
from models.admin import Admin

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


@router.post(
    "/login-token",
    response_model=LoginTokenResponse,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def login_with_token(
    request: LoginTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Exchange one-time token for JWT access token.
    
    Flow:
    1. User requests login in admin bot
    2. Bot generates one-time token and sends deep link
    3. User opens link, frontend sends token to this endpoint
    4. Backend verifies token and returns JWT
    
    Args:
        request: Login token request
        db: Database session
    
    Returns:
        JWT access token
    
    Raises:
        401: Invalid or expired token
        404: Admin not found
    """
    # Verify one-time token
    telegram_id = await verify_one_time_token(request.token)
    
    if not telegram_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": MachineErrorCode.AUTH_INVALID_TOKEN.value,
                "message": "Invalid or expired token"
            }
        )
    
    # Get admin by telegram_id
    admin = await get_admin_by_telegram_id(db, telegram_id)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.ADMIN_NOT_FOUND.value,
                "message": "Admin not found"
            }
        )
    
    # Log login
    await log_admin_login(db, admin.id, is_test=admin.is_test)
    await db.commit()
    
    # Create JWT access token
    access_token = create_access_token(
        data={"sub": str(admin.telegram_id), "role": admin.role.value}
    )
    
    return LoginTokenResponse(
        access_token=access_token,
        token_type="bearer",
        admin_id=admin.id,
        role=admin.role.value
    )


@router.post(
    "/login",
    response_model=LoginTokenResponse,
    responses={
        401: {"model": ErrorResponse}
    }
)
async def login_with_password(
    email: str,
    password: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password (alternative method).
    
    Args:
        email: Admin email
        password: Admin password
        db: Database session
    
    Returns:
        JWT access token
    
    Raises:
        401: Invalid credentials
    """
    admin = await authenticate_admin(db, email, password)
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": MachineErrorCode.AUTH_INVALID_CREDENTIALS.value,
                "message": "Invalid email or password"
            }
        )
    
    # Log login
    await log_admin_login(db, admin.id, is_test=admin.is_test)
    await db.commit()
    
    # Create JWT access token
    access_token = create_access_token(
        data={"sub": str(admin.telegram_id), "role": admin.role.value}
    )
    
    return LoginTokenResponse(
        access_token=access_token,
        token_type="bearer",
        admin_id=admin.id,
        role=admin.role.value
    )


@router.get(
    "/me",
    response_model=TokenPayload,
    responses={
        401: {"model": ErrorResponse}
    }
)
async def get_current_user(
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get current admin info from JWT token.
    
    Args:
        current_admin: Current authenticated admin
    
    Returns:
        Admin info
    """
    return TokenPayload(
        admin_id=current_admin.id,
        telegram_id=current_admin.telegram_id,
        email=current_admin.email,
        full_name=current_admin.full_name,
        role=current_admin.role.value,
        can_broadcast_from_chat=current_admin.can_broadcast_from_chat
    )


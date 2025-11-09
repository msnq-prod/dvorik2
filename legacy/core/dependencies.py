"""FastAPI dependencies for request handling."""
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import decode_access_token
from core.redis import get_redis, RedisClient
from models.admin import Admin, AdminRole
from schemas.error import MachineErrorCode


# HTTP Bearer token scheme
security = HTTPBearer()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Admin:
    """
    Dependency to get current authenticated admin.
    
    Args:
        credentials: HTTP Authorization credentials
        db: Database session
    
    Returns:
        Current admin
    
    Raises:
        HTTPException: If token is invalid or admin not found
    """
    token = credentials.credentials
    token_data = decode_access_token(token)
    
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": MachineErrorCode.TOKEN_INVALID,
                "message": "Could not validate credentials"
            }
        )
    
    # Get admin from database
    result = await db.execute(
        select(Admin).where(Admin.id == token_data.admin_id)
    )
    admin = result.scalar_one_or_none()
    
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": MachineErrorCode.ADMIN_NOT_FOUND,
                "message": "Admin not found"
            }
        )
    
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": MachineErrorCode.ADMIN_NOT_ACTIVE,
                "message": "Admin account is inactive"
            }
        )
    
    return admin


def require_role(*allowed_roles: AdminRole):
    """
    Dependency factory to require specific admin roles.
    
    Args:
        *allowed_roles: Allowed admin roles
    
    Returns:
        Dependency function
    
    Example:
        ```python
        @app.get("/settings")
        async def get_settings(
            admin: Admin = Depends(require_role(AdminRole.OWNER))
        ):
            ...
        ```
    """
    async def role_checker(
        admin: Admin = Depends(get_current_admin)
    ) -> Admin:
        if admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": MachineErrorCode.RBAC_VIOLATION,
                    "message": f"Insufficient permissions. Required roles: {', '.join(r.value for r in allowed_roles)}"
                }
            )
        return admin
    
    return role_checker


def require_owner():
    """
    Dependency to require owner role.
    
    Returns:
        Dependency function
    """
    return require_role(AdminRole.OWNER)


def require_owner_or_marketing():
    """
    Dependency to require owner or marketing role.
    
    Returns:
        Dependency function
    """
    return require_role(AdminRole.OWNER, AdminRole.MARKETING)


async def verify_internal_api_key(
    x_api_key: Optional[str] = Header(None)
) -> None:
    """
    Dependency to verify internal API key for system endpoints.
    
    Args:
        x_api_key: API key from header
    
    Raises:
        HTTPException: If API key is missing or invalid
    """
    from core.security import verify_internal_api_key
    
    if x_api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": MachineErrorCode.UNAUTHORIZED,
                "message": "API key is missing"
            }
        )
    
    if not verify_internal_api_key(x_api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": MachineErrorCode.FORBIDDEN,
                "message": "Invalid API key"
            }
        )


async def get_current_admin_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[Admin]:
    """
    Dependency to get current admin (optional, returns None if not authenticated).
    
    Args:
        credentials: HTTP Authorization credentials
        db: Database session
    
    Returns:
        Current admin or None
    """
    if credentials is None:
        return None
    
    try:
        return await get_current_admin(credentials, db)
    except HTTPException:
        return None


# Dependency aliases for common use cases
GetDB = Depends(get_db)
GetRedis = Depends(get_redis)
GetCurrentAdmin = Depends(get_current_admin)
RequireOwner = Depends(require_owner())
RequireOwnerOrMarketing = Depends(require_owner_or_marketing())


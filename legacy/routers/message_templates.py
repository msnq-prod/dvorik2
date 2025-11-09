"""Message templates router."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin, require_role
from models.admin import Admin, AdminRole
from models.message_template import MessageTemplate
from schemas.error import ErrorResponse, MachineErrorCode
from services.message_service import get_template_by_key, get_all_templates, update_template
from pydantic import BaseModel


class MessageTemplatePublic(BaseModel):
    """Public message template schema."""
    key: str
    text: str
    description: str | None = None
    
    class Config:
        from_attributes = True


class MessageTemplateUpdate(BaseModel):
    """Update message template schema."""
    text: str


router = APIRouter(prefix="/api/v1/message-templates", tags=["Message Templates"])


@router.get(
    "",
    response_model=List[MessageTemplatePublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get all message templates.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of templates
    """
    templates = await get_all_templates(db)
    return [MessageTemplatePublic.model_validate(t) for t in templates]


@router.get(
    "/{key}",
    response_model=MessageTemplatePublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_template(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get template by key.
    
    Args:
        key: Template key
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Template data
    
    Raises:
        404: Template not found
    """
    template = await get_template_by_key(db, key)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.TEMPLATE_NOT_FOUND.value,
                "message": f"Template '{key}' not found"
            }
        )
    
    return MessageTemplatePublic.model_validate(template)


@router.patch(
    "/{key}",
    response_model=MessageTemplatePublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_role([AdminRole.OWNER, AdminRole.MARKETING]))]
)
async def update_template_endpoint(
    key: str,
    data: MessageTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update message template (owner/marketing only).
    
    Args:
        key: Template key
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated template
    
    Raises:
        404: Template not found
    """
    template = await update_template(db, key, data.text)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.TEMPLATE_NOT_FOUND.value,
                "message": f"Template '{key}' not found"
            }
        )
    
    await db.commit()
    
    return MessageTemplatePublic.model_validate(template)


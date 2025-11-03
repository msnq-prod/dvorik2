"""Discount templates router."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin, require_owner
from models.admin import Admin
from models.discount_template import DiscountTemplate
from schemas.discount_template import (
    DiscountTemplateCreate,
    DiscountTemplateUpdate,
    DiscountTemplatePublic
)
from schemas.error import ErrorResponse, MachineErrorCode
from services.template_service import (
    get_template_by_id,
    get_all_templates,
    create_template,
    update_template
)

router = APIRouter(prefix="/api/v1/discount-templates", tags=["Discount Templates"])


@router.get(
    "",
    response_model=List[DiscountTemplatePublic],
    responses={401: {"model": ErrorResponse}}
)
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get list of discount templates.
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        List of templates
    """
    templates = await get_all_templates(db)
    return [DiscountTemplatePublic.model_validate(t) for t in templates]


@router.get(
    "/{template_id}",
    response_model=DiscountTemplatePublic,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    }
)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Get template by ID.
    
    Args:
        template_id: Template ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Template data
    
    Raises:
        404: Template not found
    """
    template = await get_template_by_id(db, template_id)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.TEMPLATE_NOT_FOUND.value,
                "message": "Template not found"
            }
        )
    
    return DiscountTemplatePublic.model_validate(template)


@router.post(
    "",
    response_model=DiscountTemplatePublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def create_template_endpoint(
    data: DiscountTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Create discount template (owner only).
    
    Args:
        data: Template creation data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Created template
    """
    template = await create_template(db, data)
    await db.commit()
    
    return DiscountTemplatePublic.model_validate(template)


@router.patch(
    "/{template_id}",
    response_model=DiscountTemplatePublic,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def update_template_endpoint(
    template_id: int,
    data: DiscountTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Update discount template (owner only).
    
    Args:
        template_id: Template ID
        data: Update data
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Updated template
    
    Raises:
        404: Template not found
    """
    template = await update_template(db, template_id, data)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.TEMPLATE_NOT_FOUND.value,
                "message": "Template not found"
            }
        )
    
    await db.commit()
    
    return DiscountTemplatePublic.model_validate(template)


@router.delete(
    "/{template_id}",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}
    },
    dependencies=[Depends(require_owner)]
)
async def deactivate_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    """
    Deactivate discount template (owner only).
    
    Args:
        template_id: Template ID
        db: Database session
        current_admin: Current authenticated admin
    
    Returns:
        Success message
    
    Raises:
        404: Template not found
    """
    template = await get_template_by_id(db, template_id)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": MachineErrorCode.TEMPLATE_NOT_FOUND.value,
                "message": "Template not found"
            }
        )
    
    template.is_active = False
    await db.commit()
    
    return {"success": True, "message": "Template deactivated"}


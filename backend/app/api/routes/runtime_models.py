from fastapi import APIRouter, Depends, Request

from app.core.errors import ERROR_RESPONSES
from app.schemas.runtime_models import RuntimeModelPreparationResponse
from app.services.augmentation_service import AugmentationService

router = APIRouter(tags=["runtime-models"])


def get_augmentation_service(request: Request) -> AugmentationService:
    return request.app.state.augmentation_service


@router.post(
    "/runtime-models/craft/prepare",
    response_model=RuntimeModelPreparationResponse,
    responses=ERROR_RESPONSES,
)
def prepare_craft_model(
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict[str, str]:
    return augmentation_service.prepare_runtime_model("craft")


@router.post(
    "/runtime-models/glm/prepare",
    response_model=RuntimeModelPreparationResponse,
    responses=ERROR_RESPONSES,
)
def prepare_glm_model(
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict[str, str]:
    return augmentation_service.prepare_runtime_model("glm")

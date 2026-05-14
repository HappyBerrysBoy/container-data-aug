from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.core.errors import ERROR_RESPONSES
from app.schemas.augmentation_tasks import (
    ActiveTaskResponse,
    AugmentationResultResponse,
    AugmentationTaskCreate,
    AugmentationTaskResponse,
)
from app.services.augmentation_service import AugmentationService

router = APIRouter(tags=["augmentation-tasks"])


def get_augmentation_service(request: Request) -> AugmentationService:
    return request.app.state.augmentation_service


@router.post(
    "/projects/{project_id}/augmentation-tasks",
    response_model=AugmentationTaskResponse,
    status_code=201,
    responses=ERROR_RESPONSES,
)
def create_augmentation_task(
    project_id: int,
    payload: AugmentationTaskCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict:
    task = augmentation_service.create_task(project_id, payload)
    if request.app.state.run_background_tasks:
        background_tasks.add_task(augmentation_service.run_task, task["id"])
    return task


@router.get(
    "/augmentation-tasks/active",
    response_model=ActiveTaskResponse,
    responses=ERROR_RESPONSES,
)
def get_active_task(
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict:
    return {"task": augmentation_service.get_active_task()}


@router.get(
    "/augmentation-tasks/{task_id}",
    response_model=AugmentationTaskResponse,
    responses=ERROR_RESPONSES,
)
def get_task(
    task_id: int,
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict:
    return augmentation_service.get_task(task_id)


@router.post(
    "/augmentation-tasks/{task_id}/stop",
    response_model=AugmentationTaskResponse,
    responses=ERROR_RESPONSES,
)
def stop_task(
    task_id: int,
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict:
    return augmentation_service.stop_task(task_id)


@router.get(
    "/augmentation-tasks/{task_id}/result",
    response_model=AugmentationResultResponse,
    responses=ERROR_RESPONSES,
)
def get_result(
    task_id: int,
    augmentation_service: AugmentationService = Depends(get_augmentation_service),
) -> dict:
    return augmentation_service.get_result(task_id)

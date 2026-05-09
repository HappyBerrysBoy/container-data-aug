from fastapi import APIRouter, Depends, Request, Response

from app.core.errors import ERROR_RESPONSES
from app.schemas.projects import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectResponse,
)
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_service(request: Request) -> ProjectService:
    return request.app.state.project_service


@router.get(
    "",
    response_model=ProjectListResponse,
    responses=ERROR_RESPONSES,
)
def list_projects(
    project_service: ProjectService = Depends(get_project_service),
) -> dict[str, list[dict]]:
    return {"data": project_service.list_projects()}


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=201,
    responses=ERROR_RESPONSES,
)
def create_project(
    payload: ProjectCreate,
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    return project_service.create_project(payload)


@router.get(
    "/{project_id}",
    response_model=ProjectDetailResponse,
    responses=ERROR_RESPONSES,
)
def get_project(
    project_id: int,
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    return project_service.get_project(project_id)


@router.delete(
    "/{project_id}",
    status_code=204,
    responses=ERROR_RESPONSES,
)
def delete_project(
    project_id: int,
    project_service: ProjectService = Depends(get_project_service),
) -> Response:
    project_service.delete_project(project_id)
    return Response(status_code=204)


@router.post(
    "/{project_id}/rescan",
    response_model=ProjectResponse,
    responses=ERROR_RESPONSES,
)
def rescan_project(
    project_id: int,
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    """Re-scan the source folder and refresh image metadata in place."""
    return project_service.rescan_project(project_id)

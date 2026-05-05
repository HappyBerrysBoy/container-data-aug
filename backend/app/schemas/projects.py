from pydantic import Field

from app.schemas.base import CamelModel


class ProjectCreate(CamelModel):
    title: str = Field(min_length=1)
    description: str | None = None
    source_folder_path: str = Field(min_length=1)
    target_spec: str | None = None


class LatestTaskSummary(CamelModel):
    id: int
    status: str
    progress: int


class ProjectResponse(CamelModel):
    id: int
    title: str
    description: str | None = None
    source_folder_path: str
    target_spec: str | None = None
    file_count: int
    total_size_bytes: int
    has_labels: bool
    created_at: str


class ProjectDetailResponse(ProjectResponse):
    latest_task: LatestTaskSummary | None


class ProjectListResponse(CamelModel):
    data: list[ProjectResponse]

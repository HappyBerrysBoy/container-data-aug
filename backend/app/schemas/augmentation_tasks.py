from enum import StrEnum

from pydantic import Field

from app.schemas.base import CamelModel


class AugmentationTaskStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"
    FAILED = "FAILED"
    DONE = "DONE"


class AugmentationTaskCreate(CamelModel):
    worker_count: int = Field(ge=1)
    run_ocr_labeling: bool
    output_folder_name: str = Field(min_length=1)


class AugmentationTaskResponse(CamelModel):
    id: int
    project_id: int
    status: AugmentationTaskStatus
    progress: int
    worker_count: int
    run_ocr_labeling: bool
    processed_count: int
    failed_count: int
    total_image_count: int
    output_folder_path: str
    started_at: str | None
    completed_at: str | None


class ActiveTaskResponse(CamelModel):
    task: AugmentationTaskResponse | None


class AugmentationResultResponse(CamelModel):
    task_id: int
    project_id: int
    total_image_count: int
    success_count: int
    failed_count: int
    run_ocr_labeling: bool
    output_folder_path: str
    completed_at: str | None

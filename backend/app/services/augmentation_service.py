import os
from pathlib import Path
from typing import Any

from psycopg import errors

from app.augmentation import glm_ocr, shuffle
from app.core.errors import ApiError
from app.repositories import projects_repo, tasks_repo
from app.repositories.postgres import PostgresDatabase
from app.schemas.augmentation_tasks import AugmentationTaskCreate
from app.services.folder_scanner import scan_folder
from app.services.project_service import ProjectService


ACTIVE_STATUSES = {"PENDING", "RUNNING"}
FINISHED_STATUSES = {"DONE", "FAILED", "STOPPED"}


class AugmentationService:
    def __init__(
        self, db: PostgresDatabase, project_service: ProjectService
    ) -> None:
        self.db = db
        self.project_service = project_service

    def create_task(
        self, project_id: int, payload: AugmentationTaskCreate
    ) -> dict[str, Any]:
        self._validate_start_payload(payload)

        # Resolve output path without DB access; we need source_folder_path first.
        project = self.project_service.require_project(project_id)
        output_folder_path = self._resolve_output_folder(
            project, payload.output_folder_name
        )
        self._ensure_output_writable(output_folder_path)

        try:
            with self.db.connect() as conn:
                locked = projects_repo.get_by_id_for_update(conn, project_id)
                if locked is None:
                    raise ApiError(
                        "PROJECT_NOT_FOUND",
                        "Project not found",
                        status_code=404,
                        details={"projectId": project_id},
                    )
                active = tasks_repo.get_active(conn)
                if active is not None:
                    raise ApiError(
                        "TASK_ALREADY_RUNNING",
                        "An augmentation task is already running",
                        status_code=409,
                        details={"taskId": active["id"]},
                    )
                return tasks_repo.insert(
                    conn,
                    project_id=project_id,
                    worker_count=payload.worker_count,
                    run_ocr_labeling=payload.run_ocr_labeling,
                    variants_per_image=payload.variants_per_image,
                    output_folder_name=payload.output_folder_name.strip(),
                    output_folder_path=str(output_folder_path),
                    total_image_count=locked["file_count"],
                )
        except errors.UniqueViolation as exc:
            raise ApiError(
                "TASK_ALREADY_RUNNING",
                "An augmentation task is already running",
                status_code=409,
            ) from exc

    def run_task(self, task_id: int) -> None:
        with self.db.connect() as conn:
            conn.autocommit = True

            started = tasks_repo.mark_running(conn, task_id)
            if started != "RUNNING":
                return

            task = tasks_repo.get_by_id(conn, task_id)
            if task is None:
                return
            project = projects_repo.get_by_id(conn, task["project_id"])
            if project is None:
                tasks_repo.finish(conn, task_id, "FAILED")
                return

            source_folder = Path(project["source_folder_path"])
            output_folder = Path(task["output_folder_path"])

            try:
                scan = scan_folder(source_folder)
                if not scan.image_files:
                    tasks_repo.finish(conn, task_id, "DONE", progress=100)
                    return

                try:
                    reader = self._prepare_shuffle_reader()
                except Exception:
                    tasks_repo.finish(conn, task_id, "FAILED")
                    return

                for image_file in scan.image_files:
                    current = tasks_repo.get_status(conn, task_id)
                    if current != "RUNNING":
                        return

                    destination_dir = output_folder / image_file.relative_path.parent
                    try:
                        saved = shuffle.augment(
                            image_file.path,
                            destination_dir,
                            reader,
                            count=task["variants_per_image"],
                            randomize=True,
                            seed=None,
                            debug=False,
                        )
                    except Exception:
                        saved = []

                    after = tasks_repo.increment_counts(
                        conn,
                        task_id,
                        failed_delta=0 if saved else 1,
                        generated_delta=len(saved),
                    )
                    if after != "RUNNING":
                        return

                tasks_repo.finish(conn, task_id, "DONE", progress=100)
            except Exception:
                tasks_repo.finish(conn, task_id, "FAILED")

    def get_active_task(self) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            return tasks_repo.get_active(conn)

    def get_task(self, task_id: int) -> dict[str, Any]:
        with self.db.connect() as conn:
            task = tasks_repo.get_by_id(conn, task_id)
            if task is None:
                raise ApiError(
                    "TASK_NOT_FOUND",
                    "Task not found",
                    status_code=404,
                    details={"taskId": task_id},
                )
            return task

    def stop_task(self, task_id: int) -> dict[str, Any]:
        with self.db.connect() as conn:
            task = tasks_repo.get_by_id(conn, task_id)
            if task is None:
                raise ApiError(
                    "TASK_NOT_FOUND",
                    "Task not found",
                    status_code=404,
                    details={"taskId": task_id},
                )
            if task["status"] not in ACTIVE_STATUSES:
                raise ApiError(
                    "TASK_NOT_RUNNING",
                    "Task is not running",
                    status_code=409,
                    details={"taskId": task_id, "status": task["status"]},
                )
            updated = tasks_repo.finish(conn, task_id, "STOPPED")
            if updated is None:
                # Runner finished between SELECT and UPDATE; return current row.
                current = tasks_repo.get_by_id(conn, task_id)
                if current is None:
                    raise ApiError(
                        "TASK_NOT_FOUND",
                        "Task not found",
                        status_code=404,
                        details={"taskId": task_id},
                    )
                return current
            return updated

    def get_result(self, task_id: int) -> dict[str, Any]:
        task = self.get_task(task_id)
        if task["status"] not in FINISHED_STATUSES:
            raise ApiError(
                "TASK_NOT_FINISHED",
                "Task result is not available yet",
                status_code=409,
                details={"taskId": task_id, "status": task["status"]},
            )

        return {
            "task_id": task["id"],
            "project_id": task["project_id"],
            "total_image_count": task["total_image_count"],
            "success_count": task["processed_count"] - task["failed_count"],
            "failed_count": task["failed_count"],
            "variants_per_image": task["variants_per_image"],
            "generated_image_count": task["generated_image_count"],
            "run_ocr_labeling": task["run_ocr_labeling"],
            "output_folder_path": task["output_folder_path"],
            "completed_at": task["completed_at"],
        }

    def _prepare_shuffle_reader(self) -> Any:
        reader = glm_ocr.get_craft_glm_reader()
        prepare = getattr(reader, "prepare", None)
        if callable(prepare):
            prepare()
        return reader

    def _validate_start_payload(self, payload: AugmentationTaskCreate) -> None:
        if payload.worker_count < 1:
            raise ApiError(
                "VALIDATION_ERROR",
                "workerCount must be at least 1",
                status_code=422,
                details={"field": "workerCount"},
            )

        if not (1 <= payload.variants_per_image <= 90):
            raise ApiError(
                "VALIDATION_ERROR",
                "variantsPerImage must be between 1 and 90",
                status_code=422,
                details={"field": "variantsPerImage"},
            )

        output_folder_name = payload.output_folder_name.strip()
        if not output_folder_name:
            raise ApiError(
                "VALIDATION_ERROR",
                "outputFolderName is required",
                status_code=422,
                details={"field": "outputFolderName"},
            )

        output_path = Path(output_folder_name)
        if (
            output_path.is_absolute()
            or output_folder_name in {".", ".."}
            or "/" in output_folder_name
            or "\\" in output_folder_name
        ):
            raise ApiError(
                "VALIDATION_ERROR",
                "outputFolderName must be a folder name",
                status_code=422,
                details={"field": "outputFolderName"},
            )

    def _resolve_output_folder(
        self, project: dict[str, Any], output_folder_name: str
    ) -> Path:
        source_folder = Path(project["source_folder_path"])
        return source_folder.parent / output_folder_name.strip()

    def _ensure_output_writable(self, output_folder: Path) -> None:
        try:
            output_folder.mkdir(parents=True, exist_ok=True)
            if not os.access(output_folder, os.W_OK):
                raise PermissionError("Output folder is not writable")
            probe_file = output_folder / ".container-data-aug-write-test"
            probe_file.write_text("ok", encoding="utf-8")
            probe_file.unlink()
        except Exception as exc:
            raise ApiError(
                "PATH_NOT_WRITABLE",
                "Output folder is not writable",
                status_code=422,
                details={"outputFolderPath": str(output_folder)},
            ) from exc

import os
import shutil
import threading
from pathlib import Path
from typing import Any

from app.core.errors import ApiError
from app.repositories.json_store import JsonStore
from app.schemas.augmentation_tasks import AugmentationTaskCreate
from app.services.folder_scanner import scan_folder
from app.services.project_service import ProjectService
from app.services.time import utc_now_iso


ACTIVE_STATUSES = {"PENDING", "RUNNING"}
FINISHED_STATUSES = {"DONE", "FAILED", "STOPPED"}


class AugmentationService:
    def __init__(self, store: JsonStore, project_service: ProjectService) -> None:
        self.store = store
        self.project_service = project_service
        self._stop_events: dict[int, threading.Event] = {}
        self._events_lock = threading.Lock()

    def recover_stale_tasks(self) -> None:
        now = utc_now_iso()

        def mutator(state: dict[str, Any]) -> None:
            for task in state["tasks"]:
                # Backfill fields added after the JSON store was first written
                # so older task rows still serialize cleanly.
                task.setdefault("variantsPerImage", 1)
                if task["status"] in ACTIVE_STATUSES:
                    task["status"] = "FAILED"
                    task["completedAt"] = now

        self.store.mutate(mutator)

    def create_task(self, project_id: int, payload: AugmentationTaskCreate) -> dict[str, Any]:
        project = self.project_service.require_project(project_id)
        self._validate_start_payload(payload)
        self._ensure_no_active_task()

        output_folder_path = self._resolve_output_folder(project, payload.output_folder_name)
        self._ensure_output_writable(output_folder_path)

        task = self._create_pending_task(project, payload, output_folder_path)
        with self._events_lock:
            self._stop_events[task["id"]] = threading.Event()
        return task

    def run_task(self, task_id: int) -> None:
        task = self.get_task(task_id)
        project = self.project_service.require_project(task["projectId"])
        source_folder = Path(project["sourceFolderPath"])
        output_folder = Path(task["outputFolderPath"])

        self._update_task(
            task_id,
            {
                "status": "RUNNING",
                "startedAt": utc_now_iso(),
            },
        )

        try:
            scan = scan_folder(source_folder)
            if task["totalImageCount"] == 0:
                self._finish_task(task_id, "DONE", progress=100)
                return

            for image_file in scan.image_files:
                if self._should_stop(task_id):
                    self._finish_task(task_id, "STOPPED")
                    return

                destination = output_folder / image_file.relative_path
                try:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(image_file.path, destination)
                    self._increment_counts(task_id, processed_delta=1, failed_delta=0)
                except Exception:
                    self._increment_counts(task_id, processed_delta=0, failed_delta=1)

            if self._should_stop(task_id):
                self._finish_task(task_id, "STOPPED")
                return

            self._finish_task(task_id, "DONE", progress=100)
        except Exception:
            self._finish_task(task_id, "FAILED")
        finally:
            with self._events_lock:
                self._stop_events.pop(task_id, None)

    def get_active_task(self) -> dict[str, Any] | None:
        state = self.store.read_state()
        active_tasks = [
            task for task in state["tasks"] if task["status"] in ACTIVE_STATUSES
        ]
        if not active_tasks:
            return None
        return max(active_tasks, key=lambda task: task["id"])

    def get_task(self, task_id: int) -> dict[str, Any]:
        state = self.store.read_state()
        for task in state["tasks"]:
            if task["id"] == task_id:
                return task

        raise ApiError(
            "TASK_NOT_FOUND",
            "Task not found",
            status_code=404,
            details={"taskId": task_id},
        )

    def stop_task(self, task_id: int) -> dict[str, Any]:
        task = self.get_task(task_id)
        if task["status"] not in ACTIVE_STATUSES:
            raise ApiError(
                "TASK_NOT_RUNNING",
                "Task is not running",
                status_code=409,
                details={"taskId": task_id, "status": task["status"]},
            )

        with self._events_lock:
            event = self._stop_events.get(task_id)
            if event is not None:
                event.set()

        return self._finish_task(task_id, "STOPPED")

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
            "taskId": task["id"],
            "projectId": task["projectId"],
            "totalImageCount": task["totalImageCount"],
            "successCount": task["processedCount"],
            "failedCount": task["failedCount"],
            "runOcrLabeling": task["runOcrLabeling"],
            "outputFolderPath": task["outputFolderPath"],
            "completedAt": task["completedAt"],
        }

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

    def _ensure_no_active_task(self) -> None:
        active_task = self.get_active_task()
        if active_task is not None:
            raise ApiError(
                "TASK_ALREADY_RUNNING",
                "An augmentation task is already running",
                status_code=409,
                details={"taskId": active_task["id"]},
            )

    def _resolve_output_folder(
        self, project: dict[str, Any], output_folder_name: str
    ) -> Path:
        source_folder = Path(project["sourceFolderPath"])
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

    def _create_pending_task(
        self,
        project: dict[str, Any],
        payload: AugmentationTaskCreate,
        output_folder_path: Path,
    ) -> dict[str, Any]:
        def mutator(state: dict[str, Any]) -> dict[str, Any]:
            for active_task in state["tasks"]:
                if active_task["status"] in ACTIVE_STATUSES:
                    raise ApiError(
                        "TASK_ALREADY_RUNNING",
                        "An augmentation task is already running",
                        status_code=409,
                        details={"taskId": active_task["id"]},
                    )

            task = {
                "id": state["nextTaskId"],
                "projectId": project["id"],
                "status": "PENDING",
                "progress": 0,
                "workerCount": payload.worker_count,
                "runOcrLabeling": payload.run_ocr_labeling,
                "variantsPerImage": payload.variants_per_image,
                "processedCount": 0,
                "failedCount": 0,
                "totalImageCount": project["fileCount"],
                "outputFolderPath": str(output_folder_path),
                "startedAt": None,
                "completedAt": None,
            }
            state["nextTaskId"] += 1
            state["tasks"].append(task)
            return task

        return self.store.mutate(mutator)

    def _should_stop(self, task_id: int) -> bool:
        task = self.get_task(task_id)
        if task["status"] == "STOPPED":
            return True

        with self._events_lock:
            event = self._stop_events.get(task_id)
            return event.is_set() if event is not None else False

    def _increment_counts(
        self, task_id: int, *, processed_delta: int, failed_delta: int
    ) -> dict[str, Any]:
        def mutator(state: dict[str, Any]) -> dict[str, Any]:
            task = self._find_task_in_state(state, task_id)
            task["processedCount"] += processed_delta
            task["failedCount"] += failed_delta
            completed_count = task["processedCount"] + task["failedCount"]
            if task["totalImageCount"] > 0:
                task["progress"] = min(
                    100, round((completed_count / task["totalImageCount"]) * 100)
                )
            return task

        return self.store.mutate(mutator)

    def _update_task(self, task_id: int, values: dict[str, Any]) -> dict[str, Any]:
        def mutator(state: dict[str, Any]) -> dict[str, Any]:
            task = self._find_task_in_state(state, task_id)
            task.update(values)
            return task

        return self.store.mutate(mutator)

    def _finish_task(
        self, task_id: int, status: str, *, progress: int | None = None
    ) -> dict[str, Any]:
        values: dict[str, Any] = {
            "status": status,
            "completedAt": utc_now_iso(),
        }
        if progress is not None:
            values["progress"] = progress
        return self._update_task(task_id, values)

    def _find_task_in_state(
        self, state: dict[str, Any], task_id: int
    ) -> dict[str, Any]:
        for task in state["tasks"]:
            if task["id"] == task_id:
                return task
        raise ApiError(
            "TASK_NOT_FOUND",
            "Task not found",
            status_code=404,
            details={"taskId": task_id},
        )

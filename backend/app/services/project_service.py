import os
from pathlib import Path
from typing import Any

from app.core.errors import ApiError
from app.repositories.json_store import JsonStore
from app.schemas.projects import ProjectCreate
from app.services.folder_scanner import scan_folder
from app.services.time import utc_now_iso


class ProjectService:
    def __init__(self, store: JsonStore) -> None:
        self.store = store

    def list_projects(self) -> list[dict[str, Any]]:
        state = self.store.read_state()
        return sorted(state["projects"], key=lambda project: project["id"], reverse=True)

    def create_project(self, payload: ProjectCreate) -> dict[str, Any]:
        title = payload.title.strip()
        if not title:
            raise ApiError(
                "VALIDATION_ERROR",
                "Project title is required",
                status_code=422,
                details={"field": "title"},
            )

        source_folder = Path(payload.source_folder_path).expanduser()
        if not source_folder.is_absolute():
            raise ApiError(
                "VALIDATION_ERROR",
                "sourceFolderPath must be an absolute path",
                status_code=422,
                details={"field": "sourceFolderPath"},
            )
        if not source_folder.exists() or not source_folder.is_dir():
            raise ApiError(
                "PATH_NOT_FOUND",
                "Source folder does not exist",
                status_code=422,
                details={"sourceFolderPath": str(source_folder)},
            )
        if not os.access(source_folder, os.R_OK):
            raise ApiError(
                "PATH_NOT_READABLE",
                "Source folder is not readable",
                status_code=422,
                details={"sourceFolderPath": str(source_folder)},
            )

        scan = scan_folder(source_folder)

        def mutator(state: dict[str, Any]) -> dict[str, Any]:
            project = {
                "id": state["nextProjectId"],
                "title": title,
                "description": payload.description.strip()
                if payload.description is not None
                else None,
                "sourceFolderPath": str(source_folder),
                "targetSpec": payload.target_spec.strip()
                if payload.target_spec is not None
                else None,
                "fileCount": scan.file_count,
                "totalSizeBytes": scan.total_size_bytes,
                "hasLabels": scan.has_labels,
                "createdAt": utc_now_iso(),
            }
            state["nextProjectId"] += 1
            state["projects"].append(project)
            return project

        return self.store.mutate(mutator)

    def get_project(self, project_id: int) -> dict[str, Any]:
        project = self._find_project(project_id)
        latest_task = self.get_latest_task_summary(project_id)
        return {**project, "latestTask": latest_task}

    def require_project(self, project_id: int) -> dict[str, Any]:
        return self._find_project(project_id)

    def delete_project(self, project_id: int) -> None:
        def mutator(state: dict[str, Any]) -> None:
            before_count = len(state["projects"])
            state["projects"] = [
                project for project in state["projects"] if project["id"] != project_id
            ]
            if len(state["projects"]) == before_count:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            state["tasks"] = [
                task for task in state["tasks"] if task["projectId"] != project_id
            ]

        self.store.mutate(mutator)

    def get_latest_task_summary(self, project_id: int) -> dict[str, Any] | None:
        state = self.store.read_state()
        project_tasks = [
            task for task in state["tasks"] if task["projectId"] == project_id
        ]
        if not project_tasks:
            return None

        latest_task = max(project_tasks, key=lambda task: task["id"])
        return {
            "id": latest_task["id"],
            "status": latest_task["status"],
            "progress": latest_task["progress"],
        }

    def _find_project(self, project_id: int) -> dict[str, Any]:
        state = self.store.read_state()
        for project in state["projects"]:
            if project["id"] == project_id:
                return project

        raise ApiError(
            "PROJECT_NOT_FOUND",
            "Project not found",
            status_code=404,
            details={"projectId": project_id},
        )

import os
from pathlib import Path
from typing import Any

from app.core.errors import ApiError
from app.repositories import projects_repo, tasks_repo
from app.repositories.postgres import PostgresDatabase
from app.schemas.projects import ProjectCreate
from app.services.folder_scanner import scan_folder


class ProjectService:
    def __init__(self, db: PostgresDatabase) -> None:
        self.db = db

    def list_projects(self) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            return projects_repo.list_all(conn)

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
        description = (
            payload.description.strip() if payload.description is not None else None
        )
        target_spec = (
            payload.target_spec.strip() if payload.target_spec is not None else None
        )

        with self.db.connect() as conn:
            return projects_repo.insert(
                conn,
                title=title,
                description=description,
                source_folder_path=str(source_folder),
                target_spec=target_spec,
                file_count=scan.file_count,
                total_size_bytes=scan.total_size_bytes,
                has_labels=scan.has_labels,
            )

    def get_project(self, project_id: int) -> dict[str, Any]:
        with self.db.connect() as conn:
            project = projects_repo.get_by_id(conn, project_id)
            if project is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            latest = projects_repo.latest_task_summary(conn, project_id)
        return {**project, "latest_task": latest}

    def rescan_project(self, project_id: int) -> dict[str, Any]:
        with self.db.connect() as conn:
            project = projects_repo.get_by_id(conn, project_id)
            if project is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            active = tasks_repo.get_active_for_project(conn, project_id)
            if active is not None:
                raise ApiError(
                    "PROJECT_HAS_ACTIVE_TASK",
                    "Project has an active augmentation task",
                    status_code=409,
                    details={
                        "projectId": project_id,
                        "taskId": active["id"],
                        "status": active["status"],
                    },
                )

        source_folder = Path(project["source_folder_path"])
        if not source_folder.exists() or not source_folder.is_dir():
            raise ApiError(
                "PATH_NOT_FOUND",
                "Source folder no longer exists",
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

        with self.db.connect() as conn:
            locked = projects_repo.get_by_id_for_update(conn, project_id)
            if locked is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            active = tasks_repo.get_active_for_project(conn, project_id)
            if active is not None:
                raise ApiError(
                    "PROJECT_HAS_ACTIVE_TASK",
                    "Project has an active augmentation task",
                    status_code=409,
                    details={
                        "projectId": project_id,
                        "taskId": active["id"],
                        "status": active["status"],
                    },
                )
            updated = projects_repo.update_scan(
                conn,
                project_id=project_id,
                file_count=scan.file_count,
                total_size_bytes=scan.total_size_bytes,
                has_labels=scan.has_labels,
            )
            if updated is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            return updated

    def require_project(self, project_id: int) -> dict[str, Any]:
        with self.db.connect() as conn:
            project = projects_repo.get_by_id(conn, project_id)
            if project is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            return project

    def delete_project(self, project_id: int) -> None:
        with self.db.connect() as conn:
            project = projects_repo.get_by_id_for_update(conn, project_id)
            if project is None:
                raise ApiError(
                    "PROJECT_NOT_FOUND",
                    "Project not found",
                    status_code=404,
                    details={"projectId": project_id},
                )
            active = tasks_repo.get_active_for_project(conn, project_id)
            if active is not None:
                raise ApiError(
                    "PROJECT_HAS_ACTIVE_TASK",
                    "Project has an active augmentation task",
                    status_code=409,
                    details={
                        "projectId": project_id,
                        "taskId": active["id"],
                        "status": active["status"],
                    },
                )
            projects_repo.delete(conn, project_id)

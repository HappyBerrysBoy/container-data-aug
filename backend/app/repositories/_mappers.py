from datetime import UTC, datetime
from typing import Any


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (
        dt.astimezone(UTC)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def project_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "source_folder_path": row["source_folder_path"],
        "target_spec": row["target_spec"],
        "file_count": row["file_count"],
        "total_size_bytes": row["total_size_bytes"],
        "has_labels": row["has_labels"],
        "created_at": iso(row["created_at"]),
    }


def task_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "status": row["status"],
        "progress": row["progress"],
        "worker_count": row["worker_count"],
        "run_ocr_labeling": row["run_ocr_labeling"],
        "variants_per_image": row["variants_per_image"],
        "processed_count": row["processed_count"],
        "failed_count": row["failed_count"],
        "total_image_count": row["total_image_count"],
        "generated_image_count": row["generated_image_count"],
        "output_folder_path": row["output_folder_path"],
        "started_at": iso(row["started_at"]),
        "completed_at": iso(row["completed_at"]),
    }

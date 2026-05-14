from typing import Any

import psycopg

from app.repositories._mappers import task_row


_TASK_COLUMNS = (
    "id, project_id, status, progress, worker_count, run_ocr_labeling, "
    "variants_per_image, processed_count, failed_count, total_image_count, "
    "generated_image_count, output_folder_path, started_at, completed_at"
)


def get_by_id(conn: psycopg.Connection, task_id: int) -> dict[str, Any] | None:
    row = conn.execute(
        f"SELECT {_TASK_COLUMNS} FROM augmentation_tasks "
        "WHERE id = %(task_id)s",
        {"task_id": task_id},
    ).fetchone()
    return task_row(row)


def get_active(conn: psycopg.Connection) -> dict[str, Any] | None:
    row = conn.execute(
        f"SELECT {_TASK_COLUMNS} FROM augmentation_tasks "
        "WHERE status IN ('PENDING', 'RUNNING') "
        "ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return task_row(row)


def get_active_for_project(
    conn: psycopg.Connection, project_id: int
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT id, status FROM augmentation_tasks "
        "WHERE project_id = %(project_id)s "
        "  AND status IN ('PENDING', 'RUNNING') "
        "LIMIT 1",
        {"project_id": project_id},
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "status": row["status"]}


def insert(
    conn: psycopg.Connection,
    *,
    project_id: int,
    worker_count: int,
    run_ocr_labeling: bool,
    variants_per_image: int,
    output_folder_name: str,
    output_folder_path: str,
    total_image_count: int,
) -> dict[str, Any]:
    row = conn.execute(
        "INSERT INTO augmentation_tasks "
        "(project_id, status, progress, "
        " worker_count, run_ocr_labeling, variants_per_image, "
        " output_folder_name, output_folder_path, "
        " processed_count, failed_count, total_image_count, generated_image_count) "
        "VALUES "
        "(%(project_id)s, 'PENDING', 0, "
        " %(worker_count)s, %(run_ocr_labeling)s, %(variants_per_image)s, "
        " %(output_folder_name)s, %(output_folder_path)s, "
        " 0, 0, %(total_image_count)s, 0) "
        f"RETURNING {_TASK_COLUMNS}",
        {
            "project_id": project_id,
            "worker_count": worker_count,
            "run_ocr_labeling": run_ocr_labeling,
            "variants_per_image": variants_per_image,
            "output_folder_name": output_folder_name,
            "output_folder_path": output_folder_path,
            "total_image_count": total_image_count,
        },
    ).fetchone()
    return task_row(row)


def mark_running(conn: psycopg.Connection, task_id: int) -> str | None:
    row = conn.execute(
        "UPDATE augmentation_tasks "
        "SET status = 'RUNNING', started_at = now() "
        "WHERE id = %(task_id)s AND status = 'PENDING' "
        "RETURNING status",
        {"task_id": task_id},
    ).fetchone()
    return row["status"] if row is not None else None


def get_status(conn: psycopg.Connection, task_id: int) -> str | None:
    row = conn.execute(
        "SELECT status FROM augmentation_tasks WHERE id = %(task_id)s",
        {"task_id": task_id},
    ).fetchone()
    return row["status"] if row is not None else None


def increment_counts(
    conn: psycopg.Connection,
    task_id: int,
    *,
    failed_delta: int,
    generated_delta: int,
) -> str | None:
    row = conn.execute(
        "UPDATE augmentation_tasks SET "
        "processed_count = processed_count + 1, "
        "failed_count = failed_count + %(failed_delta)s, "
        "generated_image_count = generated_image_count + %(generated_delta)s, "
        "progress = LEAST(100, "
        "  FLOOR(((processed_count + 1) * 100.0) "
        "        / GREATEST(total_image_count, 1))::INTEGER) "
        "WHERE id = %(task_id)s "
        "  AND status IN ('RUNNING', 'STOPPED') "
        "RETURNING status",
        {
            "task_id": task_id,
            "failed_delta": failed_delta,
            "generated_delta": generated_delta,
        },
    ).fetchone()
    return row["status"] if row is not None else None


def finish(
    conn: psycopg.Connection,
    task_id: int,
    status: str,
    *,
    progress: int | None = None,
) -> dict[str, Any] | None:
    row = conn.execute(
        "UPDATE augmentation_tasks SET "
        "status = %(status)s, "
        "completed_at = now(), "
        "progress = COALESCE(%(progress)s, progress) "
        "WHERE id = %(task_id)s "
        "  AND status IN ('PENDING', 'RUNNING') "
        f"RETURNING {_TASK_COLUMNS}",
        {"task_id": task_id, "status": status, "progress": progress},
    ).fetchone()
    return task_row(row)


def recover_stale(conn: psycopg.Connection) -> None:
    conn.execute(
        "UPDATE augmentation_tasks "
        "SET status = 'FAILED', completed_at = now() "
        "WHERE status IN ('PENDING', 'RUNNING')"
    )

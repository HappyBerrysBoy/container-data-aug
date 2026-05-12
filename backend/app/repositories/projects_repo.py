from typing import Any

import psycopg

from app.repositories._mappers import project_row


_PROJECT_COLUMNS = (
    "id, title, description, source_folder_path, target_spec, "
    "file_count, total_size_bytes, has_labels, created_at"
)


def list_all(conn: psycopg.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"SELECT {_PROJECT_COLUMNS} FROM projects ORDER BY id DESC"
    ).fetchall()
    return [project_row(row) for row in rows]


def get_by_id(conn: psycopg.Connection, project_id: int) -> dict[str, Any] | None:
    row = conn.execute(
        f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = %(project_id)s",
        {"project_id": project_id},
    ).fetchone()
    return project_row(row)


def get_by_id_for_update(
    conn: psycopg.Connection, project_id: int
) -> dict[str, Any] | None:
    row = conn.execute(
        f"SELECT {_PROJECT_COLUMNS} FROM projects "
        "WHERE id = %(project_id)s FOR UPDATE",
        {"project_id": project_id},
    ).fetchone()
    return project_row(row)


def insert(
    conn: psycopg.Connection,
    *,
    title: str,
    description: str | None,
    source_folder_path: str,
    target_spec: str | None,
    file_count: int,
    total_size_bytes: int,
    has_labels: bool,
) -> dict[str, Any]:
    row = conn.execute(
        "INSERT INTO projects "
        "(title, description, source_folder_path, target_spec, "
        " file_count, total_size_bytes, has_labels) "
        "VALUES "
        "(%(title)s, %(description)s, %(source_folder_path)s, %(target_spec)s, "
        " %(file_count)s, %(total_size_bytes)s, %(has_labels)s) "
        f"RETURNING {_PROJECT_COLUMNS}",
        {
            "title": title,
            "description": description,
            "source_folder_path": source_folder_path,
            "target_spec": target_spec,
            "file_count": file_count,
            "total_size_bytes": total_size_bytes,
            "has_labels": has_labels,
        },
    ).fetchone()
    return project_row(row)


def update_scan(
    conn: psycopg.Connection,
    *,
    project_id: int,
    file_count: int,
    total_size_bytes: int,
    has_labels: bool,
) -> dict[str, Any] | None:
    row = conn.execute(
        "UPDATE projects SET "
        "file_count = %(file_count)s, "
        "total_size_bytes = %(total_size_bytes)s, "
        "has_labels = %(has_labels)s "
        "WHERE id = %(project_id)s "
        f"RETURNING {_PROJECT_COLUMNS}",
        {
            "project_id": project_id,
            "file_count": file_count,
            "total_size_bytes": total_size_bytes,
            "has_labels": has_labels,
        },
    ).fetchone()
    return project_row(row)


def delete(conn: psycopg.Connection, project_id: int) -> None:
    conn.execute(
        "DELETE FROM projects WHERE id = %(project_id)s",
        {"project_id": project_id},
    )


def latest_task_summary(
    conn: psycopg.Connection, project_id: int
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT id, status, progress "
        "FROM augmentation_tasks "
        "WHERE project_id = %(project_id)s "
        "ORDER BY id DESC LIMIT 1",
        {"project_id": project_id},
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "status": row["status"], "progress": row["progress"]}

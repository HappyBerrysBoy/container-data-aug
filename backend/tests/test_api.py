from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.repositories.postgres import PostgresDatabase
from app.services import augmentation_service


@contextmanager
def make_client(
    db: PostgresDatabase, *, run_background_tasks: bool = True
) -> Iterator[TestClient]:
    app = create_app(db=db, run_background_tasks=run_background_tasks)
    with TestClient(app) as client:
        yield client


def create_image_folder(tmp_path: Path) -> Path:
    source = tmp_path / "dataset"
    nested = source / "nested"
    nested.mkdir(parents=True)
    (source / "001.jpg").write_bytes(b"jpg-data")
    (nested / "002.png").write_bytes(b"png-data")
    (source / "labels.csv").write_text("file,label\n001.jpg,MSCU1234567\n")
    (source / ".hidden.jpg").write_bytes(b"hidden")
    return source


def create_project(client: TestClient, source: Path) -> dict:
    response = client.post(
        "/api/projects",
        json={
            "title": "Busan container dataset",
            "description": "MVP test dataset",
            "sourceFolderPath": str(source),
            "targetSpec": "ISO 6346",
        },
    )
    assert response.status_code == 201
    return response.json()


def assert_error(response, code: str) -> None:
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == code


def patch_shuffle_runner(
    monkeypatch,
    *,
    failed_filenames: set[str] | None = None,
    reader_error: Exception | None = None,
    prepare_error: Exception | None = None,
) -> None:
    failed = failed_filenames or set()

    if reader_error is None:
        class FakeReader:
            def prepare(self) -> None:
                if prepare_error is not None:
                    raise prepare_error

        monkeypatch.setattr(
            augmentation_service.glm_ocr,
            "get_craft_glm_reader",
            lambda: FakeReader(),
        )
    else:

        def raise_reader_error():
            raise reader_error

        monkeypatch.setattr(
            augmentation_service.glm_ocr,
            "get_craft_glm_reader",
            raise_reader_error,
        )

    def fake_augment(
        src,
        dst_dir,
        reader,
        count=90,
        *,
        randomize=True,
        seed=None,
        debug=False,
    ):
        assert randomize is True
        assert seed is None
        assert debug is False
        src_path = Path(src)
        if src_path.name in failed:
            return []

        dst_dir.mkdir(parents=True, exist_ok=True)
        saved = []
        for index in range(1, count + 1):
            out_path = dst_dir / f"{src_path.stem}_{index}{src_path.suffix}"
            content = src_path.read_bytes() + f"-shuffle-{index}".encode()
            out_path.write_bytes(content)
            saved.append(out_path)
        return saved

    monkeypatch.setattr(augmentation_service.shuffle, "augment", fake_augment)


def test_health_and_openapi_are_available(db: PostgresDatabase) -> None:
    with make_client(db) as client:
        health_response = client.get("/api/health")
        openapi_response = client.get("/openapi.json")

    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}
    assert openapi_response.status_code == 200
    assert (
        openapi_response.json()["info"]["title"]
        == "Container Image Augmentation API"
    )


def test_create_list_detail_and_delete_project(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    source = create_image_folder(tmp_path)
    with make_client(db) as client:
        project = create_project(client, source)
        assert project["id"] == 1
        assert project["title"] == "Busan container dataset"
        assert project["sourceFolderPath"] == str(source)
        assert project["fileCount"] == 2
        assert project["totalSizeBytes"] == len(b"jpg-data") + len(b"png-data")
        assert project["hasLabels"] is True

        list_response = client.get("/api/projects")
        assert list_response.status_code == 200
        assert list_response.json()["data"] == [project]

        detail_response = client.get(f"/api/projects/{project['id']}")
        assert detail_response.status_code == 200
        assert detail_response.json()["latestTask"] is None

        delete_response = client.delete(f"/api/projects/{project['id']}")
        assert delete_response.status_code == 204

        missing_response = client.get(f"/api/projects/{project['id']}")
        assert missing_response.status_code == 404
        assert_error(missing_response, "PROJECT_NOT_FOUND")
        assert source.exists()


def test_create_project_rejects_missing_path(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    with make_client(db) as client:
        response = client.post(
            "/api/projects",
            json={
                "title": "Missing dataset",
                "sourceFolderPath": str(tmp_path / "does-not-exist"),
            },
        )

    assert response.status_code == 422
    assert_error(response, "PATH_NOT_FOUND")


def test_start_task_shuffles_images_and_returns_result(
    tmp_path: Path, db: PostgresDatabase, monkeypatch
) -> None:
    patch_shuffle_runner(monkeypatch)
    source = create_image_folder(tmp_path)
    with make_client(db) as client:
        project = create_project(client, source)

        response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 2,
                "runOcrLabeling": True,
                "variantsPerImage": 3,
                "outputFolderName": "dataset-augmented",
            },
        )

        assert response.status_code == 201
        created_task = response.json()
        task_response = client.get(
            f"/api/augmentation-tasks/{created_task['id']}"
        )
        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "DONE"
        assert task["progress"] == 100
        assert task["processedCount"] == 2
        assert task["failedCount"] == 0
        assert task["generatedImageCount"] == 6
        assert Path(task["outputFolderPath"]).is_dir()
        assert (tmp_path / "dataset-augmented" / "001_1.jpg").exists()
        assert (tmp_path / "dataset-augmented" / "001_2.jpg").exists()
        assert (tmp_path / "dataset-augmented" / "001_3.jpg").exists()
        assert (tmp_path / "dataset-augmented" / "nested" / "002_1.png").exists()
        assert (tmp_path / "dataset-augmented" / "nested" / "002_2.png").exists()
        assert (tmp_path / "dataset-augmented" / "nested" / "002_3.png").exists()

        result_response = client.get(
            f"/api/augmentation-tasks/{task['id']}/result"
        )
        assert result_response.status_code == 200
        assert result_response.json() == {
            "taskId": task["id"],
            "projectId": project["id"],
            "totalImageCount": 2,
            "successCount": 2,
            "failedCount": 0,
            "variantsPerImage": 3,
            "generatedImageCount": 6,
            "runOcrLabeling": True,
            "outputFolderPath": str(tmp_path / "dataset-augmented"),
            "completedAt": task["completedAt"],
        }


def test_start_task_counts_per_image_shuffle_failures(
    tmp_path: Path, db: PostgresDatabase, monkeypatch
) -> None:
    patch_shuffle_runner(monkeypatch, failed_filenames={"002.png"})
    source = create_image_folder(tmp_path)
    with make_client(db) as client:
        project = create_project(client, source)

        response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 2,
                "runOcrLabeling": False,
                "variantsPerImage": 3,
                "outputFolderName": "dataset-augmented",
            },
        )

        assert response.status_code == 201
        created_task = response.json()
        task_response = client.get(
            f"/api/augmentation-tasks/{created_task['id']}"
        )
        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "DONE"
        assert task["progress"] == 100
        assert task["processedCount"] == 2
        assert task["failedCount"] == 1
        assert task["generatedImageCount"] == 3

        result_response = client.get(
            f"/api/augmentation-tasks/{task['id']}/result"
        )
        assert result_response.status_code == 200
        result = result_response.json()
        assert result["successCount"] == 1
        assert result["failedCount"] == 1
        assert result["generatedImageCount"] == 3
        assert result["runOcrLabeling"] is False


def test_reader_initialization_failure_marks_task_failed(
    tmp_path: Path, db: PostgresDatabase, monkeypatch
) -> None:
    patch_shuffle_runner(monkeypatch, prepare_error=RuntimeError("model missing"))
    source = create_image_folder(tmp_path)
    with make_client(db) as client:
        project = create_project(client, source)

        response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 1,
                "runOcrLabeling": False,
                "variantsPerImage": 3,
                "outputFolderName": "dataset-augmented",
            },
        )

        assert response.status_code == 201
        created_task = response.json()
        task_response = client.get(
            f"/api/augmentation-tasks/{created_task['id']}"
        )
        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "FAILED"
        assert task["processedCount"] == 0
        assert task["failedCount"] == 0
        assert task["generatedImageCount"] == 0


def test_active_task_blocks_second_task_and_result_until_finished(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    source = create_image_folder(tmp_path)
    with make_client(db, run_background_tasks=False) as client:
        project = create_project(client, source)

        first_response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 1,
                "runOcrLabeling": False,
                "variantsPerImage": 1,
                "outputFolderName": "first-output",
            },
        )
        assert first_response.status_code == 201
        first_task = first_response.json()
        assert first_task["status"] == "PENDING"

        active_response = client.get("/api/augmentation-tasks/active")
        assert active_response.status_code == 200
        assert active_response.json()["task"]["id"] == first_task["id"]

        result_response = client.get(
            f"/api/augmentation-tasks/{first_task['id']}/result"
        )
        assert result_response.status_code == 409
        assert_error(result_response, "TASK_NOT_FINISHED")

        second_response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 1,
                "runOcrLabeling": False,
                "variantsPerImage": 1,
                "outputFolderName": "second-output",
            },
        )
        assert second_response.status_code == 409
        assert_error(second_response, "TASK_ALREADY_RUNNING")

        stop_response = client.post(
            f"/api/augmentation-tasks/{first_task['id']}/stop"
        )
        assert stop_response.status_code == 200
        assert stop_response.json()["status"] == "STOPPED"

        stopped_result_response = client.get(
            f"/api/augmentation-tasks/{first_task['id']}/result"
        )
        assert stopped_result_response.status_code == 200
        assert stopped_result_response.json()["successCount"] == 0


def test_output_folder_name_must_be_a_folder_name(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    source = create_image_folder(tmp_path)
    with make_client(db) as client:
        project = create_project(client, source)

        response = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 1,
                "runOcrLabeling": False,
                "variantsPerImage": 1,
                "outputFolderName": "../outside",
            },
        )

    assert response.status_code == 422
    assert_error(response, "VALIDATION_ERROR")


def test_delete_project_with_active_task_returns_conflict(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    source = create_image_folder(tmp_path)
    with make_client(db, run_background_tasks=False) as client:
        project = create_project(client, source)

        start = client.post(
            f"/api/projects/{project['id']}/augmentation-tasks",
            json={
                "workerCount": 1,
                "runOcrLabeling": False,
                "outputFolderName": "out",
            },
        )
        assert start.status_code == 201

        delete_response = client.delete(f"/api/projects/{project['id']}")
        assert delete_response.status_code == 409
        assert_error(delete_response, "PROJECT_HAS_ACTIVE_TASK")


def test_startup_marks_stale_active_tasks_as_failed(
    tmp_path: Path, db: PostgresDatabase
) -> None:
    init_sql = (
        Path(__file__).resolve().parents[1] / "db" / "init.sql"
    ).read_text(encoding="utf-8")
    with db.connect() as conn:
        conn.execute(init_sql)
        conn.execute(
            "INSERT INTO projects "
            "(id, title, source_folder_path, file_count) "
            "VALUES (1, 'Existing project', %s, 0)",
            (str(tmp_path),),
        )
        conn.execute(
            "INSERT INTO augmentation_tasks "
            "(id, project_id, status, progress, "
            " output_folder_name, output_folder_path, "
            " total_image_count, processed_count, failed_count) "
            "VALUES (1, 1, 'RUNNING', 40, 'out', %s, 10, 4, 0)",
            (str(tmp_path / "out"),),
        )

    with make_client(db, run_background_tasks=False) as client:
        task_response = client.get("/api/augmentation-tasks/1")
        active_response = client.get("/api/augmentation-tasks/active")
        result_response = client.get("/api/augmentation-tasks/1/result")

    assert task_response.status_code == 200
    assert task_response.json()["status"] == "FAILED"
    assert task_response.json()["progress"] == 40
    assert task_response.json()["completedAt"] is not None
    assert active_response.status_code == 200
    assert active_response.json() == {"task": None}
    assert result_response.status_code == 200
    assert result_response.json()["successCount"] == 4

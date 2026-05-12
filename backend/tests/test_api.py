import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path: Path, *, run_background_tasks: bool = True) -> TestClient:
    app = create_app(
        state_file=tmp_path / "state.json",
        run_background_tasks=run_background_tasks,
    )
    return TestClient(app)


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


def test_health_and_openapi_are_available(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    health_response = client.get("/api/health")
    openapi_response = client.get("/openapi.json")

    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}
    assert openapi_response.status_code == 200
    assert openapi_response.json()["info"]["title"] == "Container Image Augmentation API"


def test_create_list_detail_and_delete_project(tmp_path: Path) -> None:
    source = create_image_folder(tmp_path)
    client = make_client(tmp_path)

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


def test_create_project_rejects_missing_path(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.post(
        "/api/projects",
        json={
            "title": "Missing dataset",
            "sourceFolderPath": str(tmp_path / "does-not-exist"),
        },
    )

    assert response.status_code == 422
    assert_error(response, "PATH_NOT_FOUND")


def test_start_task_copies_images_and_returns_result(tmp_path: Path) -> None:
    source = create_image_folder(tmp_path)
    client = make_client(tmp_path)
    project = create_project(client, source)

    response = client.post(
        f"/api/projects/{project['id']}/augmentation-tasks",
        json={
            "workerCount": 2,
            "runOcrLabeling": True,
            "variantsPerImage": 1,
            "outputFolderName": "dataset-augmented",
        },
    )

    assert response.status_code == 201
    created_task = response.json()
    task_response = client.get(f"/api/augmentation-tasks/{created_task['id']}")
    assert task_response.status_code == 200
    task = task_response.json()
    assert task["status"] == "DONE"
    assert task["progress"] == 100
    assert task["processedCount"] == 2
    assert task["failedCount"] == 0
    assert Path(task["outputFolderPath"]).is_dir()
    assert (tmp_path / "dataset-augmented" / "001.jpg").read_bytes() == b"jpg-data"
    assert (tmp_path / "dataset-augmented" / "nested" / "002.png").read_bytes() == b"png-data"

    result_response = client.get(f"/api/augmentation-tasks/{task['id']}/result")
    assert result_response.status_code == 200
    assert result_response.json() == {
        "taskId": task["id"],
        "projectId": project["id"],
        "totalImageCount": 2,
        "successCount": 2,
        "failedCount": 0,
        "runOcrLabeling": True,
        "outputFolderPath": str(tmp_path / "dataset-augmented"),
        "completedAt": task["completedAt"],
    }


def test_active_task_blocks_second_task_and_result_until_finished(tmp_path: Path) -> None:
    source = create_image_folder(tmp_path)
    client = make_client(tmp_path, run_background_tasks=False)
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

    result_response = client.get(f"/api/augmentation-tasks/{first_task['id']}/result")
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

    stop_response = client.post(f"/api/augmentation-tasks/{first_task['id']}/stop")
    assert stop_response.status_code == 200
    assert stop_response.json()["status"] == "STOPPED"

    stopped_result_response = client.get(
        f"/api/augmentation-tasks/{first_task['id']}/result"
    )
    assert stopped_result_response.status_code == 200
    assert stopped_result_response.json()["successCount"] == 0


def test_output_folder_name_must_be_a_folder_name(tmp_path: Path) -> None:
    source = create_image_folder(tmp_path)
    client = make_client(tmp_path)
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


def test_startup_marks_stale_active_tasks_as_failed(tmp_path: Path) -> None:
    state_file = tmp_path / "state.json"
    state_file.write_text(
        json.dumps(
            {
                "nextProjectId": 2,
                "nextTaskId": 2,
                "projects": [
                    {
                        "id": 1,
                        "title": "Existing project",
                        "description": None,
                        "sourceFolderPath": str(tmp_path),
                        "targetSpec": None,
                        "fileCount": 0,
                        "totalSizeBytes": 0,
                        "hasLabels": False,
                        "createdAt": "2026-05-05T00:00:00Z",
                    }
                ],
                "tasks": [
                    {
                        "id": 1,
                        "projectId": 1,
                        "status": "RUNNING",
                        "progress": 40,
                        "workerCount": 1,
                        "runOcrLabeling": False,
                        "processedCount": 4,
                        "failedCount": 0,
                        "totalImageCount": 10,
                        "outputFolderPath": str(tmp_path / "out"),
                        "startedAt": "2026-05-05T00:01:00Z",
                        "completedAt": None,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    app = create_app(state_file=state_file, run_background_tasks=False)
    client = TestClient(app)

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

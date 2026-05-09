# Backend

FastAPI backend for the Container Image Augmentation MVP.

## Quick Start

```bash
uv run uvicorn app.main:app --reload
```

The API is served at `http://127.0.0.1:8000` by default.

## API Docs

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Commands

| Command | Description |
| --- | --- |
| `uv run uvicorn app.main:app --reload` | Start the development server |
| `uv run python main.py` | Start the development server through the compatibility entrypoint |
| `uv run pytest` | Run backend API contract tests |

## Runtime State

MVP persistence uses a local JSON state file:

```text
backend/data/app_state.json
```

The file is generated at runtime and stores project metadata, augmentation task metadata, and next ID counters. It is not a database replacement; the repository boundary is intentionally small so PostgreSQL can replace it later.

## Implemented MVP Scope

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{projectId}`
- `DELETE /api/projects/{projectId}`
- `POST /api/projects/{projectId}/rescan`
- `POST /api/projects/{projectId}/augmentation-tasks`
- `GET /api/augmentation-tasks/active`
- `GET /api/augmentation-tasks/{taskId}`
- `POST /api/augmentation-tasks/{taskId}/stop`
- `GET /api/augmentation-tasks/{taskId}/result`

The augmentation task currently creates the output folder and copies source images while preserving relative paths. Real augmentation and OCR are deferred.

## Notes

- API fields use `camelCase`.
- Enum values use `UPPER_SNAKE_CASE`.
- CORS allows `http://localhost:3000` and `http://127.0.0.1:3000` by default.
- Additional CORS origins can be configured with `BACKEND_CORS_ORIGINS`.
- CUDA/PyTorch dependencies are optional under the `cuda` extra because the MVP backend tests do not require them.

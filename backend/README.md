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
| `uv sync --extra cuda` | Install optional CRAFT/GLM-OCR runtime dependencies |

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

The augmentation task runs the shuffle augmentation pipeline for every scanned image while preserving relative output paths. `variantsPerImage` controls how many shuffled images are generated per source image. `runOcrLabeling` is stored for API compatibility but does not currently change runner behavior.

## GLM-OCR Runtime

The shuffle runner uses CRAFT bbox detection with Hugging Face Transformers GLM-OCR for per-character recognition. Install the optional runtime before using the real model:

```bash
uv sync --extra cuda
```

By default the reader loads `zai-org/GLM-OCR` through the Hugging Face cache on first use. Pass a local model directory through `get_craft_glm_reader(model_id_or_path="/path/to/model", local_files_only=True)` for offline runs. The default device is CUDA; if CUDA is unavailable, the reader warns and falls back to CPU.

Real model tests are opt-in because they require a cached model or network access:

```bash
BACKEND_RUN_REAL_MODEL_TESTS=1 uv run --extra cuda pytest tests/test_glm_ocr_transformers.py
```

## Notes

- API fields use `camelCase`.
- Enum values use `UPPER_SNAKE_CASE`.
- CORS allows `http://localhost:3000` and `http://127.0.0.1:3000` by default.
- Additional CORS origins can be configured with `BACKEND_CORS_ORIGINS`.
- CUDA/PyTorch dependencies are optional under the `cuda` extra because the MVP backend tests do not require them.

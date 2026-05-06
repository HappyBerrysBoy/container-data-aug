from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import augmentation_tasks, health, projects
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.repositories.json_store import JsonStore
from app.services.augmentation_service import AugmentationService
from app.services.project_service import ProjectService


def create_app(
    *,
    state_file: Path | None = None,
    run_background_tasks: bool = True,
) -> FastAPI:
    settings = get_settings()
    store = JsonStore(state_file or settings.state_file)
    store.initialize()

    project_service = ProjectService(store)
    augmentation_service = AugmentationService(store, project_service)
    augmentation_service.recover_stale_tasks()

    app = FastAPI(
        title="Container Image Augmentation API",
        version="0.1.0",
    )
    app.state.store = store
    app.state.project_service = project_service
    app.state.augmentation_service = augmentation_service
    app.state.run_background_tasks = run_background_tasks

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.parsed_cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)

    app.include_router(health.router, prefix="/api")
    app.include_router(projects.router, prefix="/api")
    app.include_router(augmentation_tasks.router, prefix="/api")

    return app


app = create_app()

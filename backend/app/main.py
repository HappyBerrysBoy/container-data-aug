from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import augmentation_tasks, health, local_folders, projects
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.repositories import tasks_repo
from app.repositories.postgres import PostgresDatabase
from app.services.augmentation_service import AugmentationService
from app.services.project_service import ProjectService


INIT_SQL_PATH = Path(__file__).resolve().parents[1] / "db" / "init.sql"


def _apply_schema(db: PostgresDatabase, init_sql_path: Path) -> None:
    sql = init_sql_path.read_text(encoding="utf-8")
    with db.connect() as conn:
        conn.execute(sql)


def _recover_stale_tasks(db: PostgresDatabase) -> None:
    with db.connect() as conn:
        tasks_repo.recover_stale(conn)


def create_app(
    *,
    db: PostgresDatabase | None = None,
    run_background_tasks: bool = True,
    init_sql_path: Path | None = None,
) -> FastAPI:
    settings = get_settings()
    if db is None:
        db = PostgresDatabase(database_url=settings.database_url)
    init_sql = init_sql_path or INIT_SQL_PATH

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        _apply_schema(db, init_sql)
        _recover_stale_tasks(db)
        yield

    project_service = ProjectService(db)
    augmentation_service = AugmentationService(db, project_service)

    app = FastAPI(
        title="Container Image Augmentation API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.db = db
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
    app.include_router(local_folders.router, prefix="/api")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

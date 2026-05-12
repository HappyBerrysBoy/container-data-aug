import os
import sys
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.repositories.postgres import PostgresDatabase  # noqa: E402


DEFAULT_DATABASE_URL = (
    "postgresql://myuser:mypassword@localhost:5432/mydatabase"
)


def _base_database_url() -> str:
    return os.environ.get("BACKEND_DATABASE_URL", DEFAULT_DATABASE_URL)


@pytest.fixture
def db() -> Iterator[PostgresDatabase]:
    """Yield a ``PostgresDatabase`` bound to a fresh per-test schema.

    Each test runs against a unique schema in the dev DB so test data
    cannot leak into ``public`` (per back-db-spec §11).
    """
    schema = f"test_{uuid.uuid4().hex[:12]}"
    base_url = _base_database_url()

    with psycopg.connect(base_url, autocommit=True) as setup_conn:
        setup_conn.execute(f'CREATE SCHEMA "{schema}"')

    database = PostgresDatabase(
        database_url=base_url, options=f"-c search_path={schema}"
    )
    try:
        yield database
    finally:
        with psycopg.connect(base_url, autocommit=True) as teardown_conn:
            teardown_conn.execute(f'DROP SCHEMA "{schema}" CASCADE')

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row


@dataclass(frozen=True)
class PostgresDatabase:
    database_url: str

    @contextmanager
    def connect(self) -> Iterator[psycopg.Connection]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            yield connection

    def ping(self) -> bool:
        with self.connect() as connection:
            connection.execute("SELECT 1").fetchone()
        return True

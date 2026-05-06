import json
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any


def default_state() -> dict[str, Any]:
    return {
        "nextProjectId": 1,
        "nextTaskId": 1,
        "projects": [],
        "tasks": [],
    }


class JsonStore:
    def __init__(self, state_file: Path) -> None:
        self.state_file = state_file
        self._lock = threading.RLock()

    def initialize(self) -> None:
        with self._lock:
            if self.state_file.exists():
                return

            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self._write_state(default_state())

    def read_state(self) -> dict[str, Any]:
        with self._lock:
            self.initialize()
            with self.state_file.open("r", encoding="utf-8") as file:
                return json.load(file)

    def replace_state(self, state: dict[str, Any]) -> None:
        with self._lock:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self._write_state(state)

    def mutate(self, mutator) -> Any:
        with self._lock:
            state = self.read_state()
            result = mutator(state)
            self.replace_state(state)
            return deepcopy(result)

    def _write_state(self, state: dict[str, Any]) -> None:
        temp_file = self.state_file.with_suffix(self.state_file.suffix + ".tmp")
        with temp_file.open("w", encoding="utf-8") as file:
            json.dump(state, file, ensure_ascii=False, indent=2)
        temp_file.replace(self.state_file)

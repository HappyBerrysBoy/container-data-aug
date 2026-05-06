import os
import sys
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault(
    "BACKEND_STATE_FILE",
    str(Path(tempfile.gettempdir()) / "container-data-aug-test-import-state.json"),
)

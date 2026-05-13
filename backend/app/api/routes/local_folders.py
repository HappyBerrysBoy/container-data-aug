import os
import platform
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter

from app.core.errors import ERROR_RESPONSES, ApiError
from app.schemas.local_folders import (
    FolderSelectionResponse,
    OpenFolderRequest,
    OpenFolderResponse,
)

router = APIRouter(prefix="/local-folders", tags=["local-folders"])


@router.post(
    "/select",
    response_model=FolderSelectionResponse,
    responses=ERROR_RESPONSES,
)
def select_folder() -> dict[str, str | None]:
    return {"path": _select_folder()}


@router.post(
    "/open",
    response_model=OpenFolderResponse,
    responses=ERROR_RESPONSES,
)
def open_folder(payload: OpenFolderRequest) -> dict[str, bool]:
    folder = Path(payload.path).expanduser()
    if not folder.exists() or not folder.is_dir():
        raise ApiError(
            "PATH_NOT_FOUND",
            "Folder does not exist",
            status_code=422,
            details={"path": str(folder)},
        )

    try:
        _open_folder(folder)
    except Exception as exc:
        raise ApiError(
            "FOLDER_OPEN_FAILED",
            "Could not open folder",
            status_code=500,
            details={"path": str(folder)},
        ) from exc

    return {"opened": True}


def _select_folder() -> str | None:
    if platform.system() == "Windows":
        return _select_folder_windows()
    return _select_folder_tk()


def _select_folder_windows() -> str | None:
    script = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "이미지 폴더를 선택하세요"
$dialog.ShowNewFolderButton = $false

$owner = New-Object System.Windows.Forms.Form
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Show()
$owner.Activate()

if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}

$dialog.Dispose()
$owner.Close()
$owner.Dispose()
"""
    try:
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-STA",
                "-Command",
                script,
            ],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as exc:
        raise ApiError(
            "FOLDER_DIALOG_UNAVAILABLE",
            "Folder picker is not available",
            status_code=500,
        ) from exc

    if result.returncode != 0:
        raise ApiError(
            "FOLDER_DIALOG_FAILED",
            "Folder picker failed",
            status_code=500,
            details={"stderr": result.stderr.strip()},
        )

    selected = result.stdout.strip()
    return selected or None


def _select_folder_tk() -> str | None:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="Select the source image folder")
        root.destroy()
    except Exception as exc:
        raise ApiError(
            "FOLDER_DIALOG_UNAVAILABLE",
            "Folder picker is not available",
            status_code=500,
        ) from exc

    return selected or None


def _open_folder(folder: Path) -> None:
    if sys.platform == "win32":
        os.startfile(str(folder))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(folder)])
    else:
        subprocess.Popen(["xdg-open", str(folder)])

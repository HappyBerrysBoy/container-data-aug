import os
from dataclasses import dataclass
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
LABEL_EXTENSIONS = {".txt", ".json", ".xml", ".csv"}


@dataclass(frozen=True)
class ImageFile:
    path: Path
    relative_path: Path
    size_bytes: int


@dataclass(frozen=True)
class FolderScan:
    image_files: list[ImageFile]
    file_count: int
    total_size_bytes: int
    has_labels: bool


def scan_folder(source_folder: Path) -> FolderScan:
    image_files: list[ImageFile] = []
    has_labels = False

    for root, dirnames, filenames in os.walk(source_folder, followlinks=False):
        root_path = Path(root)
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if not dirname.startswith(".") and not (root_path / dirname).is_symlink()
        ]

        for filename in filenames:
            if filename.startswith("."):
                continue

            file_path = root_path / filename
            if file_path.is_symlink() or not file_path.is_file():
                continue

            extension = file_path.suffix.lower()
            if extension in LABEL_EXTENSIONS:
                has_labels = True

            if extension not in IMAGE_EXTENSIONS:
                continue

            size_bytes = file_path.stat().st_size
            image_files.append(
                ImageFile(
                    path=file_path,
                    relative_path=file_path.relative_to(source_folder),
                    size_bytes=size_bytes,
                )
            )

    return FolderScan(
        image_files=image_files,
        file_count=len(image_files),
        total_size_bytes=sum(image.size_bytes for image in image_files),
        has_labels=has_labels,
    )

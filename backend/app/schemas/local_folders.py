from app.schemas.base import CamelModel


class FolderSelectionResponse(CamelModel):
    path: str | None


class OpenFolderRequest(CamelModel):
    path: str


class OpenFolderResponse(CamelModel):
    opened: bool

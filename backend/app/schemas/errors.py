from typing import Any

from pydantic import Field

from app.schemas.base import CamelModel


class ErrorDetail(CamelModel):
    code: str
    message: str
    details: Any = Field(default_factory=dict)


class ErrorResponse(CamelModel):
    error: ErrorDetail

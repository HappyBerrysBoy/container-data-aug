from typing import Literal

from app.schemas.base import CamelModel


RuntimeModelName = Literal["craft", "glm"]


class RuntimeModelPreparationResponse(CamelModel):
    model: RuntimeModelName
    status: Literal["READY"]

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.errors import ErrorResponse


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        details: Any | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details if details is not None else {}


def error_body(code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details if details is not None else {},
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR",
                "Invalid request",
                {"errors": exc.errors()},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code == 404:
            return JSONResponse(
                status_code=404,
                content=error_body("NOT_FOUND", "Resource not found"),
            )

        return JSONResponse(
            status_code=exc.status_code,
            content=error_body("HTTP_ERROR", str(exc.detail)),
        )


ERROR_RESPONSES = {
    404: {
        "model": ErrorResponse,
        "description": "Resource not found",
        "content": {
            "application/json": {
                "example": error_body("PROJECT_NOT_FOUND", "Project not found")
            }
        },
    },
    409: {
        "model": ErrorResponse,
        "description": "Conflict",
        "content": {
            "application/json": {
                "example": error_body(
                    "TASK_ALREADY_RUNNING", "An augmentation task is already running"
                )
            }
        },
    },
    422: {
        "model": ErrorResponse,
        "description": "Validation error",
        "content": {
            "application/json": {
                "example": error_body("VALIDATION_ERROR", "Invalid request")
            }
        },
    },
    500: {
        "model": ErrorResponse,
        "description": "Internal server error",
        "content": {
            "application/json": {
                "example": error_body("INTERNAL_SERVER_ERROR", "Internal server error")
            }
        },
    },
}

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=dict[str, str])
def health_check() -> dict[str, str]:
    return {"status": "ok"}

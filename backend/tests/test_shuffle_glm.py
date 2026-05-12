"""shuffle.py + Ollama GLM-OCR 통합 테스트.

pytest 실행:
    TEST_IMAGE_PATH=<path> uv run pytest tests/test_shuffle_glm.py -v -s

단독 스크립트 실행:
    uv run python tests/test_shuffle_glm.py <image_path> [output_dir]
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ── 공용 픽스처 ─────────────────────────────────────────────────────────────

@pytest.fixture
def image_path() -> Path:
    import os
    raw = os.environ.get("TEST_IMAGE_PATH", "")
    if not raw:
        pytest.skip("TEST_IMAGE_PATH 환경변수 필요")
    p = Path(raw)
    if not p.exists():
        pytest.skip(f"이미지 없음: {p}")
    return p


# ── 테스트 1: OCR 결과 형식 검증 ─────────────────────────────────────────────

def test_glm_reader_readtext(image_path):
    """CraftGlmReader.readtext()가 {"text", "bbox"} 형식을 반환하는지 검증."""
    import numpy as np
    from PIL import Image
    from app.augmentation.glm_ocr import get_craft_glm_reader

    reader = get_craft_glm_reader()
    img_array = np.array(Image.open(image_path).convert("RGB"))
    results = reader.readtext(img_array)

    print(f"\n[OCR] {len(results)}개 영역 감지:")
    for item in results:
        print(f"  text={item['text']!r:<15}  bbox={item['bbox']}")

    assert isinstance(results, list)
    for item in results:
        assert "text" in item
        assert "bbox" in item
        assert len(item["bbox"]) == 4
        assert isinstance(item["text"], str)


# ── 테스트 2: 전체 증강 파이프라인 ────────────────────────────────────────────

def test_shuffle_augment_with_glm(image_path, tmp_path):
    """Ollama GLM-OCR로 shuffle.augment() 전체 파이프라인 검증.

    ISO 6346 11자 감지 성공 시: C(4,2) × C(6,2) = 90장 증강 이미지 생성 확인.
    감지 실패 시: 경고만 출력하고 통과 (이미지 품질 또는 GLM 인식 문제).
    """
    from app.augmentation.glm_ocr import get_craft_glm_reader
    from app.augmentation.shuffle import augment

    reader = get_craft_glm_reader()
    output_dir = tmp_path / "augmented"

    print(f"\n[입력] {image_path}")
    saved = augment(image_path, output_dir, reader)

    print(f"[결과] 증강 이미지 {len(saved)}장 생성 (ISO 6346 정상이면 90장)")
    for p in saved[:5]:
        print(f"  {p.name}")
    if len(saved) > 5:
        print(f"  ... 외 {len(saved) - 5}장")

    if saved:
        assert len(saved) == 90, (
            f"C(4,2)×C(6,2) = 90 기대, {len(saved)} 생성 — "
            "OCR이 정확히 11자를 감지했는지 확인하세요"
        )
        for p in saved:
            assert p.exists()
            assert p.stat().st_size > 0
        print("[성공] 90장 모두 저장 확인")
    else:
        print(
            "[경고] 증강 이미지 없음 — GLM이 ISO 6346 11자(오너코드4+일련번호6+체크1)를 "
            "감지하지 못했습니다. 이미지와 OCR 결과를 확인하세요."
        )


# ── 단독 스크립트 실행 ─────────────────────────────────────────────────────

_DEFAULT_IMAGE = Path(r"C:\Users\Study\Desktop\code_crops\code_161612-부산98바5361-front-1775027775411.jpg")
_DEFAULT_COUNT = 5


def _run_standalone(image_path: Path, count: int = _DEFAULT_COUNT) -> None:
    import time

    from app.augmentation.glm_ocr import get_craft_glm_reader
    from app.augmentation.shuffle import augment

    reader = get_craft_glm_reader()
    output_dir = BACKEND_ROOT / "temp" / f"shuffle_glm_{int(time.time())}"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"이미지   : {image_path}")
    print(f"증강 횟수: {count}")
    print(f"출력 폴더: {output_dir}\n")

    saved = augment(image_path, output_dir, reader, count=count)
    print(f"[증강] {len(saved)}장 생성")
    if saved:
        print(f"출력 위치: {output_dir}")
        print(f"성공: ISO 6346 11자 감지 및 {count}가지 스왑 완료")
    else:
        print(
            "실패: 11자 감지 실패\n"
            "  → OCR 결과를 확인하고 이미지 품질을 개선하거나 "
            "GLM 프롬프트를 튜닝하세요"
        )


if __name__ == "__main__":
    img = Path(sys.argv[1]) if len(sys.argv) >= 2 else _DEFAULT_IMAGE
    count = int(sys.argv[2]) if len(sys.argv) >= 3 else _DEFAULT_COUNT

    if not img.exists():
        print(f"오류: 이미지 파일 없음 — {img}")
        sys.exit(1)

    try:
        _run_standalone(img, count)
    except Exception as e:
        import traceback
        print(f"\n오류 발생: {type(e).__name__}: {e}")
        traceback.print_exc()
        sys.exit(1)

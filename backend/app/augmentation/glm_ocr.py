"""Ollama GLM-OCR reader."""
from __future__ import annotations

import base64
import io
import json
import re
from functools import lru_cache

import numpy as np
from PIL import Image


def _is_iso6346_orientation(text: str) -> bool:
    """앞 4자가 영문, 다음 6자가 숫자이면 올바른 방향."""
    return len(text) >= 10 and text[:4].isalpha() and text[4:10].isdigit()


_FULL_PROMPT = """\
Read the container code in this image (4 letters + 6 digits + optional 1 check digit).

Return ONLY a JSON object, no explanation:
{"text": "<detected_code>"}"""

_CROP_PROMPT = """\
What single alphanumeric character (letter A-Z or digit 0-9) is shown in this image?
Reply with ONLY that one character, nothing else."""


class OllamaGlmReader:
    """Ollama GLM-OCR reader.

    사전 조건:
        ollama pull glm-ocr:q8_0
        ollama serve
    """

    def __init__(self, model: str = "glm-ocr:q8_0") -> None:
        self._model = model

    def _call_glm(self, image: np.ndarray) -> list[dict]:
        """GLM에 이미지 전송 후 파싱 결과 반환."""
        import ollama

        pil_img = Image.fromarray(image)
        img_w, img_h = pil_img.size

        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=95)
        b64 = base64.b64encode(buf.getvalue()).decode()

        response = ollama.chat(
            model=self._model,
            messages=[{"role": "user", "content": _FULL_PROMPT, "images": [b64]}],
        )

        content = response["message"]["content"]
        print(f"[GLM RAW] {content!r}")
        return _parse_response(content, img_w, img_h)

    def readtext(self, image: np.ndarray) -> list[dict]:
        """GLM-OCR 실행. 첫 글자가 숫자면 180° 회전 후 재시도.

        Returns:
            list of {"text": str, "bbox": [x1, y1, x2, y2]}
        """
        results = self._call_glm(image)

        full_text = "".join(re.sub(r"[^A-Z0-9]", "", r["text"].upper()) for r in results)
        if not _is_iso6346_orientation(full_text):
            print(f"[GLM] ISO 6346 형식 불일치(text={full_text!r}) → 180° 회전 후 재시도")
            img_h, img_w = image.shape[:2]
            rotated = np.rot90(image, 2)
            results = self._call_glm(rotated)
            results = [
                {**r, "bbox": [
                    img_w - r["bbox"][2],
                    img_h - r["bbox"][3],
                    img_w - r["bbox"][0],
                    img_h - r["bbox"][1],
                ]}
                for r in results
            ]

        _save_glm_debug(Image.fromarray(image), results)
        return results


def _save_glm_debug(pil_img: Image.Image, results: list[dict]) -> None:
    """GLM bbox를 빨간 박스로 표시한 디버그 이미지를 temp/glm_debug.jpg 로 저장."""
    from pathlib import Path
    from PIL import ImageDraw

    out_img = pil_img.copy()
    draw = ImageDraw.Draw(out_img)
    for item in results:
        x1, y1, x2, y2 = item["bbox"]
        draw.rectangle([x1, y1, x2, y2], outline="red", width=2)
        draw.text((x1, max(0, y1 - 12)), item["text"], fill="red")

    out = Path("temp/glm_debug.jpg")
    out.parent.mkdir(parents=True, exist_ok=True)
    out_img.save(out)
    print(f"[GLM DEBUG] {out.resolve()}")


def _parse_response(content: str, img_w: int, img_h: int) -> list[dict]:
    """GLM 응답 텍스트 → [{"text": str, "bbox": [x1, y1, x2, y2]}] 반환.

    GLM이 bbox 없이 {"text": "..."} 형태로만 반환한 경우
    이미지 전체를 bbox로 사용한다.
    """
    json_str = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    raw = json_str.group(1).strip() if json_str else content.strip()

    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        m = re.search(r'["\s]text["\s]*:\s*"([A-Za-z0-9 ]+)"', raw)
        if not m:
            return []
        text = re.sub(r"[^A-Z0-9]", "", m.group(1).upper())
        if not text:
            return []
        print(f"[GLM FALLBACK] JSON 파싱 실패 후 정규식 추출: {text!r}")
        return [{"text": text, "bbox": [0, 0, img_w, img_h]}]

    if isinstance(parsed, list):
        items = parsed
    elif isinstance(parsed, dict):
        items = [parsed]
    else:
        return []

    results = []
    for item in items:
        text = re.sub(r"[^A-Z0-9 ]", "", str(item.get("text", "")).upper()).strip()
        if not text:
            continue

        raw_bbox = item.get("bbox", [])
        if len(raw_bbox) == 4:
            try:
                x1, y1, x2, y2 = (float(v) for v in raw_bbox)
            except (TypeError, ValueError):
                x1, y1, x2, y2 = 0, 0, img_w, img_h
            if max(x1, y1, x2, y2) <= 1.0:
                x1, x2 = x1 * img_w, x2 * img_w
                y1, y2 = y1 * img_h, y2 * img_h
        else:
            x1, y1, x2, y2 = 0, 0, img_w, img_h

        results.append({
            "text": text,
            "bbox": [int(x1), int(y1), int(x2), int(y2)],
        })

    return results


@lru_cache(maxsize=1)
def get_ollama_glm_reader(model: str = "glm-ocr:q8_0") -> OllamaGlmReader:
    """OllamaGlmReader 생성 후 캐시."""
    return OllamaGlmReader(model=model)


class CraftGlmReader:
    """CRAFT(bbox 감지) + GLM(크롭별 문자 인식) 조합 리더.

    CRAFT로 글자 단위 bbox를 감지하고, 각 bbox를 크롭해 GLM으로 한 글자씩 인식합니다.
    첫 글자가 숫자면 180° 회전 후 재시도합니다.
    """

    def __init__(self, model: str = "glm-ocr:q8_0", cuda: bool = False) -> None:
        self._model = model
        self._cuda = cuda
        self._craft = None

    def _get_craft(self):
        if self._craft is None:
            import warnings
            warnings.filterwarnings("ignore", category=UserWarning, module="torchvision")
            import torchvision.models.vgg as _vgg
            if not hasattr(_vgg, "model_urls"):
                _vgg.model_urls = {
                    "vgg16_bn": "https://download.pytorch.org/models/vgg16_bn-6c64b313.pth",
                }
            from craft_text_detector import Craft
            self._craft = Craft(
                output_dir=None,
                crop_type="box",
                cuda=self._cuda,
                link_threshold=0.9,
                text_threshold=0.7,
                low_text=0.4,
            )
        return self._craft

    def _craft_boxes(self, image: np.ndarray, min_area: int = 5, padding: int = 6) -> list[list[int]]:
        """CRAFT region score map → connected components → 글자 단위 bbox."""
        import cv2

        craft = self._get_craft()
        try:
            result = craft.detect_text(image)
        except ValueError as e:
            print(f"[CRAFT] detect_text 오류 (inhomogeneous polys): {e}")
            return []

        heatmaps = result.get("heatmaps", {})
        region_score = heatmaps.get("text_score_heatmap")
        if region_score is None:
            print(f"[CRAFT] score map 없음. heatmap keys={list(heatmaps.keys())}")
            return []

        if region_score.ndim == 3:
            region_score = cv2.cvtColor(region_score, cv2.COLOR_BGR2GRAY)

        if region_score.dtype != np.float32 and region_score.max() > 1.0:
            region_score = region_score.astype(np.float32) / 255.0

        orig_h, orig_w = image.shape[:2]
        heatmap = (region_score * 255).astype(np.uint8)
        scale_x = orig_w / heatmap.shape[1]
        scale_y = orig_h / heatmap.shape[0]

        is_vertical = orig_h > orig_w

        def _extract_boxes(binary: np.ndarray) -> list[list[int]]:
            num_labels, _, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
            boxes = []
            for i in range(1, num_labels):
                x, y, w, h, area = stats[i]
                if area < min_area:
                    continue
                boxes.append([
                    max(0, int(x * scale_x) - padding),
                    max(0, int(y * scale_y) - padding),
                    min(orig_w, int((x + w) * scale_x) + padding),
                    min(orig_h, int((y + h) * scale_y) + padding),
                ])
            boxes.sort(key=lambda b: b[1] if is_vertical else b[0])
            return boxes

        best_boxes: list[list[int]] = []
        for thresh in [t / 10 for t in range(4, 10)]:
            _, binary = cv2.threshold(heatmap, int(thresh * 255), 255, cv2.THRESH_BINARY)
            boxes = _extract_boxes(binary)
            print(f"[CRAFT] thresh={thresh:.1f} → {len(boxes)}개 bbox")
            if len(boxes) in (10, 11):
                return boxes
            if 10 <= len(boxes) or (not best_boxes and boxes):
                best_boxes = boxes

        print(f"[CRAFT] 목표 개수 미달 → 가장 근접한 {len(best_boxes)}개 반환")
        return best_boxes

    def _save_debug(self, image: np.ndarray, boxes: list[list[int]], text: str) -> None:
        """bbox를 빨간 박스로 표시한 디버그 이미지를 temp/craft_debug.jpg 로 저장."""
        from pathlib import Path
        from PIL import ImageDraw

        pil = Image.fromarray(image)
        draw = ImageDraw.Draw(pil)
        for i, (bbox, ch) in enumerate(zip(boxes, text)):
            x1, y1, x2, y2 = bbox
            draw.rectangle([x1, y1, x2, y2], outline="red", width=2)
            draw.text((x1, max(0, y1 - 12)), f"{i}:{ch}", fill="red")

        out = Path("temp/craft_debug.jpg")
        out.parent.mkdir(parents=True, exist_ok=True)
        pil.save(out)
        print(f"[CRAFT DEBUG] {out.resolve()}")

    def _read_crop(self, crop: np.ndarray) -> str:
        """크롭 이미지 한 장을 GLM으로 인식해 단일 문자(A-Z0-9) 반환. 실패 시 ""."""
        import ollama

        buf = io.BytesIO()
        Image.fromarray(crop).save(buf, format="JPEG", quality=95)
        b64 = base64.b64encode(buf.getvalue()).decode()

        try:
            response = ollama.chat(
                model=self._model,
                messages=[{"role": "user", "content": _CROP_PROMPT, "images": [b64]}],
            )
            raw = response["message"]["content"].strip()
        except Exception as e:
            print(f"[GLM CROP] 오류: {e}")
            return ""

        ch = re.sub(r"[^A-Z0-9]", "", raw.upper())
        result = ch[0] if ch else ""
        print(f"[GLM CROP] raw={raw!r} → {result!r}")
        return result

    def _read_from(self, image: np.ndarray) -> list[dict]:
        """CRAFT bbox 감지 → 각 크롭 → GLM 인식."""
        craft_boxes = self._craft_boxes(image)
        if not craft_boxes:
            return []

        results = []
        for bbox in craft_boxes:
            x1, y1, x2, y2 = bbox
            crop = image[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            ch = self._read_crop(crop)
            if ch:
                results.append({"text": ch, "bbox": bbox})
        return results

    def _sort_iso6346(self, results: list[dict], is_vertical: bool) -> list[dict]:
        """4영문 + 7숫자이면 각각 위치 순 정렬 후 letters+digits 순으로 반환.
        조건 불일치 시 원본 순서 유지."""
        letters = [r for r in results if r["text"].isalpha()]
        digits  = [r for r in results if r["text"].isdigit()]
        if len(letters) == 4 and len(digits) == 7:
            key = lambda r: r["bbox"][1] if is_vertical else r["bbox"][0]
            letters.sort(key=key)
            digits.sort(key=key)
            return letters + digits
        return results

    def readtext(self, image: np.ndarray) -> list[dict]:
        """CRAFT bbox 크롭 → GLM 글자 인식.

        1) 4영문+7숫자 확인 → 각각 위치 순 정렬 후 연결 (2줄 이미지 대응)
        2) ISO 6346 형식 불일치 시 → 180° 회전 후 재시도
        """
        img_h, img_w = image.shape[:2]
        is_vertical = img_h > img_w

        results = self._read_from(image)
        results = self._sort_iso6346(results, is_vertical)

        full_text = "".join(r["text"] for r in results)
        if not _is_iso6346_orientation(full_text):
            print(f"[CRAFT+GLM] ISO 6346 형식 불일치(text={full_text!r}) → 180° 회전 후 재시도")
            rotated = np.rot90(image, 2)
            results = self._read_from(rotated)
            results = self._sort_iso6346(results, is_vertical)
            results = [
                {**r, "bbox": [
                    img_w - r["bbox"][2],
                    img_h - r["bbox"][3],
                    img_w - r["bbox"][0],
                    img_h - r["bbox"][1],
                ]}
                for r in results
            ]

        self._save_debug(image, [r["bbox"] for r in results],
                         "".join(r["text"] for r in results))
        return results


@lru_cache(maxsize=1)
def get_craft_glm_reader(model: str = "glm-ocr:q8_0", cuda: bool = False) -> CraftGlmReader:
    """CraftGlmReader 생성 후 캐시."""
    return CraftGlmReader(model=model, cuda=cuda)

"""CRAFT + Hugging Face Transformers GLM-OCR reader."""
from __future__ import annotations

import re
import warnings
from collections.abc import Mapping
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image


DEFAULT_GLM_MODEL_ID = "zai-org/GLM-OCR"


def _is_iso6346_orientation(text: str) -> bool:
    """앞 4자가 영문, 다음 6자가 숫자이면 올바른 방향."""
    return len(text) >= 10 and text[:4].isalpha() and text[4:10].isdigit()


_CROP_PROMPT = """\
What single alphanumeric character (letter A-Z or digit 0-9) is shown in this image?
Reply with ONLY that one character, nothing else."""


def _clean_single_character(raw: str) -> str:
    ch = re.sub(r"[^A-Z0-9]", "", raw.upper())
    return ch[0] if ch else ""


def _import_torch():
    import torch

    return torch


def _resolve_runtime_device(requested_device: str, torch_module: Any | None = None) -> str:
    torch = torch_module if torch_module is not None else _import_torch()
    requested = requested_device.strip().lower()
    if requested == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if requested.startswith("cuda") and not torch.cuda.is_available():
        warnings.warn(
            "CUDA was requested for GLM-OCR, but CUDA is not available. Falling back to CPU.",
            RuntimeWarning,
            stacklevel=2,
        )
        return "cpu"
    return requested_device


def _resolve_torch_dtype(torch_module: Any, dtype: str | Any) -> str | Any:
    if dtype == "auto" or not isinstance(dtype, str):
        return dtype
    return getattr(torch_module, dtype)


def _input_token_count(inputs: Any) -> int:
    input_ids = inputs["input_ids"] if isinstance(inputs, Mapping) else inputs.input_ids
    shape = getattr(input_ids, "shape", None)
    if shape is not None:
        return int(shape[-1])
    return len(input_ids[0]) if input_ids else 0


def _slice_generated_ids(generated_ids: Any, input_len: int) -> Any:
    try:
        return generated_ids[:, input_len:]
    except (TypeError, IndexError):
        return [row[input_len:] for row in generated_ids]


def _move_inputs_to_device(inputs: Any, device: str) -> Any:
    if hasattr(inputs, "to"):
        return inputs.to(device)
    if isinstance(inputs, Mapping):
        return {
            key: value.to(device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
    return inputs


class _TransformersGlmBackend:
    """Lazy-loaded Transformers GLM-OCR crop recognizer."""

    def __init__(
        self,
        *,
        model_id_or_path: str,
        device: str,
        dtype: str | Any,
        local_files_only: bool,
    ) -> None:
        self._model_id_or_path = model_id_or_path
        self._local_files_only = local_files_only
        self._torch = _import_torch()
        self._device = _resolve_runtime_device(device, self._torch)
        self._torch_dtype = _resolve_torch_dtype(self._torch, dtype)
        self._processor, self._model = self._load()

    @property
    def device(self) -> str:
        return self._device

    def _load(self):
        from transformers import AutoModelForImageTextToText, AutoProcessor

        processor = AutoProcessor.from_pretrained(
            self._model_id_or_path,
            local_files_only=self._local_files_only,
        )
        model = AutoModelForImageTextToText.from_pretrained(
            self._model_id_or_path,
            local_files_only=self._local_files_only,
            torch_dtype=self._torch_dtype,
        )
        model = model.to(self._device)
        model.eval()
        return processor, model

    def read_character(self, crop: Image.Image) -> str:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": crop},
                    {"type": "text", "text": _CROP_PROMPT},
                ],
            }
        ]
        inputs = self._processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        input_len = _input_token_count(inputs)
        inputs = _move_inputs_to_device(inputs, self._device)

        with self._torch.no_grad():
            generated_ids = self._model.generate(
                **inputs,
                do_sample=False,
                max_new_tokens=8,
            )

        generated_ids = _slice_generated_ids(generated_ids, input_len)
        decoded = self._processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )
        return _clean_single_character(decoded[0].strip() if decoded else "")


class CraftGlmReader:
    """CRAFT(bbox 감지) + Transformers GLM-OCR(크롭별 문자 인식) 조합 리더.

    CRAFT로 글자 단위 bbox를 감지하고, 각 bbox를 크롭해 GLM-OCR로 한 글자씩
    인식합니다. 첫 글자가 숫자면 180° 회전 후 재시도합니다.
    """

    def __init__(
        self,
        model_id_or_path: str = DEFAULT_GLM_MODEL_ID,
        device: str = "cuda",
        dtype: str | Any = "auto",
        local_files_only: bool = False,
    ) -> None:
        self._model_id_or_path = model_id_or_path
        self._device = device
        self._dtype = dtype
        self._local_files_only = local_files_only
        self._craft = None
        self._glm_backend: _TransformersGlmBackend | None = None
        self._runtime_device: str | None = None

    def _get_device(self) -> str:
        if self._runtime_device is None:
            self._runtime_device = _resolve_runtime_device(self._device)
        return self._runtime_device

    def _get_glm_backend(self) -> _TransformersGlmBackend:
        if self._glm_backend is None:
            self._glm_backend = _TransformersGlmBackend(
                model_id_or_path=self._model_id_or_path,
                device=self._get_device(),
                dtype=self._dtype,
                local_files_only=self._local_files_only,
            )
        return self._glm_backend

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
                cuda=self._get_device().startswith("cuda"),
                link_threshold=0.9,
                text_threshold=0.7,
                low_text=0.4,
            )
        return self._craft

    def prepare(self) -> None:
        """Load the runtime pieces so setup errors happen before image work."""
        self.prepare_craft()
        self.prepare_glm()

    def prepare_craft(self) -> None:
        """Load CRAFT text detection weights and runtime."""
        self._get_craft()

    def prepare_glm(self) -> None:
        """Load the GLM-OCR processor/model through Transformers."""
        self._get_glm_backend()

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
        """크롭 이미지 한 장을 GLM-OCR로 인식해 단일 문자(A-Z0-9) 반환."""
        backend = self._get_glm_backend()
        try:
            result = backend.read_character(Image.fromarray(crop).convert("RGB"))
        except Exception as e:
            print(f"[GLM CROP] 오류: {e}")
            return ""
        print(f"[GLM CROP] → {result!r}")
        return result

    def _read_from(self, image: np.ndarray) -> list[dict]:
        """CRAFT bbox 감지 → 각 크롭 → GLM-OCR 인식."""
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
        digits = [r for r in results if r["text"].isdigit()]
        if len(letters) == 4 and len(digits) == 7:
            key = lambda r: r["bbox"][1] if is_vertical else r["bbox"][0]
            letters.sort(key=key)
            digits.sort(key=key)
            return letters + digits
        return results

    def readtext(self, image: np.ndarray) -> list[dict]:
        """CRAFT bbox 크롭 → GLM-OCR 글자 인식.

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
def get_craft_glm_reader(
    model_id_or_path: str = DEFAULT_GLM_MODEL_ID,
    device: str = "cuda",
    dtype: str | Any = "auto",
    local_files_only: bool = False,
) -> CraftGlmReader:
    """CraftGlmReader 생성 후 캐시."""
    return CraftGlmReader(
        model_id_or_path=model_id_or_path,
        device=device,
        dtype=dtype,
        local_files_only=local_files_only,
    )

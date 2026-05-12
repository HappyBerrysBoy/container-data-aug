from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class CharBox:
    x: int
    y: int
    w: int
    h: int

    @property
    def crop_box(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.x + self.w, self.y + self.h)


@dataclass(frozen=True)
class PartBox:
    """ISO 6346 파트 하나를 감싸는 bbox."""
    x: int
    y: int
    w: int
    h: int

    @property
    def crop_box(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.x + self.w, self.y + self.h)


# ISO 6346: 오너코드(4) + 일련번호(6) + 체크디지트(1) = 총 11자
_ISO_6346_PART_SIZES = (4, 6, 1)
_ISO_6346_TOTAL = sum(_ISO_6346_PART_SIZES)


def _run_ocr(image: Image.Image, reader) -> tuple[list[CharBox], str]:
    """GLM OCR 실행 → (CharBox 리스트, 인식된 전체 영숫자 문자열) 반환.

    이미지 H/W 비율로 가로/세로를 감지해 정렬 기준을 결정합니다.
    각 텍스트 영역은 글자 수로 균등 분할해 CharBox를 생성합니다.
    """
    results = reader.readtext(np.array(image))

    img_w, img_h = image.size
    vertical = img_h > img_w

    print(f"[OCR BOXES] {len(results)}개: {[(r['text'], r['bbox']) for r in results]}")

    char_items: list[tuple[CharBox, str]] = []

    for item in results:
        clean = re.sub(r"[^A-Z0-9]", "", item["text"].upper())
        if not clean:
            continue

        x1, y1, x2, y2 = item["bbox"]

        if len(clean) == 1:
            char_items.append((CharBox(x=x1, y=y1, w=x2 - x1, h=y2 - y1), clean))
        elif vertical:
            char_h = (y2 - y1) // len(clean)
            for i, ch in enumerate(clean):
                char_items.append((CharBox(x=x1, y=y1 + i * char_h, w=x2 - x1, h=char_h), ch))
        else:
            char_w = (x2 - x1) // len(clean)
            for i, ch in enumerate(clean):
                char_items.append((CharBox(x=x1 + i * char_w, y=y1, w=char_w, h=y2 - y1), ch))


    chars = [c for c, _ in char_items]
    full_text = "".join(ch for _, ch in char_items)

    return chars, full_text


def detect_characters(image: Image.Image, reader) -> tuple[list[CharBox], str, Image.Image]:
    """OCR로 글자 bbox 검출. (chars, text, used_image) 반환."""
    chars, text = _run_ocr(image, reader)
    print(f"[OCR] text={text!r}")
    return chars, text, image


def group_into_parts(chars: list[CharBox]) -> list[PartBox] | None:
    """검출된 글자들을 ISO 6346 파트로 묶어 PartBox 리스트 반환.

    11자: 3파트(4+6+1), 10자: 2파트(4+6 — 체크디지트 누락 허용).
    그 외 글자 수이면 None 반환.
    """
    if len(chars) == _ISO_6346_TOTAL:
        part_sizes = _ISO_6346_PART_SIZES           # (4, 6, 1)
    elif len(chars) == _ISO_6346_TOTAL - 1:         # 10자: 체크디지트 누락
        part_sizes = _ISO_6346_PART_SIZES[:2]       # (4, 6)
    else:
        return None

    parts: list[PartBox] = []
    idx = 0
    for count in part_sizes:
        group = chars[idx: idx + count]
        idx += count
        x = group[0].x
        y = min(c.y for c in group)
        right = group[-1].x + group[-1].w
        bottom = max(c.y + c.h for c in group)
        parts.append(PartBox(x=x, y=y, w=right - x, h=bottom - y))

    return parts



def _make_global_mask(image: Image.Image) -> Image.Image:
    """전체 이미지에 Otsu 이진화 → 배경=0, 글자=255."""
    import cv2
    gray = np.array(image.convert("L"))
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # 배경은 항상 글자보다 넓음 → 255 픽셀이 더 많으면 255가 배경이므로 반전
    if np.sum(mask == 255) > np.sum(mask == 0):
        mask = 255 - mask
    return Image.fromarray(mask).convert("L")


def _extract_char_components(
    global_mask: Image.Image,
    chars: list[CharBox],
) -> list[tuple[np.ndarray, np.ndarray]]:
    """전체 이미지 기준 연결 성분 분석 → chars 순서대로 (abs_ys, abs_xs) 반환.

    CharBox 안에 픽셀이 가장 많이 겹치는 CC를 선택하고 CharBox 범위로 클리핑.
    """
    import cv2
    mask_arr = np.array(global_mask)
    num_labels, labels, _, _ = cv2.connectedComponentsWithStats(mask_arr, connectivity=8)

    H, W = mask_arr.shape[:2]
    result: list[tuple[np.ndarray, np.ndarray]] = []
    for char in chars:
        x1, y1, x2, y2 = char.crop_box
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(W, x2), min(H, y2)
        if x1 >= x2 or y1 >= y2:
            result.append((np.array([], dtype=int), np.array([], dtype=int)))
            continue
        region = labels[y1:y2, x1:x2]
        best_overlap, best_comp = 0, None
        for comp_idx in range(1, num_labels):
            overlap = int((region == comp_idx).sum())
            if overlap > best_overlap:
                best_overlap, best_comp = overlap, comp_idx
        if best_comp is not None:
            ys, xs = np.where(labels == best_comp)
            in_box = (xs >= x1) & (xs < x2) & (ys >= y1) & (ys < y2)
            ys, xs = ys[in_box], xs[in_box]
        else:
            ys, xs = np.array([], dtype=int), np.array([], dtype=int)
        result.append((ys, xs))
    return result


def _make_cleared_image(
    image: Image.Image,
    global_mask: Image.Image,
    skip_indices: set[int],
    chars: list[CharBox],
) -> Image.Image:
    """CharBox 내 Otsu 픽셀 전체를 배경색으로 대체."""
    img_arr = np.array(image)
    mask_arr = np.array(global_mask)
    H, W = img_arr.shape[:2]
    clear_mask = np.zeros((H, W), dtype=np.uint8)

    for idx, char in enumerate(chars):
        if idx in skip_indices:
            continue
        x1, y1, x2, y2 = char.crop_box
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(W, x2), min(H, y2)
        if x1 >= x2 or y1 >= y2:
            continue
        region = mask_arr[y1:y2, x1:x2]
        clear_mask[y1:y2, x1:x2] = np.maximum(
            clear_mask[y1:y2, x1:x2],
            (region > 0).astype(np.uint8) * 255,
        )

    import cv2
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    clear_mask = cv2.dilate(clear_mask, kernel)

    bg_pixels = img_arr[clear_mask == 0]
    bg_color = tuple(int(np.median(bg_pixels[:, c])) for c in range(3)) if len(bg_pixels) else (255, 255, 255)

    cleared = image.copy()
    bg_layer = Image.new("RGB", image.size, bg_color)
    cleared.paste(bg_layer, mask=Image.fromarray(clear_mask).convert("L"))
    return cleared


def _move_component(
    out_arr: np.ndarray,
    img_arr: np.ndarray,
    src_ys: np.ndarray,
    src_xs: np.ndarray,
    src_box: tuple[int, int, int, int],
    dst_box: tuple[int, int, int, int],
) -> None:
    """src 성분 픽셀을 dst CharBox 중심으로 평행이동해 out_arr에 기록.

    이동 후 dst_box 범위 밖 픽셀은 무시.
    """
    if src_ys.size == 0:
        return
    sx1, sy1, sx2, sy2 = src_box
    dx1, dy1, dx2, dy2 = dst_box
    src_cy = (sy1 + sy2) // 2
    src_cx = (sx1 + sx2) // 2
    dst_cy = (dy1 + dy2) // 2
    dst_cx = (dx1 + dx2) // 2
    dy = dst_cy - src_cy
    dx = dst_cx - src_cx
    new_ys = src_ys + dy
    new_xs = src_xs + dx
    h, w = out_arr.shape[:2]
    valid = (
        (new_xs >= dx1) & (new_xs < dx2) &
        (new_ys >= dy1) & (new_ys < dy2) &
        (new_xs >= 0) & (new_xs < w) &
        (new_ys >= 0) & (new_ys < h)
    )
    out_arr[new_ys[valid], new_xs[valid]] = img_arr[src_ys[valid], src_xs[valid]]


def _save_otsu_debug(mask: Image.Image) -> None:
    """Otsu 이진화 마스크를 temp/char_extract_debug.jpg 로 저장."""
    out_path = Path("temp/char_extract_debug.jpg")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(out_path)
    print(f"[OTSU DEBUG] {out_path.resolve()}")


def _save_cleared_debug(cleared: Image.Image) -> None:
    """배경색만 남긴 복사본을 temp/cleared_debug.jpg 로 저장."""
    out_path = Path("temp/cleared_debug.jpg")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cleared.save(out_path)
    print(f"[CLEARED DEBUG] {out_path.resolve()}")


def _save_craft_on_otsu_debug(mask: Image.Image, chars: list[CharBox]) -> None:
    """Otsu 마스크에 CRAFT bbox와 순서 번호를 그려 temp/craft_on_otsu_debug.jpg 저장."""
    from PIL import ImageDraw, ImageFont
    out = mask.convert("RGB")
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.load_default(size=20)
    except TypeError:
        font = ImageFont.load_default()
    for idx, char in enumerate(chars):
        x1, y1, x2, y2 = char.crop_box
        draw.rectangle([x1, y1, x2, y2], outline="red", width=2)
        draw.text((x1 + 2, y1 + 2), str(idx), fill="yellow", font=font)
    out_path = Path("temp/craft_on_otsu_debug.jpg")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    print(f"[CRAFT ON OTSU] {out_path.resolve()}")



def augment(src: str | Path, dst_dir: Path, reader, count: int = 90) -> list[Path]:
    """ISO 6346 Part0×Part1 글자 쌍 스왑 조합으로 증강 이미지 생성.

    Part0 (오너코드 4자):  C(4,2) =  6가지 스왑
    Part1 (일련번호 6자):  C(6,2) = 15가지 스왑
    Part2 (체크디지트 1자): 스왑 불가
    조합: 6 × 15 = 90장 중 count장 생성 (1 ≤ count ≤ 90)

    반환값: 저장된 파일 경로 리스트. 검출 실패(글자 수 11 이외) 시 빈 리스트.
    """
    if not (1 <= count <= 90):
        raise ValueError(f"count는 1 이상 90 이하여야 합니다. (받은 값: {count})")
    src = Path(src)
    with Image.open(src) as raw:
        raw.load()
        image = raw.convert("RGB") if raw.mode != "RGB" else raw.copy()

    chars, ocr_text, _ = detect_characters(image, reader)

    if len(chars) != _ISO_6346_TOTAL:
        print(f"[SKIP] {len(chars)}개 감지 — 11개 필요, 증강 생략")
        return []

    if group_into_parts(chars) is None:
        return []

    dst_dir.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    suffix = src.suffix or ".jpg"

    part0_size = _ISO_6346_PART_SIZES[0]   # 4
    part1_start = part0_size                # 4
    part1_size = _ISO_6346_PART_SIZES[1]   # 6

    # 체크디지트 슬롯은 원본 유지, 나머지 글자 픽셀 전체를 배경색으로 제거
    skip_idx = {len(chars) - 1} if len(chars) == _ISO_6346_TOTAL else set()
    global_mask = _make_global_mask(image)
    components = _extract_char_components(global_mask, chars)
    cleared = _make_cleared_image(image, global_mask, skip_idx, chars)
    _save_otsu_debug(global_mask)
    _save_craft_on_otsu_debug(global_mask, chars)
    _save_cleared_debug(cleared)

    saved: list[Path] = []
    n = len(chars)
    labels: list[str] = ["filename,ocr_result," + ",".join(str(i) for i in range(n))]
    img_arr = np.array(image)
    seq = 1

    all_combos = [
        (i0, j0, i1, j1)
        for i0, j0 in combinations(range(part0_size), 2)
        for i1, j1 in combinations(range(part1_size), 2)
    ]

    for i0, j0, i1, j1 in all_combos[:count]:
        out_arr = np.array(cleared.copy())

        src_of = {
            i0: j0, j0: i0,
            part1_start + i1: part1_start + j1,
            part1_start + j1: part1_start + i1,
        }

        for dst_idx in range(n):
            if dst_idx in skip_idx:
                continue
            src_idx = src_of.get(dst_idx, dst_idx)
            src_ys, src_xs = components[src_idx]
            _move_component(out_arr, img_arr, src_ys, src_xs,
                            src_box=chars[src_idx].crop_box,
                            dst_box=chars[dst_idx].crop_box)

        out_name = f"{stem}_{seq}{suffix}"
        out_path = dst_dir / out_name
        Image.fromarray(out_arr).save(out_path)
        saved.append(out_path)

        mapping = [src_of.get(i, i) for i in range(n)]
        augmented_text = "".join(ocr_text[v] for v in mapping)
        labels.append(out_name + "," + augmented_text + "," + ",".join(str(v) for v in mapping))
        seq += 1

    label_path = dst_dir / f"{stem}_labels.csv"
    label_path.write_text("\n".join(labels), encoding="utf-8")
    print(f"[라벨] {label_path.resolve()}")
    return saved

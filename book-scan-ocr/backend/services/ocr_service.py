"""OCR service: EasyOCR-based text extraction supporting Korean, Traditional Chinese, and English.

EasyOCR language compatibility:
  'ch_tra' only works with 'en'.  'ko' only works with 'en'.

Strategy: run TWO readers, then merge:
  Reader A ['ch_tra', 'en'] → Traditional/Simplified Chinese
  Reader B ['ko',     'en'] → Korean (Hangul)

Merge priority (per overlapping bounding box):
  1. ko-reader result has Hangul  → prefer ko  (Korean text)
  2. ch_tra-reader result has CJK → prefer ch_tra (Chinese text)
  3. Otherwise                    → prefer higher confidence

Two-column detection:
  Cluster block X-centres into left / right groups by finding the largest gap
  in the sorted X-centre list.  Left column is output first, right column second.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, List, Optional, Tuple

from models.document import BBoxCoords, PageResult, TextBlock

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Character-class detectors
# ---------------------------------------------------------------------------

_HANGUL_RE = re.compile(r"[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]")

_CJK_RE = re.compile(
    r"[\u2E80-\u2EFF"
    r"\u3400-\u4DBF"
    r"\u4E00-\u9FFF"
    r"\uF900-\uFAFF"
    r"\U00020000-\U0002A6DF]+"
)


def _has_hangul(text: str) -> bool:
    return bool(_HANGUL_RE.search(text))


def _has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text))


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _bbox_iou(a: Tuple, b: Tuple) -> float:
    """IoU of two axis-aligned bboxes, each (x1,y1,x2,y2)."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0:
        return 0.0
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / union if union > 0 else 0.0


def _pts_to_xyxy(pts: List) -> Tuple[float, float, float, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------------------
# Two-column detection via X-centre gap
# ---------------------------------------------------------------------------

def _find_column_split(blocks: List[TextBlock], width: int) -> Optional[float]:
    """Return the x-coordinate that splits 2 columns, or None for single-column.

    Algorithm:
      1. Compute the X-centre of each block.
      2. Sort centres.
      3. Find the largest gap between consecutive centres.
      4. If the gap > min_gap_ratio * page_width AND it falls in the central
         20%–80% band, treat the page as 2-column.
      5. The split x = midpoint of the largest gap.
    """
    if len(blocks) < 4:            # too few blocks to judge
        return None

    min_gap_ratio = 0.08           # gap must be >= 8% of page width

    centres = sorted(
        (b.bbox.top_left[0] + b.bbox.top_right[0]) / 2.0
        for b in blocks
    )

    best_gap  = 0.0
    best_split = None

    for i in range(len(centres) - 1):
        gap = centres[i + 1] - centres[i]
        mid = (centres[i] + centres[i + 1]) / 2.0

        # Gap must be in the central band and larger than the minimum
        if gap > best_gap and width * 0.20 < mid < width * 0.80:
            best_gap  = gap
            best_split = mid

    if best_gap >= width * min_gap_ratio and best_split is not None:
        logger.debug(
            "2-column detected: split_x=%.1f  gap=%.1f  width=%d",
            best_split, best_gap, width,
        )
        return best_split

    return None          # single column


# ---------------------------------------------------------------------------
# OCR Service
# ---------------------------------------------------------------------------

class OCRService:
    """Dual EasyOCR reader: Korean + Traditional Chinese + English."""

    def __init__(
        self,
        lang: str = "korean",
        use_angle_cls: bool = True,
        use_gpu: bool = False,
    ) -> None:
        logger.info("Initializing EasyOCR dual-reader (gpu=%s)...", use_gpu)
        try:
            import easyocr

            self._reader_ch = easyocr.Reader(
                ["ch_tra", "en"],
                gpu=use_gpu,
                download_enabled=True,
                verbose=False,
            )
            logger.info("EasyOCR reader_A [ch_tra, en] ready")

            self._reader_ko = easyocr.Reader(
                ["ko", "en"],
                gpu=use_gpu,
                download_enabled=True,
                verbose=False,
            )
            logger.info("EasyOCR reader_B [ko, en] ready")

            self._initialized = True
        except Exception as e:
            logger.error("Failed to initialize EasyOCR: %s", e)
            self._initialized = False

    def reinitialize(
        self,
        lang: str = "korean",
        use_angle_cls: bool = True,
        use_gpu: bool = False,
    ) -> None:
        """Re-create EasyOCR readers with new settings (e.g. GPU toggle)."""
        logger.info("Re-initializing EasyOCR readers (gpu=%s)...", use_gpu)
        import easyocr
        try:
            self._reader_ch = easyocr.Reader(
                ["ch_tra", "en"],
                gpu=use_gpu,
                download_enabled=True,
                verbose=False,
            )
            self._reader_ko = easyocr.Reader(
                ["ko", "en"],
                gpu=use_gpu,
                download_enabled=True,
                verbose=False,
            )
            self._initialized = True
            logger.info("EasyOCR readers re-initialized successfully")
        except Exception as e:
            logger.error("Failed to re-initialize EasyOCR: %s", e)
            # keep old readers if possible? or mark as not initialized
            self._initialized = False

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def process_page(self, image_path: Path, page_number: int) -> PageResult:
        if not self._initialized:
            return PageResult(
                page_number=page_number, seq_number=page_number, width=0, height=0,
                status="failed", error="EasyOCR not initialized",
            )
        try:
            from PIL import Image as PILImage

            with PILImage.open(image_path) as img:
                width, height = img.size

            img_str = str(image_path)
            results_ch = self._reader_ch.readtext(img_str, detail=1, paragraph=False)
            results_ko = self._reader_ko.readtext(img_str, detail=1, paragraph=False)

            merged = self._merge(results_ch, results_ko)
            return self._parse_result(merged, page_number, width, height)

        except Exception as e:
            logger.error("OCR failed on page %d (%s): %s", page_number, image_path, e)
            return PageResult(
                page_number=page_number, seq_number=page_number, width=0, height=0,
                status="failed", error=str(e),
            )

    # ------------------------------------------------------------------
    # Merge
    # ------------------------------------------------------------------

    def _merge(
        self,
        results_ch: List[Any],
        results_ko: List[Any],
        iou_thr: float = 0.3,
    ) -> List[Any]:
        """
        Merge ch_tra and ko reader results.

        Per-block priority:
          1. ko result contains Hangul → PREFER KO   (correct Korean)
          2. ch result contains CJK   → PREFER CH    (correct Chinese)
          3. otherwise                → higher confidence wins
        """
        if not results_ch:
            return results_ko or []
        if not results_ko:
            return results_ch or []

        def enrich(results, src):
            out = []
            for item in results:
                pts, txt, conf = item
                if txt and txt.strip():
                    out.append((pts, txt.strip(), float(conf), src, _pts_to_xyxy(pts)))
            return out

        ech = enrich(results_ch, "ch")
        eko = enrich(results_ko, "ko")

        kept: List[Any] = []
        used_ko: set = set()

        for item_ch in ech:
            pts_ch, txt_ch, conf_ch, _, xyxy_ch = item_ch

            # Find best overlapping ko box
            best_iou, best_idx = 0.0, -1
            for i, item_ko in enumerate(eko):
                if i in used_ko:
                    continue
                iou = _bbox_iou(xyxy_ch, item_ko[4])
                if iou > best_iou:
                    best_iou, best_idx = iou, i

            if best_iou >= iou_thr and best_idx >= 0:
                item_ko = eko[best_idx]
                used_ko.add(best_idx)
                pts_ko, txt_ko, conf_ko = item_ko[0], item_ko[1], item_ko[2]

                # Priority rules
                if _has_hangul(txt_ko):
                    # Rule 1: ko found actual Korean → trust ko
                    kept.append((pts_ko, txt_ko, conf_ko))
                elif _has_cjk(txt_ch):
                    # Rule 2: ch found actual Chinese → trust ch
                    kept.append((pts_ch, txt_ch, conf_ch))
                elif conf_ko >= conf_ch:
                    kept.append((pts_ko, txt_ko, conf_ko))
                else:
                    kept.append((pts_ch, txt_ch, conf_ch))
            else:
                # No ko match — keep ch as-is
                kept.append((pts_ch, txt_ch, conf_ch))

        # Add unmatched ko results
        for i, item_ko in enumerate(eko):
            if i not in used_ko:
                kept.append((item_ko[0], item_ko[1], item_ko[2]))

        return kept

    # ------------------------------------------------------------------
    # Column-aware sorting
    # ------------------------------------------------------------------

    def _sort_blocks(self, blocks: List[TextBlock], width: int) -> List[TextBlock]:
        if not blocks:
            return []

        split_x = _find_column_split(blocks, width)

        def _row_sort(col: List[TextBlock]) -> List[TextBlock]:
            # Within each column: sort top-to-bottom (15 px y-grouping), then left-to-right
            return sorted(
                col,
                key=lambda b: (round(b.bbox.top_left[1] / 15), b.bbox.top_left[0]),
            )

        if split_x is None:
            # Single column
            logger.debug("Single-column layout detected")
            return _row_sort(blocks)

        left_col  = [b for b in blocks if b.bbox.top_left[0] <  split_x]
        right_col = [b for b in blocks if b.bbox.top_left[0] >= split_x]

        logger.debug(
            "2-column layout: split_x=%.1f  left=%d  right=%d",
            split_x, len(left_col), len(right_col),
        )

        # Entire left column first, then entire right column
        return _row_sort(left_col) + _row_sort(right_col)

    # ------------------------------------------------------------------
    # Parse raw EasyOCR output → PageResult
    # ------------------------------------------------------------------

    def _detect_printed_page_number(self, blocks: List[TextBlock], height: int) -> Optional[str]:
        """Look for a printed page number (top/bottom 12% of the page)."""
        if not blocks:
            return None

        candidates = []
        margin = height * 0.12  # Top/Bottom 12%
        
        # Regex for common page number formats: "123", "- 4 -", "Page 5", "iv"
        # Matches 1-6 digits, or roman numerals, maybe with prefixes/suffixes
        page_re = re.compile(r"^(?:(?:page|p\.)\s*)?([0-9ivx-]{1,6})(?:\s*[-])?$", re.I)

        for b in blocks:
            y = b.bbox.top_left[1]
            # Is it in the header or footer area?
            if y < margin or y > (height - margin):
                txt = b.text.strip()
                match = page_re.search(txt)
                if match:
                    val = match.group(1).strip()
                    if val:
                        # Weight candidates: prefer ones at the very edge or centered horizontally
                        # But for now, we'll take the most 'likely' numeric one
                        candidates.append((y, val, len(val)))

        if not candidates:
            return None

        # Prefer candidates at the bottom first (more common for books), then top
        # Sort by distance from nearest horizontal edge
        candidates.sort(key=lambda x: min(x[0], abs(height - x[0])))
        return candidates[0][1]

    # ------------------------------------------------------------------
    # Parse raw EasyOCR output → PageResult
    # ------------------------------------------------------------------

    def _parse_result(
        self,
        raw_results: List[Any],
        page_number: int,
        width: int,
        height: int,
    ) -> PageResult:
        all_blocks: List[TextBlock] = []

        for idx, item in enumerate(raw_results or [], start=1):
            try:
                pts, text, confidence = item
                if not text or not text.strip():
                    continue
                tl, tr, br, bl = pts
                all_blocks.append(TextBlock(
                    block_id=idx,
                    text=text.strip(),
                    confidence=round(float(confidence), 4),
                    bbox=BBoxCoords(
                        top_left    =[round(float(tl[0]),1), round(float(tl[1]),1)],
                        top_right   =[round(float(tr[0]),1), round(float(tr[1]),1)],
                        bottom_right=[round(float(br[0]),1), round(float(br[1]),1)],
                        bottom_left =[round(float(bl[0]),1), round(float(bl[1]),1)],
                    ),
                    line_number=idx,
                ))
            except Exception as e:
                logger.warning("Skipping malformed OCR line on page %d: %s", page_number, e)

        # Detect printed page number from detected blocks
        printed_page_val = self._detect_printed_page_number(all_blocks, height)
        # Use detected value if it seems like a number/roman, else use "n/a"
        effective_page_num = printed_page_val if printed_page_val else "n/a"

        sorted_blocks = self._sort_blocks(all_blocks, width)
        for idx, block in enumerate(sorted_blocks, start=1):
            block.line_number = idx

        full_text = "\n".join(b.text for b in sorted_blocks)
        confidences = [b.confidence for b in sorted_blocks]
        avg_confidence = (
            round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        )

        return PageResult(
            page_number=effective_page_num,
            seq_number=page_number,
            width=width,
            height=height,
            text_blocks=sorted_blocks,
            full_text=full_text,
            block_count=len(sorted_blocks),
            avg_confidence=avg_confidence,
            status="empty" if not sorted_blocks else "completed",
        )

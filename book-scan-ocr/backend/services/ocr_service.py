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

    def _detect_printed_page_number(self, blocks: List[TextBlock], height: int, width: int) -> Tuple[Optional[str], Optional[str], Optional[int], Set[int]]:
        """Look for a printed page number (top 15% / bottom 25% of the page).
        Returns: (detected_number, surrounding_title, best_block_id, set_of_used_block_ids)
        """
        if not blocks:
            return None, None, None, set()

        candidates = []
        v_margin_top = height * 0.15
        v_margin_bottom = height * 0.25 # Aggressive footer check
        h_edge_zone = width * 0.30
        
        pure_re = re.compile(r"^(?:(?:page|p\.)\s*)?[\(\[\-\s]*([0-9ivx]{1,6})[\)\s\]\-]*$", re.I)
        trailing_number_re = re.compile(r"(?:\s|[\(\[\-\.])[0-9]{1,6}$")
        leading_number_re  = re.compile(r"^[0-9]{1,6}(?:\s|[\(\[\-\.])")

        used_ids = set()

        for b in blocks:
            y_top = b.bbox.top_left[1]
            y_bottom = b.bbox.bottom_right[1]
            x_left = b.bbox.top_left[0]
            x_right = b.bbox.bottom_right[0]
            
            txt = b.text.strip()
            if not txt:
                continue

            in_header = y_top < v_margin_top
            in_footer = y_bottom > (height - v_margin_bottom)

            if in_header or in_footer:
                detected_val = None
                remaining_title = None
                is_pure = False
                strip_first_line = False   # True when number was found in first line only
                
                match_pure = pure_re.search(txt)
                if match_pure:
                    detected_val = match_pure.group(1).strip()
                    remaining_title = None
                    is_pure = True
                else:
                    match_trailing = trailing_number_re.search(txt)
                    if match_trailing:
                        full_match = match_trailing.group(0)
                        detected_val = full_match.strip(" ([-.])\t\n\r")
                        remaining_title = txt[:match_trailing.start()].strip(" ([-.])\t\n\r")
                    else:
                        match_leading = leading_number_re.search(txt)
                        if match_leading:
                            full_match = match_leading.group(0)
                            detected_val = full_match.strip(" ([-.])\t\n\r")
                            remaining_title = txt[match_leading.end():].strip(" ([-.])\t\n\r")

                # NEW: For header blocks, also try matching just the first line
                # This handles OCR-merged blocks like "제1-1장 서 론 5\n에서 정신의학과..."
                if in_header and not detected_val:
                    first_line = txt.split('\n')[0].strip()
                    if first_line and first_line != txt:
                        m = trailing_number_re.search(first_line)
                        if m:
                            detected_val = m.group(0).strip(" ([-.])\t\n\r")
                            remaining_title = first_line[:m.start()].strip(" ([-.])\t\n\r")
                            strip_first_line = True
                        else:
                            m2 = leading_number_re.search(first_line)
                            if m2:
                                detected_val = m2.group(0).strip(" ([-.])\t\n\r")
                                remaining_title = first_line[m2.end():].strip(" ([-.])\t\n\r")
                                strip_first_line = True

                # If purely numeric in footer area, always exclude from text even if not high score
                if in_footer and txt.isdigit() and 1 <= len(txt) <= 5:
                    used_ids.add(b.block_id)

                if detected_val and detected_val.isdigit():
                    score = 0
                    if is_pure: score += 10
                    if is_pure and (x_left > width * 0.4 and x_right < width * 0.6): score += 5
                    
                    is_far_left = x_left < h_edge_zone
                    is_far_right = x_right > (width - h_edge_zone)
                    if is_far_left or is_far_right: score += 5
                    if x_left < width * 0.1 or x_right > width * 0.9: score += 5
                    
                    if y_top < height * 0.05 or y_bottom > height * 0.95: score += 3
                    # Bonus for first-line header detection (title-style header)
                    if strip_first_line and remaining_title and len(remaining_title) > 3: score += 8
                    
                    if remaining_title:
                        remaining_title = re.sub(r'^(?:Page|P\.|p\.)\s*', '', remaining_title).strip()
                    
                    candidates.append({
                        'val': detected_val,
                        'title': remaining_title,
                        'score': score,
                        'used_id': b.block_id,
                        'strip_first_line': strip_first_line,
                        'y_top': y_top,
                        'x_left': x_left
                    })

        if not candidates:
            return None, None, None, None, used_ids

        candidates.sort(key=lambda x: (x['score'], -min(x['y_top'], abs(height - x['y_top']))), reverse=True)
        best = candidates[0]
        for c in candidates:
            if c['score'] >= 5:
                used_ids.add(c['used_id'])
        
        return best['val'], best['title'], best['used_id'], best.get('strip_first_line', False), used_ids

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

        # Detect printed page number and title from detected blocks
        printed_page_val, detected_title, best_block_id, best_strip_first_line, used_block_ids = self._detect_printed_page_number(all_blocks, height, width)
        
        # Use detected value if it seems like a number/roman, else use "n/a"
        effective_page_num = printed_page_val if printed_page_val else "n/a"

        sorted_blocks = self._sort_blocks(all_blocks, width)
        for idx, block in enumerate(sorted_blocks, start=1):
            block.line_number = idx

        # 1. Assembly and Primary Filter
        text_lines = []
        for b in sorted_blocks:
            if b.block_id == best_block_id:
                if best_strip_first_line:
                    # Header was in first line only — keep remaining lines (body content)
                    remaining_lines = b.text.split('\n')[1:]
                    body = '\n'.join(remaining_lines).strip()
                    if body:
                        text_lines.append(body)
                # In ALL other cases, skip the header block entirely from full_text
                # (page_title is stored in the dedicated field, not in full_text)
            elif b.block_id not in used_block_ids:
                text_lines.append(b.text)
        
        full_text = "\n".join(text_lines).strip()

        # 2. Secondary Filter: Remove trailing page number from full_text (MATCH ONLY)
        if effective_page_num != "n/a":
            # Log what we see at the tail for diagnosis
            tail = full_text[-100:] if len(full_text) > 100 else full_text
            logger.debug("[page_clean] effective_page=%s  tail repr=%r", effective_page_num, tail)

            # Step A: Line-by-line removal from the bottom
            ft_lines = full_text.split("\n")
            while ft_lines:
                # Strip only safe whitespace and common noise symbols — NO backslash
                bare = ft_lines[-1].strip(' \t\r\u00a0()[]{}"\'.,-\u2018\u2019\u201c\u201d\u300d\u300f\uff02')
                if bare == str(effective_page_num):
                    logger.debug("[page_clean] Popping trailing line: %r", ft_lines[-1])
                    ft_lines.pop()
                else:
                    break
            full_text = "\n".join(ft_lines).strip()

            # Step B: Inline removal — number appended to last content line
            # e.g. "... 扶正解表의 2" or '... 扶正解表의 2"'
            # NOTE: noise_pat must NOT be a raw string so \uXXXX escapes work correctly
            num_pat = re.escape(str(effective_page_num))
            noise_pat = '[\s\u00a0\"\u2018\u2019\u201c\u201d\u300d\u300f\uff02\'()\[\]\.\-]*'
            full_text = re.sub(
                '[\s\u00a0]+' + num_pat + noise_pat + '$',
                "",
                full_text,
                flags=re.UNICODE,
            ).rstrip()
        
        confidences = [b.confidence for b in sorted_blocks]
        avg_confidence = (
            round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        )

        return PageResult(
            page_number=effective_page_num,
            page_title=detected_title,
            seq_number=page_number,
            width=width,
            height=height,
            text_blocks=sorted_blocks,
            full_text=full_text,
            block_count=len(sorted_blocks),
            avg_confidence=avg_confidence,
            status="empty" if not sorted_blocks else "completed",
        )

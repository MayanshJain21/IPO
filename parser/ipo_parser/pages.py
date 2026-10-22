"""Page text and printed page labels, via PyMuPDF (fast: ~650 pages in under 2 s)."""

from __future__ import annotations

import re
from statistics import median

import pymupdf

from .model import Page

# A footer label is a lone number ("36") or lower-case roman numeral ("iv").
_LABEL = re.compile(r"^(\d{1,4}|[ivxlc]{1,7})$")
_FOOTER_BAND = 0.92  # bottom 8% of the page height


def footer_label(blocks: list[tuple], page_height: float) -> str | None:
    """Printed page number from a page's text blocks: the last lone number in the footer band.

    `blocks` are PyMuPDF text blocks: (x0, y0, x1, y1, text, block_no, block_type).
    """
    label = None
    for block in blocks:
        if block[1] < page_height * _FOOTER_BAND:
            continue
        text = block[4].strip()
        if _LABEL.match(text):
            label = text
    return label


def clean_text(text: str) -> str:
    """Normalises PDF text: the replacement char from odd fonts becomes a dash, spaces collapse."""
    text = text.replace("�", "–").replace(" ", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def extract_pages(doc: pymupdf.Document, page_numbers: list[int]) -> list[Page]:
    """`page_numbers` are 1-based physical pages."""
    out = []
    for n in page_numbers:
        p = doc[n - 1]
        label = footer_label(p.get_text("blocks"), p.rect.height)
        out.append(Page(page=n, label=label, text=clean_text(p.get_text())))
    return out


def printed_to_physical(pages: list[Page]) -> tuple[dict[int, int], int | None]:
    """Map printed page number → physical page, plus the typical offset between them.

    Front matter (cover, TOC) usually has no printed number, so physical 41 shows "36":
    offset 5. The offset fills gaps where a footer couldn't be read.
    """
    mapping: dict[int, int] = {}
    for p in pages:
        if p.label and p.label.isdigit():
            mapping.setdefault(int(p.label), p.page)
    offsets = [phys - printed for printed, phys in mapping.items()]
    return mapping, (round(median(offsets)) if offsets else None)

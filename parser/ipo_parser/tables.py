"""Tables via pdfplumber. Chosen over PyMuPDF's find_tables after comparing both on real
DRHPs: PyMuPDF garbled financial figures ("6,652.09" came out as "665209|, ."), pdfplumber
read them exactly, and was faster on a whole 651-page RHP (134 s vs 237 s).
"""

from __future__ import annotations

import re
from collections.abc import Callable

import pdfplumber

from .model import Table
from .text_tables import text_tables


def clean_rows(raw: list[list[str | None]]) -> list[list[str]]:
    """None → "", line breaks inside cells → spaces; drops empty rows and empty columns."""
    rows = [[re.sub(r"\s+", " ", c or "").strip() for c in row] for row in raw]
    rows = [r for r in rows if any(r)]
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    keep = [i for i in range(width) if any(r[i] for r in rows)]
    return [[r[i] for i in keep] for r in rows]


def heading_above(page: pdfplumber.page.Page, top: float, band: float = 40) -> str | None:
    """Last line of text in the band just above a table: usually its title.

    Uses the page's real edges (`page.bbox`): some PDFs' pages don't start at (0, 0) — one
    real addendum's page runs from (-1, 1) — and pdfplumber rejects a crop outside the page.
    """
    x0, y0, x1, _ = page.bbox
    if top <= y0 + 1:
        return None
    region = page.crop((x0, max(y0, top - band), x1, top))
    lines = [ln.strip() for ln in (region.extract_text() or "").splitlines() if ln.strip()]
    return lines[-1][:200] if lines else None


def extract_tables(
    pdf: pdfplumber.PDF,
    page_numbers: list[int],
    warn: Callable[[str], None],
) -> list[Table]:
    out: list[Table] = []
    for n in page_numbers:
        page = pdf.pages[n - 1]
        try:
            ruled: list[Table] = []
            found_rows = []  # (bbox, rows) of every ruled box, kept or not
            for found in page.find_tables():
                rows = clean_rows(found.extract())
                found_rows.append((found.bbox, rows))
                if len(rows) < 2 or len(rows[0]) < 2:
                    continue  # a box around a paragraph, not a table
                ruled.append(
                    Table(
                        page=n,
                        index=len(ruled),
                        heading=heading_above(page, found.bbox[1]),
                        bbox=[round(v, 1) for v in found.bbox],
                        rows=rows,
                    )
                )

            # Amount lines outside every ruled table: a borderless body (see text_tables.py).
            rebuilt, absorbed = text_tables(page, n, found_rows, start_index=len(ruled))
            if absorbed:  # the ruled table was only that body's header: drop the fragment
                ruled = [t for t in ruled if t.bbox != [round(v, 1) for v in absorbed]]
            for t in rebuilt:
                t.heading = heading_above(page, t.bbox[1])
            for i, t in enumerate(ruled + rebuilt):
                t.index = i
            out.extend(ruled + rebuilt)
        except Exception as err:  # one odd page shouldn't sink a 600-page document
            warn(f"tables on page {n}: {type(err).__name__}: {err}")
        finally:
            page.flush_cache()  # pdfplumber caches every character; free it page by page
    return out

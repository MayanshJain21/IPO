"""PDF → ParseResult. PyMuPDF for text, labels and outline; pdfplumber for tables."""

from __future__ import annotations

import sys
import time
from importlib.metadata import version

import pdfplumber
import pymupdf

from . import __version__
from .model import ParseResult
from .pages import extract_pages, printed_to_physical
from .sections import build_sections, find_toc_pages, parse_toc_text, sections_from_bookmarks
from .tables import extract_tables

MIN_SECTIONS = 5  # fewer than this from the TOC means we probably misread it


def parse_pdf(path: str, pages: list[int] | None = None, tables: bool = True) -> ParseResult:
    warnings: list[str] = []

    def warn(msg: str) -> None:
        warnings.append(msg)
        print(f"warning: {msg}", file=sys.stderr)

    timings: dict[str, int] = {}
    started = time.perf_counter()

    with pymupdf.open(path) as doc:
        page_count = doc.page_count
        # Labels and sections need every page; it's fast (~2 s for 650 pages).
        all_pages = extract_pages(doc, list(range(1, page_count + 1)))
        bookmarks = doc.get_toc(simple=True)
    timings["text"] = _ms(started)

    t = time.perf_counter()
    printed_map, offset = printed_to_physical(all_pages)
    toc_pages = find_toc_pages(all_pages)
    entries = parse_toc_text("\n".join(p.text for p in toc_pages))
    page_texts = {p.page: p.text for p in all_pages}
    sections = build_sections(entries, printed_map, offset, page_count, page_texts, warn)
    source = "toc"
    if len(sections) < MIN_SECTIONS:
        fallback = sections_from_bookmarks(bookmarks, page_count)
        if len(fallback) >= MIN_SECTIONS:
            sections, source = fallback, "bookmarks"
            warn(f"table of contents unreadable ({len(entries)} entries); used PDF bookmarks")
        else:
            sections, source = [], "none"
            warn("no usable table of contents or bookmarks: sections are empty")
    timings["sections"] = _ms(t)

    empty = [p.page for p in all_pages if len(p.text) < 30]
    if len(empty) > page_count * 0.2:
        warn(f"{len(empty)} of {page_count} pages have almost no text: scanned PDF? OCR needed")

    selected = pages or list(range(1, page_count + 1))
    selected = [n for n in selected if 1 <= n <= page_count]

    found_tables = []
    if tables:
        t = time.perf_counter()
        with pdfplumber.open(path) as pdf:
            found_tables = extract_tables(pdf, selected, warn)
        timings["tables"] = _ms(t)

    timings["total"] = _ms(started)
    wanted = set(selected)
    return ParseResult(
        pageCount=page_count,
        pages=[p for p in all_pages if p.page in wanted],
        sections=sections,
        sectionsSource=source,
        tables=found_tables,
        warnings=warnings,
        timingsMs=timings,
        parser={
            "name": "ipo-parser",
            "version": __version__,
            "pymupdf": version("pymupdf"),
            "pdfplumber": version("pdfplumber"),
        },
    )


def _ms(since: float) -> int:
    return round((time.perf_counter() - since) * 1000)

"""Sections from the printed Table of Contents (every DRHP has one: SEBI requires it).

PDF bookmarks are only a fallback: in our sample, half the filings had none and one had junk
("Restated Financial Statements.pdf", "2.1.").
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from .model import Page, Section

# "RISK FACTORS ............ 21": a title, dot leaders, a printed page number.
_ENTRY = re.compile(r"(?P<title>[^.]+?)\s*\.{4,}\s*(?P<page>\d{1,4})(?!\d)")
_PART = re.compile(r"^(SECTION\s+[IVXL]+)\b\s*[–:\-]?\s*(.*)$", re.I)
_TOC_HEADING = re.compile(r"^\s*(table of )?contents\s*$", re.I | re.M)


@dataclass
class TocEntry:
    title: str
    level: int
    part: str | None
    printed_page: int


def find_toc_pages(pages: list[Page], search_first: int = 25) -> list[Page]:
    """The TOC page plus any continuation pages (pages that are mostly dot-leader entries)."""
    for i, p in enumerate(pages[:search_first]):
        if _TOC_HEADING.search(p.text):
            toc = [p]
            for nxt in pages[i + 1 : i + 4]:
                if len(_ENTRY.findall(_joined(nxt.text))) >= 3:
                    toc.append(nxt)
                else:
                    break
            return toc
    return []


def _joined(text: str) -> str:
    """TOC text arrives broken into words across lines; join it into one line."""
    return re.sub(r"\s+", " ", text)


# A long part heading can lose its dot leaders: "…ARTICLES OF ASSOCIATION 413 SECTION IX: …".
# A number right before "SECTION <roman>" is that heading's page: give it its leaders back.
_BARE_PAGE_BEFORE_PART = re.compile(r"(?<=[A-Za-z)])\s+(\d{1,4})\s+(?=SECTION\s+[IVXL]+\b)")


def parse_toc_text(text: str) -> list[TocEntry]:
    entries = []
    joined = _BARE_PAGE_BEFORE_PART.sub(r" ..... \1 ", _joined(text))
    for m in _ENTRY.finditer(joined):
        title = m.group("title").strip(" –-:")
        # Drop anything before the heading on the first entry ("… TABLE OF CONTENTS SECTION I …").
        title = re.split(r"\b(?:table of )?contents\b", title, flags=re.I)[-1].strip(" –-:")
        if not re.search(r"[A-Za-z]{3}", title):
            continue
        part_match = _PART.match(title)
        if part_match:
            part = re.sub(r"\s+", " ", part_match.group(1)).upper()
            entries.append(TocEntry(part_match.group(2).strip() or part, 1, part, int(m.group("page"))))
        else:
            entries.append(TocEntry(title, 2, None, int(m.group("page"))))
    return entries


def _words(s: str) -> str:
    return " ".join(re.sub(r"[^a-z]+", " ", s.lower()).split())


def heading_on_page(title: str, page_text: str, chars: int = 600) -> bool:
    """True if the title's first words appear near the top of the page."""
    key = " ".join(_words(title).split()[:4])
    return bool(key) and key in _words(page_text[:chars])


def snap_to_heading(
    title: str, physical: int, page_texts: dict[int, str], window: int = 3
) -> int | None:
    """The nearest page within ±window whose top shows the title, or None if none does.

    Filings' own TOCs contain typos (Paras listed a section on printed page 174; it starts
    on 172), so we trust the page itself over the TOC when they disagree slightly.
    """
    for delta in sorted(range(-window, window + 1), key=abs):
        text = page_texts.get(physical + delta)
        if text is not None and heading_on_page(title, text):
            return physical + delta
    return None


def build_sections(
    entries: list[TocEntry],
    printed_map: dict[int, int],
    offset: int | None,
    page_count: int,
    page_texts: dict[int, str] | None = None,
    warn: Callable[[str], None] | None = None,
) -> list[Section]:
    """Printed TOC pages → physical page ranges. Each section ends where the next one starts.

    With `page_texts`, each start is checked against the page and snapped to the real heading
    when the TOC is off by a few pages.
    """
    starts: list[tuple[TocEntry, int]] = []
    for e in entries:
        physical = printed_map.get(e.printed_page)
        if physical is None and offset is not None:
            physical = e.printed_page + offset
        if physical is None or not 1 <= physical <= page_count:
            continue
        if page_texts is not None:
            snapped = snap_to_heading(e.title, physical, page_texts)
            if snapped is not None and snapped != physical:
                if warn:
                    warn(f'TOC puts "{e.title}" on pdf page {physical}; heading found on {snapped}')
                physical = snapped
        if starts and physical < starts[-1][1]:
            continue  # out of order: a misread entry
        starts.append((e, physical))

    sections = []
    for i, (e, start) in enumerate(starts):
        # A part ends where the next part starts; an entry ends where the next anything starts.
        later = [s for (o, s) in starts[i + 1 :] if e.level == 2 or o.level == 1]
        end = max(start, later[0] - 1) if later else page_count
        sections.append(Section(e.title, e.level, e.part, e.printed_page, start, end))
    return sections


def sections_from_bookmarks(toc: list[list], page_count: int) -> list[Section]:
    """PDF outline ([level, title, page]) → sections, top two levels only."""
    rows = [(lvl, t.strip(), p) for lvl, t, p in toc if lvl <= 2 and 1 <= p <= page_count]
    sections = []
    for i, (lvl, title, start) in enumerate(rows):
        later = [p for (l2, _, p) in rows[i + 1 :] if lvl == 2 or l2 == 1]
        end = max(start, later[0] - 1) if later else page_count
        part_match = _PART.match(title)
        part = part_match.group(1).upper() if part_match else None
        name = (part_match.group(2).strip() or title) if part_match else title
        sections.append(Section(name, lvl, part, None, start, end))
    return sections

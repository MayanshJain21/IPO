"""Output shape of the parser: the contract with the Node pipeline.

Two page numbers on purpose:
  page  = physical PDF page (1-based). Used for viewer links (#page=86) and citations.
  label = number printed in the page footer ("81"). What the DRHP's own text refers to.
JSON keys are camelCase because the consumer is TypeScript.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

SCHEMA_VERSION = 1


@dataclass
class Page:
    page: int
    label: str | None
    text: str


@dataclass
class Section:
    title: str
    level: int  # 1 = SECTION heading ("RISK FACTORS"), 2 = entry inside it
    part: str | None  # "SECTION II" for level-1 entries, else None
    printedPage: int | None
    pageStart: int
    pageEnd: int


@dataclass
class Table:
    page: int
    index: int  # position on the page, 0-based
    heading: str | None  # text just above the table, e.g. "Restated Statement of Assets…"
    bbox: list[float]  # x0, top, x1, bottom in PDF points
    rows: list[list[str]]
    # "lines": found from ruling lines (pdfplumber). "text": rebuilt from aligned words, for
    # borderless financial statements (label + one amount per period, right-aligned).
    strategy: str = "lines"


@dataclass
class ParseResult:
    pageCount: int
    pages: list[Page]
    sections: list[Section]
    sectionsSource: str  # "toc" | "bookmarks" | "none"
    tables: list[Table]
    warnings: list[str] = field(default_factory=list)
    timingsMs: dict[str, int] = field(default_factory=dict)
    parser: dict[str, str] = field(default_factory=dict)
    schemaVersion: int = SCHEMA_VERSION

    def to_dict(self) -> dict:
        return asdict(self)

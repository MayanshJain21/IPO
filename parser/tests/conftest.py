"""Builds a small DRHP-like PDF for end-to-end tests (real DRHPs are too big to commit).

Layout, mirroring what we found in real filings:
  pdf 1 cover, pdf 2 TABLE OF CONTENTS (no footer numbers on either)
  pdf 3..8 printed pages 1..6 (footer label = pdf page - 2)
  pdf 7 a financial table: ruled header, borderless body, right-aligned amounts
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest

FONT_SIZE = 10
COLUMNS = [50, 220, 300, 380, 460, 540]  # x edges of 5 columns: label | 4 amount columns
HEADER = ["Particulars", "Jun 30, 2026", "Mar 31, 2026", "Mar 31, 2025", "Mar 31, 2024"]
BODY = [
    ["Revenue from Operations", "537.26", "1,554.97", "1,060.99", "719.15"],
    ["Other Income", "6.20", "14.64", "4.65", "2.60"],
    ["Total Income", "543.46", "1,569.61", "1,065.64", "721.75"],
    ["Finance cost", "(19.03)", "(66.19)", "-", "(32.86)"],
]
TOC = """TABLE OF CONTENTS
SECTION I - GENERAL ................................ 1
DEFINITIONS AND ABBREVIATIONS ...................... 1
SECTION II - RISK FACTORS .......................... 3
SECTION III - FINANCIAL INFORMATION ................ 5
RESTATED FINANCIAL INFORMATION ..................... 5"""
# Heading printed at the top of each physical page
HEADINGS = {
    3: "SECTION I - GENERAL\nDEFINITIONS AND ABBREVIATIONS",
    5: "SECTION II - RISK FACTORS",
    7: "SECTION III - FINANCIAL INFORMATION\nRESTATED FINANCIAL INFORMATION",
}


def _right(page: pymupdf.Page, text: str, right_x: float, y: float) -> None:
    width = pymupdf.get_text_length(text, fontsize=FONT_SIZE)
    page.insert_text((right_x - 5 - width, y), text, fontsize=FONT_SIZE)


def build_sample_pdf(path: Path) -> Path:
    doc = pymupdf.open()
    for n in range(1, 9):
        page = doc.new_page(width=595, height=842)
        if n == 1:
            page.insert_text((50, 100), "DRAFT RED HERRING PROSPECTUS - SAMPLE LIMITED", fontsize=14)
        elif n == 2:
            page.insert_text((50, 80), TOC, fontsize=FONT_SIZE)
        else:
            page.insert_text((50, 60), HEADINGS.get(n, f"Body text of page {n}."), fontsize=12)
            page.insert_text((290, 820), str(n - 2), fontsize=9)  # footer: printed number
        if n == 7:
            # Ruled header: one row of boxes, like the filings that rule only the header
            for x0, x1 in zip(COLUMNS, COLUMNS[1:]):
                page.draw_rect(pymupdf.Rect(x0, 100, x1, 130), color=(0, 0, 0), width=0.6)
            for i, text in enumerate(HEADER):
                page.insert_text((COLUMNS[i] + 4, 119), text, fontsize=FONT_SIZE - 1)
            # Borderless body: label left, amounts right-aligned in each column
            y = 150
            for row in BODY:
                page.insert_text((COLUMNS[0] + 4, y), row[0], fontsize=FONT_SIZE)
                for i, amount in enumerate(row[1:], start=1):
                    _right(page, amount, COLUMNS[i + 1], y)
                y += 16
            # Prose with figures below the table: must NOT become a table row
            page.insert_text(
                (50, y + 30),
                "Revenue grew 46.56% from Rs. 1,060.99 million to Rs. 1,554.97 million in Fiscal 2026.",
                fontsize=FONT_SIZE,
            )
    doc.save(path)
    return path


@pytest.fixture(scope="session")
def sample_pdf(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return build_sample_pdf(tmp_path_factory.mktemp("pdf") / "sample-drhp.pdf")

# parser (Python)

The only Python in the project. Reads a DRHP/RHP PDF and prints its pages, sections and tables,
each with page numbers, as one JSON document. Runs offline on your laptop; never deployed.

## Setup

Uses [uv](https://docs.astral.sh/uv/), which installs the pinned Python (3.12, see
`.python-version`) and the locked dependencies (`uv.lock`) into `parser/.venv`:

```bash
cd parser
uv sync
```

From the repo root you can also use `npm run parse -- <pdf>` and `npm run test:parser`.

## Usage

```bash
uv run python -m ipo_parser drhp.pdf                    # everything (~1–2 min for 400–650 pages)
uv run python -m ipo_parser drhp.pdf --no-tables        # text + sections only (~2 s)
uv run python -m ipo_parser drhp.pdf --pages 80-95      # text + tables for those pages
uv run python -m ipo_parser drhp.pdf --out result.json  # write a file instead of stdout
```

## Contract with the Node pipeline

- **stdout**: exactly one JSON document, UTF-8. **stderr**: progress and warnings.
- **exit code**: 0 parsed, 1 failed (reason on stderr).

```jsonc
{
  "schemaVersion": 1,
  "pageCount": 651,
  "pages": [{ "page": 41, "label": "36", "text": "…" }],
  "sections": [
    { "title": "RISK FACTORS", "level": 1, "part": "SECTION II",
      "printedPage": 21, "pageStart": 26, "pageEnd": 82 }
  ],
  "sectionsSource": "toc",            // "toc" | "bookmarks" | "none"
  "tables": [
    { "page": 64, "index": 0, "heading": "(All amounts are in ₹ million…)",
      "bbox": [72.1, 104.0, 522.3, 662.0], "strategy": "text",
      "rows": [["Particulars", "As on June 30, 2026", "…"], ["(a) Revenue from Operations", "537.26", "…"]] }
  ],
  "warnings": ["TOC puts \"…\" on pdf page 179; heading found on 177"],
  "timingsMs": { "text": 1474, "sections": 19, "tables": 64597, "total": 66091 },
  "parser": { "name": "ipo-parser", "version": "0.1.0", "pymupdf": "2.0", "pdfplumber": "0.11.10" }
}
```

**Two page numbers.** `page` is the physical PDF page (use it for links: `#page=64`). `label` is
the number printed in the footer, which is what the filing's own text refers to ("see page 59").

## How it works

| Step | Library | Notes |
| --- | --- | --- |
| Page text + printed labels | PyMuPDF | ~650 pages in 2 s; label = lone number in the bottom 8% |
| Sections | PyMuPDF text | Printed Table of Contents → printed pages → physical pages via labels; each start snapped to the real heading (±3 pages); PDF bookmarks only as fallback |
| Ruled tables | pdfplumber | Chosen over PyMuPDF `find_tables`, which garbled figures ("6,652.09" → "665209\|, .") |
| Borderless tables | pdfplumber words | `text_tables.py`: label + right-aligned amounts per period; reuses a ruled header's cells |

## Tests

```bash
uv run pytest -q
```

`tests/conftest.py` generates a small DRHP-like PDF (cover, TOC, footers, ruled-header +
borderless-body table), so the end-to-end tests don't need real filings.

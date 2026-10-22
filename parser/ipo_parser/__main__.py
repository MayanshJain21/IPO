"""PDF parser CLI.

Contract with the Node pipeline: `python -m ipo_parser <pdf_path>` prints ONE JSON document
(see model.py) to stdout, UTF-8 encoded. Progress and warnings go to stderr so they never
corrupt the JSON. Exit code 0 = parsed, 1 = failed (message on stderr).

  python -m ipo_parser drhp.pdf                    # everything
  python -m ipo_parser drhp.pdf --pages 80-95      # text + tables for those pages only
  python -m ipo_parser drhp.pdf --no-tables        # fast: text and sections (~2 s)
  python -m ipo_parser drhp.pdf --out result.json  # write to a file instead of stdout
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from .parse import parse_pdf


def parse_page_ranges(spec: str) -> list[int]:
    """'1-3,10' → [1, 2, 3, 10]."""
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        lo, _, hi = part.partition("-")
        start, end = int(lo), int(hi or lo)
        if start < 1 or end < start:
            raise ValueError(f"bad page range: {part!r}")
        pages.update(range(start, end + 1))
    return sorted(pages)


def main() -> None:
    ap = argparse.ArgumentParser(prog="ipo_parser", description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf")
    ap.add_argument("--pages", help="physical pages, e.g. 1-20,86")
    ap.add_argument("--no-tables", action="store_true", help="skip table extraction")
    ap.add_argument("--out", help="write JSON here instead of stdout")
    args = ap.parse_args()

    # When run through npm, INIT_CWD is where the command was typed: resolve relative paths there.
    base = os.environ.get("INIT_CWD", os.getcwd())
    pdf = os.path.join(base, args.pdf)
    out = os.path.join(base, args.out) if args.out else None

    try:
        pages = parse_page_ranges(args.pages) if args.pages else None
        result = parse_pdf(pdf, pages=pages, tables=not args.no_tables)
    except Exception as err:
        print(f"error: {type(err).__name__}: {err}", file=sys.stderr)
        sys.exit(1)

    t = result.timingsMs
    print(
        f"parsed {result.pageCount} pages, {len(result.sections)} sections "
        f"({result.sectionsSource}), {len(result.tables)} tables in {t['total'] / 1000:.1f}s",
        file=sys.stderr,
    )

    payload = result.to_dict()
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    else:
        # Windows consoles default to cp1252, which can't encode "₹": force UTF-8.
        sys.stdout.reconfigure(encoding="utf-8")
        json.dump(payload, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

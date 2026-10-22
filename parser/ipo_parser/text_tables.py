"""Borderless financial tables, rebuilt from word positions.

Some merchant bankers rule only a table's header; the body (the numbers) has no lines, so
pdfplumber's line-based detection stops at the header. pdfplumber's own "text" strategy finds
the numbers but cuts labels mid-word. Financial statements are regular enough to rebuild
directly: each row is a label followed by one amount per period, and amounts are
right-aligned under their column.
"""

from __future__ import annotations

import re

import pdfplumber

from .model import Table

# An amount: has decimals or Indian/Western digit grouping; may be negative "(12.50)" or "-12.50",
# or a percentage "12.50%". Bare integers (note numbers "4", years "2026") are NOT amounts.
AMOUNT = re.compile(r"^\(?-?(\d{1,3}(,\d{2,3})+(\.\d{1,3})?|\d+\.\d{1,3})%?\)?%?$")
DASH = {"-", "–", "—"}  # "nil" placeholder in an amount column

MIN_AMOUNT_LINES = 4  # fewer amount lines than this isn't a table
LINE_TOLERANCE = 3  # points: words this close vertically are on the same line
ANCHOR_TOLERANCE = 12  # points: right edges this close belong to the same column


def _lines(words: list[dict]) -> list[list[dict]]:
    """Groups words into visual lines, top to bottom, each sorted left to right."""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _is_amount_line(line: list[dict]) -> bool:
    """A table row: at least two amounts, and nothing but amounts (or dashes) after the first.
    Prose with figures ("increased 19.21% from ₹ 11,443.93 million in Fiscal") keeps going
    with words after its amounts, so it doesn't qualify."""
    first = next((i for i, w in enumerate(line) if AMOUNT.match(w["text"])), None)
    if first is None:
        return False
    tail = line[first:]
    return sum(1 for w in tail if AMOUNT.match(w["text"])) >= 2 and all(
        AMOUNT.match(w["text"]) or w["text"] in DASH for w in tail
    )


def _anchors(lines: list[list[dict]]) -> list[tuple[float, float]]:
    """Columns as (right edge, centre). Amounts are right-aligned, so their right edges
    cluster tightly; the centre (right edge minus half a typical amount's width) is where a
    centred header sits."""
    amounts = sorted(
        (w for line in lines for w in line if AMOUNT.match(w["text"])), key=lambda w: w["x1"]
    )
    clusters: list[list[dict]] = []
    for w in amounts:
        if clusters and w["x1"] - clusters[-1][-1]["x1"] <= ANCHOR_TOLERANCE:
            clusters[-1].append(w)
        else:
            clusters.append([w])
    columns = []
    for c in clusters:
        if len(c) < 2:
            continue
        right = sum(w["x1"] for w in c) / len(c)
        widths = sorted(w["x1"] - w["x0"] for w in c)
        columns.append((right, right - widths[len(widths) // 2] / 2))
    return columns


def _nearest(points: list[float], x: float) -> int:
    return min(range(len(points)), key=lambda i: abs(points[i] - x))


def _row(
    line: list[dict], anchors: list[tuple[float, float]], first_value_x: float, header: bool = False
) -> list[str]:
    """[label, value per column]. Words left of the first value column form the label.
    Amounts go to the column whose right edge is nearest; header words (centred) to the
    column whose centre is nearest."""
    cells = [""] * (len(anchors) + 1)
    label = []
    for w in line:
        is_value = AMOUNT.match(w["text"]) or w["text"] in DASH
        if w["x1"] < first_value_x - ANCHOR_TOLERANCE * 2 and not is_value:
            label.append(w["text"])
        elif header:
            i = _nearest([c for _, c in anchors], (w["x0"] + w["x1"]) / 2) + 1
            cells[i] = f"{cells[i]} {w['text']}".strip()
        else:
            i = _nearest([r for r, _ in anchors], w["x1"]) + 1
            cells[i] = f"{cells[i]} {w['text']}".strip()
    cells[0] = " ".join(label)
    return cells


_CONNECTOR = re.compile(r"(&|,|-|\b(and|of|from|in|on|for|to|the|or|by|at))$", re.I)


def merge_wrapped(rows: list[list[str]]) -> list[list[str]]:
    """Joins labels that wrapped onto two lines.

    - a label ending in a connector ("Property, Plant &") continues on the next row;
    - a row of values with no label takes the label of an adjacent label-only row
      ("Profit before tax from" / values / "operations").
    """
    out: list[list[str]] = []
    i = 0
    while i < len(rows):
        row = list(rows[i])
        has_values = any(row[1:])
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        if not has_values and nxt is not None and _CONNECTOR.search(row[0]):
            rows[i + 1] = [f"{row[0]} {nxt[0]}".strip(), *nxt[1:]]
            i += 1
            continue
        if has_values and not row[0]:
            if out and out[-1][0] and not any(out[-1][1:]):
                row[0] = out.pop()[0]
            if nxt is not None and nxt[0] and not any(nxt[1:]):
                row[0] = f"{row[0]} {nxt[0]}".strip()
                i += 1
        out.append(row)
        i += 1
    return out


Box = tuple[float, float, float, float]


def _ruled_header(rows: list[list[str]], columns: int) -> tuple[list[str], list[list[str]]] | None:
    """Uses a ruled header's own cells when its columns match the amount columns.

    Ruled cells are split exactly by the drawn lines, so reading each column top to bottom
    gives clean titles ("As on June 30," + "2026"). Label-only rows inside the box
    ("ASSETS", "(A) Non-current assets") are really the first body rows: they're returned too.
    """
    if not rows or len(rows[0]) != columns:
        return None
    split = len(rows)
    for i, r in enumerate(rows):
        if not any(r[1:]):
            split = i
            break
    head, rest = rows[:split], rows[split:]
    header = [next((r[0] for r in head if r[0]), "")]
    header += [" ".join(r[c] for r in head if r[c]) for c in range(1, columns)]
    return header, rest


def text_tables(
    page: pdfplumber.page.Page,
    page_number: int,
    ruled: list[tuple[Box, list[list[str]]]],
    start_index: int,
) -> tuple[list[Table], Box | None]:
    """Rebuilds a borderless table from amount lines that no ruled table covers.

    `ruled` are (bbox, cleaned rows) of tables already found from ruling lines. A ruled header
    just above the amounts becomes this table's header ("ruled header, borderless body").
    Returns the rebuilt tables and the ruled header box it absorbed, if any.
    """
    words = page.extract_words(x_tolerance=1.5, y_tolerance=LINE_TOLERANCE)
    covered = [box for box, _ in ruled]

    def inside(w: dict, box: Box) -> bool:
        return box[1] - 1 <= w["top"] and w["bottom"] <= box[3] + 1

    loose = [w for w in words if not any(inside(w, b) for b in covered)]
    lines = _lines(loose)
    amount_idx = [i for i, ln in enumerate(lines) if _is_amount_line(ln)]
    if len(amount_idx) < MIN_AMOUNT_LINES:
        return [], None

    first, last = amount_idx[0], amount_idx[-1]
    anchors = _anchors(lines[first : last + 1])
    if len(anchors) < 2:
        return [], None

    # Header: a ruled header box ending just above the first amounts.
    first_top = lines[first][0]["top"]
    header_box = next((b for b in covered if 0 <= first_top - b[3] <= 30), None)

    # A wrapped label can sit a line above its amounts ("Net Profit before tax from" /
    # amounts / "operations"): pull label-only lines just above the first amounts into the body.
    start = first
    while start > 0 and first - start < 2:  # at most two wrapped label lines
        prev = lines[start - 1]
        gap = lines[start][0]["top"] - prev[0]["top"]
        below_header = header_box is None or prev[0]["top"] > header_box[3]
        if _is_amount_line(prev) or gap > 14 or not below_header:
            break
        start -= 1
    body = lines[start : last + 1]
    first_value_x = min(
        w["x0"] for ln in body for w in ln if AMOUNT.match(w["text"]) or w["text"] in DASH
    )

    body_top = body[0][0]["top"]
    if header_box:
        header_lines = _lines([w for w in words if inside(w, header_box)])
    else:  # up to 4 text lines just above the body
        header_lines = [
            ln for ln in lines[max(0, start - 4) : start] if body_top - ln[0]["top"] < 80
        ]

    lead: list[list[str]] = []
    from_ruled = header_box and _ruled_header(dict(ruled)[header_box], len(anchors) + 1)
    if from_ruled:
        header, lead = from_ruled
    else:  # place header words by position: centred titles go to the nearest column centre
        header = [""] * (len(anchors) + 1)
        for ln in header_lines:
            for i, cell in enumerate(_row(ln, anchors, first_value_x, header=True)):
                header[i] = f"{header[i]} {cell}".strip()

    rows = [header] if any(header) else []
    rows += merge_wrapped(lead + [_row(ln, anchors, first_value_x) for ln in body])

    top = header_box[1] if header_box else min(ln[0]["top"] for ln in (header_lines or body))
    bbox = [
        round(min(w["x0"] for ln in body for w in ln), 1),
        round(top, 1),
        round(max(w["x1"] for ln in body for w in ln), 1),
        round(max(w["bottom"] for w in body[-1]), 1),
    ]
    table = Table(
        page=page_number,
        index=start_index,
        heading=None,  # filled by the caller, which reads the line above the table
        bbox=bbox,
        rows=rows,
        strategy="text",
    )
    return [table], header_box

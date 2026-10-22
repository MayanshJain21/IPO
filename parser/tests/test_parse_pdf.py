"""End to end: a generated DRHP-like PDF through the whole parser and the CLI contract."""

import json
import subprocess
import sys

from ipo_parser.parse import parse_pdf

from .conftest import BODY, HEADER


def test_labels_sections_and_borderless_table(sample_pdf):
    r = parse_pdf(str(sample_pdf))

    assert r.pageCount == 8
    assert [p.label for p in r.pages] == [None, None, "1", "2", "3", "4", "5", "6"]

    assert r.sectionsSource == "toc"
    got = [(s.title, s.level, s.pageStart, s.pageEnd) for s in r.sections]
    assert got == [
        ("GENERAL", 1, 3, 4),
        ("DEFINITIONS AND ABBREVIATIONS", 2, 3, 4),
        ("RISK FACTORS", 1, 5, 6),
        ("FINANCIAL INFORMATION", 1, 7, 8),
        ("RESTATED FINANCIAL INFORMATION", 2, 7, 8),
    ]

    tables = [t for t in r.tables if t.page == 7]
    assert len(tables) == 1, "header fragment and body should be one table"
    t = tables[0]
    assert t.strategy == "text"
    assert t.rows == [HEADER, *BODY]  # prose with figures below is NOT a row


def test_cli_prints_utf8_json_to_stdout(sample_pdf):
    proc = subprocess.run(
        [sys.executable, "-m", "ipo_parser", str(sample_pdf), "--no-tables"],
        capture_output=True,
        check=True,
    )
    payload = json.loads(proc.stdout.decode("utf-8"))  # stdout is pure JSON
    assert payload["schemaVersion"] == 1
    assert payload["pageCount"] == 8
    assert payload["tables"] == []
    assert b"parsed 8 pages" in proc.stderr  # progress goes to stderr


def test_cli_fails_cleanly_on_a_missing_file(tmp_path):
    proc = subprocess.run(
        [sys.executable, "-m", "ipo_parser", str(tmp_path / "nope.pdf")], capture_output=True
    )
    assert proc.returncode == 1
    assert proc.stdout == b""
    assert b"error:" in proc.stderr

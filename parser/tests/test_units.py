"""Unit tests for the pure parts, using strings seen in real filings."""

from ipo_parser.__main__ import parse_page_ranges
from ipo_parser.model import Page
from ipo_parser.pages import footer_label, printed_to_physical
from ipo_parser.sections import TocEntry, build_sections, parse_toc_text, snap_to_heading
from ipo_parser.tables import clean_rows
from ipo_parser.text_tables import AMOUNT, _is_amount_line, merge_wrapped


# --- pages ---------------------------------------------------------------------------------
def test_footer_label_takes_the_lone_number_in_the_bottom_band():
    blocks = [
        (50, 60, 500, 80, "RISK FACTORS", 0, 0),
        (290, 790, 300, 800, "36", 1, 0),  # bottom band of an 842-pt page
    ]
    assert footer_label(blocks, 842) == "36"
    assert footer_label([(290, 790, 300, 800, "36 crore", 1, 0)], 842) is None
    assert footer_label([(50, 400, 60, 410, "36", 1, 0)], 842) is None  # not in the footer


def test_printed_to_physical_learns_the_front_matter_offset():
    pages = [Page(1, None, ""), Page(2, None, ""), Page(41, "36", ""), Page(42, "37", "")]
    mapping, offset = printed_to_physical(pages)
    assert mapping == {36: 41, 37: 42}
    assert offset == 5


# --- sections ------------------------------------------------------------------------------
PARAS_TOC = """TABLE OF CONTENTS
SECTION I �
GENERAL..............................................1
DEFINITIONS AND ABBREVIATIONS........................1
CERTAIN
CONVENTIONS,
CURRENCY
OF
PRESENTATION
..........................16
SECTION II
�
RISK FACTORS
.......................21"""


def test_toc_words_split_across_lines_are_joined():
    entries = parse_toc_text(PARAS_TOC.replace("�", "–"))
    assert [(e.title, e.level, e.part, e.printed_page) for e in entries] == [
        ("GENERAL", 1, "SECTION I", 1),
        ("DEFINITIONS AND ABBREVIATIONS", 2, None, 1),
        ("CERTAIN CONVENTIONS, CURRENCY OF PRESENTATION", 2, None, 16),
        ("RISK FACTORS", 1, "SECTION II", 21),
    ]


def test_long_part_heading_without_dot_leaders():
    # HD Fire / Paramotor: the page number of SECTION VIII has no leaders before it
    text = (
        "SECTION VIII: DESCRIPTION OF EQUITY SHARES AND TERMS OF THE ARTICLES OF ASSOCIATION 413 "
        "SECTION IX: OTHER INFORMATION ............ 443 "
        "MATERIAL CONTRACTS AND DOCUMENTS FOR INSPECTION .......... 443"
    )
    assert [(e.part, e.title, e.printed_page) for e in parse_toc_text(text)] == [
        ("SECTION VIII", "DESCRIPTION OF EQUITY SHARES AND TERMS OF THE ARTICLES OF ASSOCIATION", 413),
        ("SECTION IX", "OTHER INFORMATION", 443),
        (None, "MATERIAL CONTRACTS AND DOCUMENTS FOR INSPECTION", 443),
    ]


def test_sections_end_where_the_next_one_starts():
    entries = [
        TocEntry("GENERAL", 1, "SECTION I", 1),
        TocEntry("DEFINITIONS", 2, None, 1),
        TocEntry("FORWARD-LOOKING STATEMENTS", 2, None, 10),
        TocEntry("RISK FACTORS", 1, "SECTION II", 20),
    ]
    sections = build_sections(entries, printed_map={}, offset=5, page_count=100)
    assert [(s.title, s.pageStart, s.pageEnd) for s in sections] == [
        ("GENERAL", 6, 24),  # a part runs to the next part
        ("DEFINITIONS", 6, 14),  # an entry runs to the next entry
        ("FORWARD-LOOKING STATEMENTS", 15, 24),
        ("RISK FACTORS", 25, 100),
    ]


def test_snap_to_heading_corrects_a_toc_typo():
    # Paras: TOC said printed 174 (pdf 179); the heading is really on pdf 177
    pages = {
        177: "STATEMENT OF SPECIAL TAX BENEFITS To, The Board of Directors",
        178: "The contents of the enclosed Annexures",
        179: "Annexure I List of Direct and Indirect Tax Laws",
    }
    assert snap_to_heading("STATEMENT OF SPECIAL TAX BENEFITS", 179, pages) == 177
    assert snap_to_heading("SOMETHING ELSE ENTIRELY", 179, pages) is None


# --- tables --------------------------------------------------------------------------------
def test_clean_rows_drops_empty_rows_and_columns():
    raw = [["Particulars", None, "FY26\n(Audited)"], [None, None, None], ["Revenue", "", "1,554.97"]]
    assert clean_rows(raw) == [["Particulars", "FY26 (Audited)"], ["Revenue", "1,554.97"]]


def test_amount_pattern():
    for ok in ["1,554.97", "(66.19)", "-12.50", "719.15", "12.50%", "1,23,456"]:
        assert AMOUNT.match(ok), ok
    for not_amount in ["2026", "4", "31,", "Rs.", "FY26"]:
        assert not AMOUNT.match(not_amount), not_amount


def _words(*texts):
    return [{"text": t} for t in texts]


def test_amount_line_needs_amounts_at_the_end():
    assert _is_amount_line(_words("Total", "Income", "543.46", "1,569.61", "-"))
    # prose: words continue after the figures
    assert not _is_amount_line(_words("grew", "46.56%", "from", "1,060.99", "million"))
    assert not _is_amount_line(_words("Revenue", "1,554.97"))  # one amount isn't a row


def test_wrapped_labels_are_merged():
    rows = [
        ["(Profit)/Loss On Sale Of Property, Plant &", "", ""],
        ["Equipment", "0.22", "0.64"],
        ["Net Profit / (Loss) before tax from continuing", "", ""],
        ["", "(8.90)", "(188.84)"],
        ["operations", "", ""],
        ["II Expenses", "", ""],
    ]
    assert merge_wrapped(rows) == [
        ["(Profit)/Loss On Sale Of Property, Plant & Equipment", "0.22", "0.64"],
        ["Net Profit / (Loss) before tax from continuing operations", "(8.90)", "(188.84)"],
        ["II Expenses", "", ""],  # a heading stays a heading
    ]


def test_page_ranges():
    assert parse_page_ranges("1-3,10, 7") == [1, 2, 3, 7, 10]


def test_heading_above_respects_pages_that_do_not_start_at_zero(tmp_path):
    # A real addendum's page box ran from (-1, 1): cropping from x=0 used to raise ValueError.
    import pdfplumber
    import pymupdf

    from ipo_parser.tables import heading_above

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((60, 100), "Restated Statement of Profit and Loss", fontsize=10)
    page.set_mediabox(pymupdf.Rect(-1, 1, 599, 801))  # origin moved off (0, 0)
    path = tmp_path / "offset.pdf"
    doc.save(path)

    with pdfplumber.open(path) as pdf:
        p = pdf.pages[0]
        assert p.bbox[0] < 0  # the odd page box really is there
        assert heading_above(p, top=p.bbox[1] + 120) == "Restated Statement of Profit and Loss"

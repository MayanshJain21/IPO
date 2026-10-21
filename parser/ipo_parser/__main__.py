"""PDF parser CLI.

Contract with the Node pipeline: `python -m ipo_parser <pdf_path>` prints ONE JSON
document to stdout. Logs go to stderr so they never corrupt the JSON.
Real extraction (PyMuPDF + pdfplumber) arrives in commit #5.
"""

import json
import sys


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python -m ipo_parser <pdf_path>", file=sys.stderr)
        sys.exit(2)
    json.dump({"pdf": sys.argv[1], "pages": [], "tables": [], "status": "stub"}, sys.stdout)


if __name__ == "__main__":
    main()

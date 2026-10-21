# parser (Python)

The only Python in the project. Runs offline on your laptop; never deployed.

```bash
cd parser
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -e .
python -m ipo_parser path/to/drhp.pdf
```

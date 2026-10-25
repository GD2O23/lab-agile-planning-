"""Bundle the CPS 230 Companion into one self-contained offline HTML file.

Usage: python3 build.py [--data DIR] [--out FILE]
"""
import argparse
import datetime
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(HERE / "data"))
    parser.add_argument("--out", default=str(HERE / "dist" / "cps230.html"))
    args = parser.parse_args()

    data_dir = pathlib.Path(args.data)
    data = {
        "paragraphs": read_json(data_dir / "paragraphs.json"),
        "glossary": read_json(data_dir / "glossary.json"),
        "sources": read_json(HERE / "data" / "sources.json"),
        "synonyms": read_json(HERE / "data" / "synonyms.json"),
        "built": datetime.date.today().isoformat(),
    }

    page = (HERE / "src" / "index.html").read_text(encoding="utf-8")
    styles = (HERE / "src" / "styles.css").read_text(encoding="utf-8")
    app = (HERE / "src" / "app.js").read_text(encoding="utf-8")
    # Escape "</" so content text can never close the script tag.
    data_js = "window.CPS230_DATA = " + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + ";"

    page = page.replace("/*__STYLES__*/", styles)
    page = page.replace("/*__DATA__*/", data_js)
    page = page.replace("/*__APP__*/", app)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size / 1024:.1f} KB, {len(data['paragraphs'])} paragraphs)")


if __name__ == "__main__":
    main()

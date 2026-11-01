#!/usr/bin/env python3
"""Copy the static site and the data files into _site/ for GitHub Pages."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_site"


def stamp(name: str) -> str:
    digest = hashlib.sha256((ROOT / "site" / name).read_bytes()).hexdigest()[:10]
    return f"{name}?v={digest}"


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    (OUT / "data").mkdir()
    for name in ("styles.css", "app.js", "stats.js", "favicon.svg", ".nojekyll"):
        shutil.copy2(ROOT / "site" / name, OUT / name)
    html = (ROOT / "site" / "index.html").read_text()
    html = html.replace('href="styles.css"', f'href="{stamp("styles.css")}"')
    html = html.replace('src="stats.js"', f'src="{stamp("stats.js")}"')
    html = html.replace('src="app.js"', f'src="{stamp("app.js")}"')
    (OUT / "index.html").write_text(html)
    for name in ("games.csv", "decks.json", "players.json"):
        shutil.copy2(ROOT / "data" / name, OUT / "data" / name)
    print(OUT)


if __name__ == "__main__":
    main()

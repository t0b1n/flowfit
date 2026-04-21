"""Fetch a geometrygeeks.bike page and parse its geometry table to JSON.

Usage:
    python tools/scrape_geometrygeeks.py <url> [-o out.json]

Requires: playwright, beautifulsoup4. First-time setup:
    pip install playwright beautifulsoup4
    playwright install chromium
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


def _coerce(text: str) -> Any:
    s = text.strip()
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return s


def _render(url: str, timeout_ms: int = 30000, headless: bool = False) -> str:
    """Render the page and return HTML after the geometry data has loaded.

    geometrygeeks.bike gates its data behind an invisible reCAPTCHA. In pure
    headless mode the challenge does not auto-pass, so default to headed.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_function(
            "document.querySelectorAll('table.bike-geometry-table td.skeleton').length === 0",
            timeout=timeout_ms,
        )
        html = page.content()
        browser.close()
        return html


def parse(html: str, url: str = "") -> dict:
    soup = BeautifulSoup(html, "html.parser")
    # The page renders two `bike-geometry-table` tables — one with just the
    # metric-name column, one with the per-size data. Pick the data one.
    table = None
    for t in soup.select("table.bike-geometry-table"):
        first_row = t.find("tr")
        if first_row and len(first_row.find_all(["th", "td"])) > 1:
            table = t
            break
    if table is None:
        raise RuntimeError("geometry data table not found")

    rows = table.find_all("tr")
    header_cells = [c.get_text(strip=True) for c in rows[0].find_all(["th", "td"])]
    # First column is empty (metric-name column). Collapse duplicate size labels:
    # keep only the first occurrence of each label.
    kept_idx: list[int] = []
    sizes: list[str] = []
    for i, label in enumerate(header_cells[1:], start=1):
        if label and label not in sizes:
            kept_idx.append(i)
            sizes.append(label)

    geometry: dict[str, dict[str, Any]] = {}
    for r in rows[1:]:
        cells = r.find_all(["th", "td"])
        if not cells:
            continue
        metric = cells[0].get_text(strip=True)
        # Skip non-data rows (JS warning, "Add to Compare", etc.)
        if not metric or metric == "Add to Compare":
            continue
        if len(cells) < max(kept_idx) + 1:
            continue
        geometry[metric] = {
            size: _coerce(cells[idx].get_text(strip=True))
            for size, idx in zip(sizes, kept_idx)
        }

    slug = ""
    m = re.search(r"/bike/([^/]+)/?", url)
    if m:
        slug = m.group(1)

    return {"url": url, "bike": slug, "sizes": sizes, "geometry": geometry}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url")
    ap.add_argument("-o", "--output", help="write JSON here instead of stdout")
    args = ap.parse_args()

    html = _render(args.url)
    data = parse(html, args.url)
    out = json.dumps(data, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(out)
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

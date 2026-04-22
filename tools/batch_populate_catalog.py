"""Batch-populate web/src/frameCatalog.ts from reference_data/road_bikes.csv.

For each row with in_catalog=false, scrapes geometrygeeks.bike, generates a
TypeScript FrameModel entry, appends it to the catalog, and marks the CSV row done.

Usage:
    python tools/batch_populate_catalog.py [options]

Options:
    --csv PATH          Input CSV (default: reference_data/road_bikes.csv)
    --catalog PATH      Target TS file (default: web/src/frameCatalog.ts)
    --limit -n N        Max bikes to process this run
    --dry-run           Print generated TS to stdout; modify nothing
    --concurrency -c N  Parallel scrapes per batch (default: 2, max: 3)
    --output-dir -d DIR Cache raw JSON here; re-runs use cache to skip scraping
    --log-level LEVEL   DEBUG / INFO / WARNING / ERROR (default: INFO)
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))
from scrape_geometrygeeks import _render, parse  # noqa: E402

# ---------------------------------------------------------------------------
# Field mapping (source: tools/AGENTS.md)
# ---------------------------------------------------------------------------

GEOMETRY_FIELD_MAP: dict[str, str] = {
    "Stack": "stack",
    "Reach": "reach",
    "Head Angle": "head_angle_deg",
    "Seat Angle": "seat_angle_deg",
    "BB Drop": "bb_drop",
    "Chainstay": "chainstay_length",
    "Fork Length (A2C)": "fork_length",
    "Fork Rake / Offset": "fork_offset",
    "Seat Tube C-T": "seat_tube_ct",
    "Head Tube": "head_tube",
}

SIZE_FIELD_MAP: dict[str, str] = {
    "Wheelbase": "wheelbase",
    "Front Centre": "front_center",
    "Trail": "trail",
    "Top Tube (effective)": "top_tube_effective",
    "Standover": "standover",
    "BB Height": "bb_height",
}

REQUIRED_GEOMETRY_KEYS = frozenset(
    [
        "stack",
        "reach",
        "head_angle_deg",
        "seat_angle_deg",
        "bb_drop",
        "chainstay_length",
        "fork_length",
        "fork_offset",
    ]
)

# Optional geometry fields that live inside the geometry object
OPTIONAL_GEOMETRY_KEYS = frozenset(["seat_tube_ct", "head_tube"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_value(v) -> float | int | None:
    """Normalise a scraped cell value to a number, handling comma decimals."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        # Some locales use comma as decimal separator (e.g. "70,5")
        normalised = v.strip().replace(",", ".")
        try:
            f = float(normalised)
            return int(f) if f.is_integer() else f
        except ValueError:
            return None
    return None


def _fmt_number(v: int | float) -> str:
    if isinstance(v, int):
        return str(v)
    return f"{v:g}"


def _js_str(s: str) -> str:
    return json.dumps(s)


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def load_pending(csv_path: Path, limit: Optional[int]) -> list[dict]:
    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = [
            row
            for row in csv.DictReader(f)
            if row["in_catalog"].strip().lower() == "false"
        ]
    if limit is not None:
        rows = rows[:limit]
    return rows


def scrape_one(
    row: dict,
    output_dir: Optional[Path],
    logger: logging.Logger,
) -> dict:
    slug = row["geometrygeeks_slug"]
    url = f"https://geometrygeeks.bike/bike/{slug}/"

    if output_dir is not None:
        cache_file = output_dir / f"{slug}.json"
        if cache_file.exists():
            logger.info("[%s] Loading from cache", slug)
            return json.loads(cache_file.read_text(encoding="utf-8"))

    logger.info("[%s] Starting scrape: %s", slug, url)
    html = _render(url)
    data = parse(html, url)

    if output_dir is not None:
        cache_file.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        logger.debug("[%s] Cached to %s", slug, cache_file)

    return data


def build_ts_entry(
    row: dict,
    scraped: dict,
    logger: logging.Logger,
) -> Optional[str]:
    slug = row["geometrygeeks_slug"]
    sizes: list[str] = scraped["sizes"]
    geometry: dict[str, dict] = scraped["geometry"]

    size_blocks: list[str] = []
    for size in sizes:
        # Build geometry object for this size
        geo_lines: list[str] = []
        skip_size = False
        for src_key, ts_key in GEOMETRY_FIELD_MAP.items():
            v = _coerce_value(geometry.get(src_key, {}).get(size))
            if ts_key in REQUIRED_GEOMETRY_KEYS:
                if v is None:
                    logger.warning(
                        "[%s] Size %s missing required field %s — skipping size",
                        slug, size, ts_key,
                    )
                    skip_size = True
                    break
                geo_lines.append(f"          {ts_key}: {_fmt_number(v)}")
            elif ts_key in OPTIONAL_GEOMETRY_KEYS:
                if v is not None:
                    geo_lines.append(f"          {ts_key}: {_fmt_number(v)}")
        if skip_size:
            continue
        # wheel_radius is always the named constant
        geo_lines.append("          wheel_radius: defaultWheelRadius")

        geo_body = ",\n".join(geo_lines)
        geo_block = f"        geometry: {{\n{geo_body}\n        }}"

        # Build top-level size fields
        size_lines: list[str] = [f"        size: {_js_str(size)}", geo_block]
        for src_key, ts_key in SIZE_FIELD_MAP.items():
            v = _coerce_value(geometry.get(src_key, {}).get(size))
            if v is not None:
                size_lines.append(f"        {ts_key}: {_fmt_number(v)}")

        size_body = ",\n".join(size_lines)
        size_blocks.append(f"      {{\n{size_body}\n      }}")

    if not size_blocks:
        logger.error("[%s] No valid sizes — skipping entry entirely", slug)
        return None

    sizes_body = ",\n".join(size_blocks)
    source_url = f"https://geometrygeeks.bike/bike/{slug}/"

    lines = [
        "  {",
        f"    id: {_js_str(slug)},",
        f"    brand: {_js_str(row['brand'])},",
        f"    model: {_js_str(row['model'])},",
        f"    launch_year: {int(row['year'])},",
        f"    category: {_js_str(row['category'])},",
        '    popularity: "Auto-populated from geometrygeeks.bike.",',
        "    sources: [",
        f"      {_js_str(source_url)}",
        "    ],",
        "    sizes: [",
        sizes_body,
        "    ]",
        "  }",
    ]
    return "\n".join(lines)


def insert_into_catalog(catalog_path: Path, ts_block: str) -> None:
    content = catalog_path.read_text(encoding="utf-8")
    sentinel = "\n];"
    idx = content.rfind(sentinel)
    if idx == -1:
        raise RuntimeError(
            f"Could not locate FRAME_CATALOG closing ]; in {catalog_path}"
        )
    before = content[:idx].rstrip("\n")
    after = content[idx:]  # starts with \n];
    new_content = before + ",\n" + ts_block + "\n" + after

    tmp = catalog_path.with_suffix(".ts.tmp")
    tmp.write_text(new_content, encoding="utf-8")
    tmp.replace(catalog_path)


def mark_success(csv_path: Path, slug: str) -> None:
    with csv_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    for row in rows:
        if row["geometrygeeks_slug"] == slug:
            row["in_catalog"] = "true"
    tmp = csv_path.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(csv_path)


# ---------------------------------------------------------------------------
# Batch orchestration
# ---------------------------------------------------------------------------


def run_batch(args: argparse.Namespace) -> None:
    logger = logging.getLogger("batch")
    pending = load_pending(args.csv, args.limit)
    if not pending:
        logger.info("No pending bikes — nothing to do.")
        return

    catalog_path: Path = args.catalog
    n = args.concurrency
    batches = [pending[i : i + n] for i in range(0, len(pending), n)]
    logger.info(
        "Processing %d bike(s) in %d batch(es) of %d",
        len(pending), len(batches), n,
    )

    successes: list[str] = []
    failures: list[tuple[str, str]] = []

    for batch_idx, batch in enumerate(batches):
        if batch_idx > 0:
            sleep_s = random.uniform(10, 20)
            logger.info("Sleeping %.1fs between batches...", sleep_s)
            time.sleep(sleep_s)

        logger.info(
            "Batch %d/%d — %s",
            batch_idx + 1, len(batches),
            ", ".join(r["geometrygeeks_slug"] for r in batch),
        )

        # Map future → row so we can correlate results
        future_to_row: dict = {}

        with ThreadPoolExecutor(max_workers=n) as executor:
            for i, row in enumerate(batch):
                stagger = random.uniform(2, 10) * i

                def _task(r=row, delay=stagger):
                    if delay > 0:
                        time.sleep(delay)
                    return scrape_one(r, args.output_dir, logger)

                future_to_row[executor.submit(_task)] = row

            for future in as_completed(future_to_row):
                row = future_to_row[future]
                slug = row["geometrygeeks_slug"]
                t0 = time.monotonic()
                try:
                    scraped = future.result()
                    elapsed = time.monotonic() - t0
                    n_sizes = len(scraped.get("sizes", []))
                    logger.info(
                        "[%s] Scraped in %.1fs — %d size(s)", slug, elapsed, n_sizes
                    )

                    ts_block = build_ts_entry(row, scraped, logger)
                    if ts_block is None:
                        failures.append((slug, "no valid sizes"))
                        continue

                    if args.dry_run:
                        logger.info("[%s] [DRY RUN] Generated entry:", slug)
                        print(ts_block)
                    else:
                        logger.info("[%s] Inserting into catalog...", slug)
                        insert_into_catalog(catalog_path, ts_block)
                        mark_success(args.csv, slug)
                        logger.info("[%s] Done. CSV updated.", slug)

                    successes.append(slug)

                except Exception as exc:
                    logger.error("[%s] FAILED: %s", slug, exc)
                    failures.append((slug, str(exc)))

    logger.info(
        "Finished. %d succeeded, %d failed.", len(successes), len(failures)
    )
    for slug, reason in failures:
        logger.warning("  FAILED: %s — %s", slug, reason)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--csv",
        type=Path,
        default=Path("reference_data/road_bikes.csv"),
    )
    ap.add_argument(
        "--catalog",
        type=Path,
        default=Path("web/src/frameCatalog.ts"),
    )
    ap.add_argument("--limit", "-n", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--concurrency", "-c", type=int, default=2)
    ap.add_argument("--output-dir", "-d", type=Path, default=None, dest="output_dir")
    ap.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = ap.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)

    run_batch(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
extract_inputs.py  —  Extract per-period scenario inputs from a DAP Excel workbook.

Reads:
  Distribution   → per-SKU ACV % by period
  Product Group  → per-SKU, per-period pricing and promo inputs

Usage:
    cd "260528 - Scenario Planning"
    python packages/engine/extract_inputs.py "data/raw/DAP.xlsx"
    python packages/engine/extract_inputs.py "data/raw/DAP.xlsx" --output data/processed/inputs.json

Output JSON shape:
  {
    "skus": {
      "<sku_name>": {
        "velocity":                 float,
        "slotting_lump_sum":        float,
        "slotting_per_store":       float,
        "slotting_cases_per_store": float,
        "periods": {
          "P01": { acv_pct, base_price, gross_price, edlp_direct, ... all promo fields ..., cogs },
          ...
        }
      }
    }
  }

NOTE: Output contains client financial data — do not commit to git.
      Recommended: write to data/processed/ (gitignored).
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl not installed.  Run:  pip install openpyxl")

from extract_config import PERIODS, PERIOD_COL, _coerce, _num, _is_pg_sheet


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Per-period input rows from Product Group sheets (per_period=True in dap-reference.json)
PG_PERIOD_INPUTS = {
    # Everyday pricing
    "base_price":               {"row": 10},
    "gross_price":              {"row": 11},
    "edlp_direct":              {"row": 12},
    "price_impact_manual":      {"row": 13},
    "edlp_mcb_pct":             {"row": 25},
    "misc_impact_pct":          {"row": 31},
    # Promo slot 1
    "name_promo1":              {"row": 35},
    "price_promo1":             {"row": 36},
    "weeks_event_promo1":       {"row": 37},
    "scan_promo1":              {"row": 38},
    "fixed_promo1":             {"row": 39},
    "lift_promo1":              {"row": 40},
    "mcb_promo1_pct":           {"row": 51},
    "coupon_discount_promo1":   {"row": 55},
    "coupon_cost_promo1":       {"row": 56},
    "coupon_redemption_promo1": {"row": 57},
    "admin_promo1":             {"row": 58},
    "buyout_weeks_promo1":      {"row": 59},
    "buyout_amount_promo1":     {"row": 60},
    "brick_promo1":             {"row": 62},
    # Promo slot 2
    "name_promo2":              {"row": 66},
    "price_promo2":             {"row": 67},
    "weeks_event_promo2":       {"row": 68},
    "scan_promo2":              {"row": 69},
    "fixed_promo2":             {"row": 70},
    "lift_promo2":              {"row": 71},
    "mcb_promo2_pct":           {"row": 82},
    "coupon_discount_promo2":   {"row": 86},
    "coupon_cost_promo2":       {"row": 87},
    "coupon_redemption_promo2": {"row": 88},
    "admin_promo2":             {"row": 89},
    "buyout_weeks_promo2":      {"row": 90},
    "buyout_amount_promo2":     {"row": 91},
    "brick_promo2":             {"row": 93},
    # Cost
    "cogs":                     {"row": 147},
}

_DIST_COL_SKU_NAME       = 2   # B — Product Group name
_DIST_COL_VELOCITY       = 12  # L — Account Base Unit Velocity (units/store/week)
_DIST_COL_ACV_P01        = 16  # P = P01; Q=P02 … AA=P12 (stored as whole %, e.g. 99.52)
_DIST_COL_SLOT_LUMP      = 39  # AM — slotting lump sum
_DIST_COL_SLOT_PER_STORE = 40  # AN
_DIST_COL_SLOT_CASES     = 41  # AO
_DIST_DATA_START_ROW  = 7
_DIST_HEADER_KEYWORDS = {"SKU", "PRODUCT", "ITEM", "NAME", "GROUP", "DESCRIPTION"}


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

def extract_distribution_inputs(wb) -> dict:
    """Returns {sku_name: {velocity, acv_pct: {P01-P12: float}}}.

    ACV stored as whole % in Excel (e.g. 99.52); converted to decimal (0.9952).
    """
    ws = wb["Distribution"]
    skus = {}
    for row in ws.iter_rows(min_row=_DIST_DATA_START_ROW, values_only=False):
        cell_b = row[_DIST_COL_SKU_NAME - 1]
        raw = cell_b.value
        if not isinstance(raw, str) or not raw.strip():
            continue
        name = raw.strip()
        if any(kw in name.upper() for kw in _DIST_HEADER_KEYWORDS):
            continue
        r = cell_b.row
        get = lambda col: _num(ws.cell(row=r, column=col).value)
        acv = {}
        for i, p in enumerate(PERIODS):
            raw_acv = get(_DIST_COL_ACV_P01 + i)
            acv[p] = raw_acv / 100.0 if raw_acv is not None else None
        skus[name] = {
            "velocity":                 get(_DIST_COL_VELOCITY),
            "slotting_lump_sum":        get(_DIST_COL_SLOT_LUMP),
            "slotting_per_store":       get(_DIST_COL_SLOT_PER_STORE),
            "slotting_cases_per_store": get(_DIST_COL_SLOT_CASES),
            "acv_pct":                  acv,
        }
    return skus


def extract_pg_inputs(ws) -> dict:
    """Extract per-period scenario inputs from a PG sheet."""
    periods = {}
    for period, col in PERIOD_COL.items():
        period_data = {}
        for field, meta in PG_PERIOD_INPUTS.items():
            period_data[field] = _coerce(ws.cell(row=meta["row"], column=col).value)
        periods[period] = period_data
    return periods


# ---------------------------------------------------------------------------
# Top-level extract
# ---------------------------------------------------------------------------

def extract(excel_path: Path) -> dict:
    print(f"Loading {excel_path.name} ...", flush=True)
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)
    all_sheets = wb.sheetnames

    print("  [+] Distribution (velocity + ACV % by period)", flush=True)
    dist_inputs = extract_distribution_inputs(wb)
    print(f"      {len(dist_inputs)} SKU(s): {list(dist_inputs)}", flush=True)

    pg_names = [s for s in all_sheets if _is_pg_sheet(wb, s)]
    print(f"  [+] Product Group sheets ({len(pg_names)} found):", flush=True)

    skus = {}
    for name in pg_names:
        print(f"      - {name}", flush=True)
        periods = extract_pg_inputs(wb[name])
        dist = dist_inputs.get(name, {})
        acv = dist.get("acv_pct", {})
        for period in PERIODS:
            periods[period]["acv_pct"] = acv.get(period)
        skus[name] = {
            "velocity":                 dist.get("velocity"),
            "slotting_lump_sum":        dist.get("slotting_lump_sum"),
            "slotting_per_store":       dist.get("slotting_per_store"),
            "slotting_cases_per_store": dist.get("slotting_cases_per_store"),
            "periods":                  periods,
        }

    return {
        "_meta": {
            "source_file":     excel_path.name,
            "extracted_at":    datetime.now(timezone.utc).isoformat(),
            "pg_sheets_found": pg_names,
        },
        "skus": skus,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extract DAP per-period scenario inputs to JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Output file contains client data — do not commit to git.",
    )
    parser.add_argument("excel_path", help="Path to DAP .xlsx file")
    parser.add_argument(
        "--output", "-o",
        default="dap_inputs.json",
        help="Output JSON path (default: dap_inputs.json in CWD)",
    )
    args = parser.parse_args()

    path = Path(args.excel_path)
    if not path.exists():
        sys.exit(f"File not found: {path}")

    data = extract(path)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")

    n_skus = len(data["skus"])
    print(f"\nWrote {out}  ({out.stat().st_size:,} bytes)")
    print(f"  {n_skus} SKU(s)  |  {len(PERIODS)} periods each")


if __name__ == "__main__":
    main()

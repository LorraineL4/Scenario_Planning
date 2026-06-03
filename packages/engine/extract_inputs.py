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
        "current_inputs":           { base_price, gross_price, ... all promo fields ... },
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
_DIST_COL_ACV_CURRENT    = 14  # N — current account ACV % (prior-period base for P01 delta formula)
_DIST_COL_ACV_P01        = 16  # P = P01; Q=P02 … AA=P12 (stored as whole %, e.g. 99.52)
_DIST_COL_PROB_P01       = 74  # BV = P01 probability; BW=P02 … CG=P12 (BV-CH span P01-P13)
_DIST_COL_SLOT_LUMP      = 39  # AM — slotting lump sum
_DIST_COL_SLOT_PER_STORE = 40  # AN
_DIST_COL_SLOT_CASES     = 41  # AO
_DIST_DATA_START_ROW  = 7
_DIST_HEADER_KEYWORDS = {"SKU", "PRODUCT", "ITEM", "NAME", "GROUP", "DESCRIPTION"}

_PG_COL_CURRENT = 4  # D — current values column in PG sheets (before P01–P12 at E–P)


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

def extract_distribution_inputs(wb) -> dict:
    """Returns {pg_name: {velocity, acv_pct, effective_velocity_by_period, ...}}.

    The Distribution sheet is at item level — col B is the Product Group (PG) name,
    col D is the individual item name. One PG can have many items. The PG sheet
    aggregates them via SUMPRODUCT, so the effective per-store weekly rate is:

        effective_velocity[p] = SUM_items(velocity_i × effective_acv_i[p])

    effective_acv applies probability weighting to the incremental ACV change only:
        effective_acv[P01] = current_acv + (acv[P01] - current_acv) × prob[P01]
        effective_acv[p]   = acv[p-1]    + (acv[p]   - acv[p-1])   × prob[p]

    current_acv = col N; scenario acv = cols P–AA; per-period prob = cols BV–CG.
    ACV values stored as whole % in Excel (e.g. 99.52); converted to decimal (0.9952).
    """
    ws = wb["Distribution"]

    # Accumulate per PG: effective_velocity[p] += velocity_i × acv_pct_i[p]
    pg_effective: dict = {}   # pg_name → {P01-P12: float}
    pg_primary:   dict = {}   # pg_name → first non-zero row data (for velocity/acv UI fields)
    pg_slotting:  dict = {}   # pg_name → slotting (sum across items)

    for row in ws.iter_rows(min_row=_DIST_DATA_START_ROW, values_only=False):
        cell_b = row[_DIST_COL_SKU_NAME - 1]
        raw = cell_b.value
        if not isinstance(raw, str) or not raw.strip():
            continue
        name = raw.strip()
        if any(kw in name.upper() for kw in _DIST_HEADER_KEYWORDS):
            continue
        r = cell_b.row
        get = lambda col, _r=r: _num(ws.cell(row=_r, column=col).value)

        velocity    = get(_DIST_COL_VELOCITY) or 0.0
        current_acv = (get(_DIST_COL_ACV_CURRENT) or 0.0) / 100.0

        acv_pct = {}
        for i, p in enumerate(PERIODS):
            raw_acv = get(_DIST_COL_ACV_P01 + i)
            acv_pct[p] = (raw_acv / 100.0) if raw_acv is not None else 0.0

        prob = {}
        for i, p in enumerate(PERIODS):
            raw_prob = get(_DIST_COL_PROB_P01 + i)
            prob[p] = raw_prob if raw_prob is not None else 1.0

        # Effective ACV = prior weighted ACV + (raw ACV delta) × probability
        # Delta uses raw scenario ACV differences; base accumulates the weighted value.
        # effective_acv[p] = effective_acv[p-1] + (raw[p] - raw[p-1]) × prob[p]
        effective_acv = {}
        prev_weighted = current_acv
        prev_raw      = current_acv  # raw ACV[p-1]; col N for P01
        for p in PERIODS:
            effective_acv[p] = prev_weighted + (acv_pct[p] - prev_raw) * prob[p]
            prev_weighted = effective_acv[p]
            prev_raw      = acv_pct[p]

        # Accumulate SUMPRODUCT contribution for this item into the PG total
        if name not in pg_effective:
            pg_effective[name] = {p: 0.0 for p in PERIODS}
        for p in PERIODS:
            pg_effective[name][p] += velocity * effective_acv[p]

        # Keep slotting sum across all items in the PG
        slot = get(_DIST_COL_SLOT_LUMP) or 0.0
        pg_slotting[name] = pg_slotting.get(name, 0.0) + slot

        # Keep first non-zero item row for UI-facing velocity / acv_pct / probability fields
        if name not in pg_primary and velocity > 0:
            pg_primary[name] = {
                "velocity":                 velocity,
                "slotting_per_store":       get(_DIST_COL_SLOT_PER_STORE),
                "slotting_cases_per_store": get(_DIST_COL_SLOT_CASES),
                "acv_pct":                  {p: acv_pct[p] for p in PERIODS},
                "probability":              {p: prob[p] for p in PERIODS},
            }

    # Merge into final output
    pgs = {}
    for name in pg_effective:
        primary = pg_primary.get(name, {})
        pgs[name] = {
            "velocity":                   primary.get("velocity", 0.0),
            "slotting_lump_sum":          pg_slotting.get(name, 0.0),
            "slotting_per_store":         primary.get("slotting_per_store"),
            "slotting_cases_per_store":   primary.get("slotting_cases_per_store"),
            "acv_pct":                    primary.get("acv_pct", {p: 0.0 for p in PERIODS}),
            "probability":                primary.get("probability", {p: 1.0 for p in PERIODS}),
            # Pre-computed SUMPRODUCT baseline rate (per store per week) for this PG per period.
            # dist_baseline = effective_velocity[p] × number_of_stores
            "effective_velocity_by_period": pg_effective[name],
        }
    return pgs


def extract_pg_inputs(ws) -> dict:
    """Extract per-period scenario inputs and current values from a PG sheet.

    Returns {"periods": {P01-P12: {field: value}}, "current": {field: value}}.
    "current" holds col D values — the pre-scenario baseline for pricing/promo fields.
    """
    periods = {}
    for period, col in PERIOD_COL.items():
        period_data = {}
        for field, meta in PG_PERIOD_INPUTS.items():
            period_data[field] = _coerce(ws.cell(row=meta["row"], column=col).value)
        periods[period] = period_data

    current = {
        field: _coerce(ws.cell(row=meta["row"], column=_PG_COL_CURRENT).value)
        for field, meta in PG_PERIOD_INPUTS.items()
    }
    return {"periods": periods, "current": current}


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
        pg_data = extract_pg_inputs(wb[name])
        dist = dist_inputs.get(name, {})
        acv = dist.get("acv_pct", {})
        for period in PERIODS:
            pg_data["periods"][period]["acv_pct"] = acv.get(period)
        skus[name] = {
            "velocity":                     dist.get("velocity"),
            "slotting_lump_sum":            dist.get("slotting_lump_sum"),
            "slotting_per_store":           dist.get("slotting_per_store"),
            "slotting_cases_per_store":     dist.get("slotting_cases_per_store"),
            "probability":                  dist.get("probability"),
            "effective_velocity_by_period": dist.get("effective_velocity_by_period"),
            "current_inputs":               pg_data["current"],
            "periods":                      pg_data["periods"],
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

#!/usr/bin/env python3
"""
extract_dap.py  —  Parse a DAP Excel workbook and emit structured JSON defaults.

Reads four source sheets:
  Account Info       [+] account-level config (stores, rates, channel, etc.)
  Distribution       [+] per-SKU velocity, slotting, ACV % by period
  Sales Rates        [+] price/elasticity lookup table (all ~527 rows)
  Product Group      [+] per-period inputs (prices, promo slots, COGS, seasonality)

Usage:
    cd "260528 - Scenario Planning"
    python packages/engine/extract_dap.py "data/raw/260413 - WFM_CORP - DAP.xlsx"
    python packages/engine/extract_dap.py "data/raw/DAP.xlsx" --output data/processed/defaults.json

Output JSON shape:
  {
    "account":          { account_name, sales_channel, number_of_stores, rates... },
    "fiscal_calendar": { P01-P12 → { month, weeks, col } },
    "sales_rates":      [ { channel, product_group, price_point, sales_rate, elasticity } ],
    "skus": {
       "<sku_name>": {
         "velocity":        float,
         "slotting_*":      float,
         "seasonality":    { P01-P12: float },
         "static_inputs":  { upcharge_dist_pct, upcharge_cat_pct, case_count },
         "periods": {
            "P01": { acv_pct, base_price, gross_price, edlp_direct, ... all promo fields ..., cogs },
            ...
         }
       }
    }
  }

NOTE: The output file will contain client financial data — do not commit it to git.
       Recommended: write to data/processed/ (which should be gitignored).

Cross-check: run  python packages/engine/test_engine.py  to verify engine values against
the WFM EVOO P01 reference case.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl not installed. Run:  pip install openpyxl")


# ---------------------------------------------------------------------------
# Sheet / column constants  (match dap-reference.json)
# ---------------------------------------------------------------------------

KNOWN_NON_PG_SHEETS = frozenset({
    "Account Info", "Distribution", "Sales Rates", "Total",
    "Account Roll-up", "Helpers", "Cover", "Legend", "Instructions",
    "Contents", "Dashboard",
})

FISCAL_CALENDAR = {
    "P01": {"month": "July",       "weeks": 4, "col": "E"},
    "P02": {"month": "August",    "weeks": 4, "col": "F"},
    "P03": {"month": "September", "weeks": 5, "col": "G"},
    "P04": {"month": "October",   "weeks": 4, "col": "H"},
    "P05": {"month": "November",  "weeks": 4, "col": "I"},
    "P06": {"month": "December",  "weeks": 5, "col": "J"},
    "P07": {"month": "January",   "weeks": 4, "col": "K"},
    "P08": {"month": "February",  "weeks": 4, "col": "L"},
    "P09": {"month": "March",      "weeks": 5, "col": "M"},
    "P10": {"month": "April",      "weeks": 4, "col": "N"},
    "P11": {"month": "May",        "weeks": 4, "col": "O"},
    "P12": {"month": "June",       "weeks": 5, "col": "P"},
}
PERIODS = list(FISCAL_CALENDAR.keys())  # ["P01", ..., "P12"]

# 1-based column index for each period in a Product Group sheet (E=5 … P=16)
PERIOD_COL = {p: 5 + i for i, p in enumerate(PERIODS)}

# Account Info: cell address → field name  (dap-reference.json §sheets.Account Info)
ACCOUNT_CELLS = {
    "D3":  "account_name",
    "D4":  "sales_manager",
    "D5":  "sales_channel",
    "D6":  "pricing_strategy",
    "D7":  "primary_distributor",
    "D8":  "secondary_distributor",
    "D12": "number_of_stores",
    "D13": "terms_spoils_pct",
    "D14": "distributor_program_pct",
    "D15": "digital_sales_pct",
    "D16": "other_program_pct",
    "G4":  "tpr_fee",
    "G5":  "tpr_length_weeks",
    "G6":  "ad_fee",
    "G7":  "ad_length_weeks",
    "G8":  "min_pct_to_execute",
    "G9":  "can_execute_scans",
}

# Product Group input rows  (dap-reference.json §product_group_row_map.inputs)
# per_period=True  [+] read from each period column (E–P)
# per_period=False → constant across periods; read from col E as representative
PG_INPUTS = {
    # Everyday pricing
    "base_price":                  {"row": 10,  "per_period": True},
    "gross_price":                {"row": 11,  "per_period": True},
    "edlp_direct":                {"row": 12,  "per_period": True},
    "price_impact_manual":       {"row": 13,  "per_period": True},
    "upcharge_dist_pct":         {"row": 15,  "per_period": False},
    "upcharge_cat_pct":          {"row": 23,  "per_period": False},
    "edlp_mcb_pct":               {"row": 25,  "per_period": True},
    "misc_impact_pct":            {"row": 31,  "per_period": True},
    # Promo slot 1
    "name_promo1":                {"row": 35,  "per_period": True},
    "price_promo1":               {"row": 36,  "per_period": True},
    "weeks_event_promo1":        {"row": 37,  "per_period": True},
    "scan_promo1":                {"row": 38,  "per_period": True},
    "fixed_promo1":               {"row": 39,  "per_period": True},
    "lift_promo1":                {"row": 40,  "per_period": True},
    "mcb_promo1_pct":             {"row": 51,  "per_period": True},
    "coupon_discount_promo1":   {"row": 55,  "per_period": True},
    "coupon_cost_promo1":        {"row": 56,  "per_period": True},
    "coupon_redemption_promo1": {"row": 57,  "per_period": True},
    "admin_promo1":               {"row": 58,  "per_period": True},
    "buyout_weeks_promo1":       {"row": 59,  "per_period": True},
    "buyout_amount_promo1":      {"row": 60,  "per_period": True},
    "brick_promo1":               {"row": 62,  "per_period": True},
    # Promo slot 2
    "name_promo2":                {"row": 66,  "per_period": True},
    "price_promo2":               {"row": 67,  "per_period": True},
    "weeks_event_promo2":        {"row": 68,  "per_period": True},
    "scan_promo2":                {"row": 69,  "per_period": True},
    "fixed_promo2":               {"row": 70,  "per_period": True},
    "lift_promo2":                {"row": 71,  "per_period": True},
    "mcb_promo2_pct":             {"row": 82,  "per_period": True},
    "coupon_discount_promo2":   {"row": 86,  "per_period": True},
    "coupon_cost_promo2":        {"row": 87,  "per_period": True},
    "coupon_redemption_promo2": {"row": 88,  "per_period": True},
    "admin_promo2":               {"row": 89,  "per_period": True},
    "buyout_weeks_promo2":       {"row": 90,  "per_period": True},
    "buyout_amount_promo2":      {"row": 91,  "per_period": True},
    "brick_promo2":               {"row": 93,  "per_period": True},
    # Cost
    "cogs":                         {"row": 147, "per_period": True},
    "case_count":                  {"row": 148, "per_period": False},
}

# Distribution sheet column indices (1-based).
# Distribution sheet column layout (confirmed by probing WFM DAP):
#   Col A (1): Category  (Oils/Marinade/etc.) — ignored
#   Col B (2): Product Group / SKU name — matches PG sheet name exactly
#   Col L (12): Account Base Unit Velocity — units/store/week
#   Col N (14): Account Current ACV % (single value, whole-number %)
#   Col P (16): P01 ACV %; Q=P02 … AA=P12  (stored as whole % e.g. 99.52 = 99.52%)
#   Cols AM/AN/AO (39-41): slotting lump sum / per store / cases per store
#   Data rows start at row 7 (rows 1-6 are headers/navigation)
# NOTE: dap-reference.json listed AV-BH for ACV — that is incorrect for this workbook.
_DIST_COL_SKU_NAME       = 2   # B  — Product Group name = PG sheet name
_DIST_COL_VELOCITY       = 12  # L  — Account Base Unit Velocity (units/store/week)
_DIST_COL_SLOT_LUMP      = 39  # AM — slotting lump sum
_DIST_COL_SLOT_PER_STORE = 40  # AN
_DIST_COL_SLOT_CASES     = 41  # AO
_DIST_COL_ACV_P01        = 16  # P  = P01;  Q=P02 … AA=P12
_DIST_DATA_START_ROW     = 7   # rows 1-6 are headers

_DIST_HEADER_KEYWORDS = {"SKU", "PRODUCT", "ITEM", "NAME", "GROUP", "DESCRIPTION"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce(v):
    """Return value as-is (preserving float/int/str/None). Convert numeric strings."""
    if v is None:
         return None
    if isinstance(v, bool):
         return v  # keep booleans as booleans (e.g. can_execute_scans)
    if isinstance(v, (int, float)):
         return v
    if isinstance(v, str):
         s = v.strip()
         if not s:
              return None
         try:
              return int(s) if "." not in s else float(s)
         except ValueError:
              return s
    return v


def _num(v):
    """Return float/int if numeric, else None."""
    c = _coerce(v)
    return c if isinstance(c, (int, float)) and not isinstance(c, bool) else None


# ---------------------------------------------------------------------------
# Per-sheet extractors
# ---------------------------------------------------------------------------

def extract_account_info(wb) -> dict:
    ws = wb["Account Info"]
    return {field: _coerce(ws[cell].value) for cell, field in ACCOUNT_CELLS.items()}


def extract_sales_rates(wb) -> list:
    ws = wb["Sales Rates"]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
         channel, pg, rounding, price, rate, elasticity = (list(row) + [None] * 6)[:6]
         if channel is None:
              continue
         rows.append({
              "channel":               str(channel).strip() if channel else None,
              "product_group":        str(pg).strip() if pg else None,
              "rounding_type":        str(rounding).strip() if rounding else None,
              "price_point":          _num(price),
              "sales_rate":            _num(rate),
              "constant_elasticity": _num(elasticity),
         })
    return rows


def extract_distribution(wb) -> dict:
    """Returns {sku_name: {velocity, slotting_*, acv_pct_by_period}}.

    ACV is stored as a whole percentage in Excel (e.g. 99.52 = 99.52%) and
    converted to decimal here (0.9952) to match ScenarioInputs.acv_pct.
    """
    ws = wb["Distribution"]
    skus = {}

    for row in ws.iter_rows(min_row=_DIST_DATA_START_ROW, values_only=False):
        cell_b = row[_DIST_COL_SKU_NAME - 1]  # col B (0-based index 1)
        raw = cell_b.value
        if not isinstance(raw, str) or not raw.strip():
            continue
        name = raw.strip()
        if any(kw in name.upper() for kw in _DIST_HEADER_KEYWORDS):
            continue

        r = cell_b.row
        get = lambda col: _num(ws.cell(row=r, column=col).value)

        # ACV stored as whole % (99.52); divide by 100 for engine decimal (0.9952)
        acv = {}
        for i, p in enumerate(PERIODS):
            raw_acv = get(_DIST_COL_ACV_P01 + i)
            acv[p] = raw_acv / 100.0 if raw_acv is not None else None

        skus[name] = {
            "velocity":                get(_DIST_COL_VELOCITY),
            "slotting_lump_sum":       get(_DIST_COL_SLOT_LUMP),
            "slotting_per_store":      get(_DIST_COL_SLOT_PER_STORE),
            "slotting_cases_per_store": get(_DIST_COL_SLOT_CASES),
            "acv_pct_by_period":       acv,
        }

    return skus


def _is_pg_sheet(wb, name: str) -> bool:
    """True if the sheet is a Product Group sheet.

    Heuristic: row 7 col E holds a seasonality index, which is always
    between 0.1 and 5.0.  Utility sheets ("Check", "Month", etc.) have
    values like 0, 6, or 705 at that cell.
    """
    if name in KNOWN_NON_PG_SHEETS:
        return False
    ws = wb[name]
    val = ws.cell(row=7, column=5).value
    return isinstance(val, (int, float)) and not isinstance(val, bool) and 0.1 <= val <= 5.0


def extract_pg_sheet(ws) -> dict:
    """Extract seasonality, static inputs, and per-period inputs from a PG sheet."""
    seasonality = {p: _num(ws.cell(row=7, column=col).value) for p, col in PERIOD_COL.items()}

    static = {}
    for field, meta in PG_INPUTS.items():
         if not meta["per_period"]:
              static[field] = _num(ws.cell(row=meta["row"], column=5).value)

    periods = {}
    for period, col in PERIOD_COL.items():
         pd = {}
         for field, meta in PG_INPUTS.items():
              if meta["per_period"]:
                   pd[field] = _coerce(ws.cell(row=meta["row"], column=col).value)
         periods[period] = pd

    return {"seasonality": seasonality, "static_inputs": static, "periods": periods}


# ---------------------------------------------------------------------------
# Top-level extract
# ---------------------------------------------------------------------------

def extract(excel_path: Path) -> dict:
    print(f"Loading {excel_path.name} ...", flush=True)
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)
    all_sheets = wb.sheetnames

    print("  [+] Account Info", flush=True)
    account = extract_account_info(wb)

    print("  [+] Sales Rates", flush=True)
    sales_rates = extract_sales_rates(wb)
    print(f"      {len(sales_rates)} rows", flush=True)

    print("  [+] Distribution", flush=True)
    distribution = extract_distribution(wb)
    print(f"      {len(distribution)} SKU(s): {list(distribution)}", flush=True)

    pg_names = [s for s in all_sheets if _is_pg_sheet(wb, s)]
    print(f"  [+] Product Group sheets ({len(pg_names)} found):", flush=True)

    skus = {}
    for name in pg_names:
         print(f"      - {name}", flush=True)
         pg = extract_pg_sheet(wb[name])
         dist = distribution.get(name, {})

         # Merge ACV % from Distribution into each period's input dict
         acv_by_period = dist.get("acv_pct_by_period", {})
         for period in PERIODS:
              pg["periods"][period]["acv_pct"] = acv_by_period.get(period)

         skus[name] = {
              "velocity":                    dist.get("velocity"),
              "slotting_lump_sum":         dist.get("slotting_lump_sum"),
              "slotting_per_store":        dist.get("slotting_per_store"),
              "slotting_cases_per_store": dist.get("slotting_cases_per_store"),
              "seasonality":                pg["seasonality"],
              "static_inputs":              pg["static_inputs"],
              "periods":                     pg["periods"],
         }

    return {
         "_meta": {
              "source_file":    excel_path.name,
              "extracted_at":   datetime.now(timezone.utc).isoformat(),
              "all_sheets":      all_sheets,
              "pg_sheets_found": pg_names,
         },
         "account":          account,
         "fiscal_calendar": FISCAL_CALENDAR,
         "sales_rates":      sales_rates,
         "skus":              skus,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
         description="Extract DAP Excel defaults to JSON for the scenario planning web app.",
         formatter_class=argparse.RawDescriptionHelpFormatter,
         epilog="Output file contains client data — do not commit to git.",
    )
    parser.add_argument("excel_path", help="Path to DAP .xlsx file")
    parser.add_argument(
         "--output", "-o",
         default="dap_defaults.json",
         help="Output JSON path (default: dap_defaults.json in CWD)",
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
    n_rates = len(data["sales_rates"])
    print(f"\nWrote {out}  ({out.stat().st_size:,} bytes)")
    print(f"  {n_skus} SKU(s)  |  {n_rates} sales rate rows")
    if n_skus == 0:
         print("\nWARNING: No Product Group sheets detected.")
         print("  If your PG sheets don't have a seasonality index at row 7 col E,")
         print("  inspect the sheet and adjust _is_pg_sheet() or pass --pg-sheets manually.")
    print("\nNext: python packages/engine/test_engine.py  (verify engine against Excel)")


if __name__ == "__main__":
    main()

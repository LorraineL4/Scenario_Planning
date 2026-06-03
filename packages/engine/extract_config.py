#!/usr/bin/env python3
"""
extract_config.py  —  Extract account-level configuration from a DAP Excel workbook.

Reads:
  Account Info   → account setup (stores, rates, channel, etc.)
  Sales Rates    → price/elasticity lookup table (~527 rows)
  Product Group  → per-SKU seasonality and static inputs (upcharges, case count)

Usage:
    cd "260528 - Scenario Planning"
    python packages/engine/extract_config.py "data/raw/DAP.xlsx"
    python packages/engine/extract_config.py "data/raw/DAP.xlsx" --output data/processed/config.json

Output JSON shape:
  {
    "account":         { account_name, sales_channel, number_of_stores, rates... },
    "fiscal_calendar": { P01-P12 → { month, weeks, col } },
    "sales_rates":     [ { channel, product_group, price_point, sales_rate, elasticity } ],
    "skus": {
      "<sku_name>": {
        "seasonality":   { P01-P12: float },
        "static_inputs":            { upcharge_dist_pct, upcharge_cat_pct, case_count }
      }
    }
  }

NOTE: Output contains client data — do not commit to git.
      Recommended: write to data/processed/ (gitignored).
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl not installed.  Run:  pip install openpyxl")


# ---------------------------------------------------------------------------
# Shared constants and helpers (also imported by extract_inputs.py)
# ---------------------------------------------------------------------------

KNOWN_NON_PG_SHEETS = frozenset({
    "Account Info", "Distribution", "Sales Rates", "Total",
    "Account Roll-up", "Helpers", "Cover", "Legend", "Instructions",
    "Contents", "Dashboard",
})

FISCAL_CALENDAR = {
    "P01": {"month": "July",       "weeks": 4, "col": "E"},
    "P02": {"month": "August",     "weeks": 4, "col": "F"},
    "P03": {"month": "September",  "weeks": 5, "col": "G"},
    "P04": {"month": "October",    "weeks": 4, "col": "H"},
    "P05": {"month": "November",   "weeks": 4, "col": "I"},
    "P06": {"month": "December",   "weeks": 5, "col": "J"},
    "P07": {"month": "January",    "weeks": 4, "col": "K"},
    "P08": {"month": "February",   "weeks": 4, "col": "L"},
    "P09": {"month": "March",      "weeks": 5, "col": "M"},
    "P10": {"month": "April",      "weeks": 4, "col": "N"},
    "P11": {"month": "May",        "weeks": 4, "col": "O"},
    "P12": {"month": "June",       "weeks": 5, "col": "P"},
}
PERIODS = list(FISCAL_CALENDAR.keys())
PERIOD_COL = {p: 5 + i for i, p in enumerate(PERIODS)}


def _coerce(v):
    """Return value as-is (preserving float/int/str/None). Convert numeric strings."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
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


def _is_pg_sheet(wb, name: str) -> bool:
    """True if the sheet is a Product Group sheet.

    Heuristic: row 7 col E holds a seasonality index between 0.1 and 5.0.
    Utility sheets have values like 0, 6, or 705 at that cell.
    """
    if name in KNOWN_NON_PG_SHEETS:
        return False
    ws = wb[name]
    val = ws.cell(row=7, column=5).value
    return isinstance(val, (int, float)) and not isinstance(val, bool) and 0.1 <= val <= 5.0


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

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

# Static (non-period) inputs from Product Group sheets
PG_STATIC_INPUTS = {
    "upcharge_dist_pct": {"row": 15},
    "upcharge_cat_pct":  {"row": 23},
    "case_count":        {"row": 148},
}


# ---------------------------------------------------------------------------
# Extractors
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
            "channel":             str(channel).strip() if channel else None,
            "product_group":       str(pg).strip() if pg else None,
            "rounding_type":       str(rounding).strip() if rounding else None,
            "price_point":         _num(price),
            "sales_rate":          _num(rate),
            "constant_elasticity": _num(elasticity),
        })
    return rows



def extract_pg_config(ws) -> dict:
    """Extract seasonality and static inputs from a PG sheet."""
    seasonality = {
        p: _num(ws.cell(row=7, column=col).value) for p, col in PERIOD_COL.items()
    }
    static = {
        field: _num(ws.cell(row=meta["row"], column=5).value)
        for field, meta in PG_STATIC_INPUTS.items()
    }
    return {"seasonality": seasonality, "static_inputs": static}


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

    pg_names = [s for s in all_sheets if _is_pg_sheet(wb, s)]
    print(f"  [+] Product Group sheets ({len(pg_names)} found):", flush=True)

    skus = {}
    for name in pg_names:
        print(f"      - {name}", flush=True)
        pg = extract_pg_config(wb[name])
        skus[name] = {
            "seasonality":   pg["seasonality"],
            "static_inputs": pg["static_inputs"],
        }

    return {
        "_meta": {
            "source_file":     excel_path.name,
            "extracted_at":    datetime.now(timezone.utc).isoformat(),
            "all_sheets":      all_sheets,
            "pg_sheets_found": pg_names,
        },
        "account":         account,
        "fiscal_calendar": FISCAL_CALENDAR,
        "sales_rates":     sales_rates,
        "skus":            skus,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extract DAP account configuration to JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Output file contains client data — do not commit to git.",
    )
    parser.add_argument("excel_path", help="Path to DAP .xlsx file")
    parser.add_argument(
        "--output", "-o",
        default="dap_config.json",
        help="Output JSON path (default: dap_config.json in CWD)",
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
    print("\nNext: python packages/engine/extract_inputs.py  (extract per-period inputs)")


if __name__ == "__main__":
    main()

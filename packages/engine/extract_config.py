#!/usr/bin/env python3
"""
extract_config.py  —  Extract account-level configuration from a DAP Excel workbook.

Reads:
  Helpers     → fiscal calendar (period/column mapping, cols N-P) + PG/SKU list (cols T-U)
  Month       → weeks per period, active fiscal periods
  Sales Rates → price/elasticity lookup table (~527 rows)
  Product Group → per-SKU seasonality and static inputs (upcharges, case count, COGS)

Usage:
    cd "260528 - Scenario Planning"
    python packages/engine/extract_config.py "data/raw/DAP.xlsx"
    python packages/engine/extract_config.py "data/raw/DAP.xlsx" --output data/processed/config.json

Output JSON shape:
  {
    "fiscal_calendar": { P01-P12 → { month, weeks, col } },
    "pg_list":         { pg_name → [item_names] },
    "sales_rates":     [ { channel, product_group, rounding_type, price_point, sales_rate, elasticity } ],
    "skus": {
      "<sku_name>": {
        "seasonality":   { P01-P12: float },
        "static_inputs": { upcharge_dist_pct, upcharge_cat_pct, case_count, cogs },
        "items":         [item_names]
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
# Shared constants and helpers (also imported by extract_inputs.py and extract_expected.py)
# ---------------------------------------------------------------------------

KNOWN_NON_PG_SHEETS = frozenset({
    "Account Info", "Distribution", "Sales Rates", "Total", "Data",
    "Account Roll-up", "Trade Summary", "PG Summary", "Distribution Summary",
    "Promo Calendar", "Detailed Promo Calendar", "Bill-Ship_Plan",
    "Helpers", "Month", "Check", "Extra Promo", "Help", "Change Log",
    "Line Charts", "Fixed Fee Calulator", "Scenario (alpha)",
    "scrape_account_info", "scrape_category_info",
    "Cover", "Legend", "Instructions", "Contents", "Dashboard",
})

# Fallback fiscal calendar (hardcoded) — used by module-level PERIODS/PERIOD_COL constants
# which are imported by extract_expected.py and other callers that don't have a workbook.
# load_fiscal_calendar(wb) reads live values from Month + Helpers tabs.
FISCAL_CALENDAR = {
    "P01": {"month": "Jul", "weeks": 4, "col": "E"},
    "P02": {"month": "Aug", "weeks": 4, "col": "F"},
    "P03": {"month": "Sep", "weeks": 5, "col": "G"},
    "P04": {"month": "Oct", "weeks": 4, "col": "H"},
    "P05": {"month": "Nov", "weeks": 4, "col": "I"},
    "P06": {"month": "Dec", "weeks": 5, "col": "J"},
    "P07": {"month": "Jan", "weeks": 4, "col": "K"},
    "P08": {"month": "Feb", "weeks": 4, "col": "L"},
    "P09": {"month": "Mar", "weeks": 5, "col": "M"},
    "P10": {"month": "Apr", "weeks": 4, "col": "N"},
    "P11": {"month": "May", "weeks": 4, "col": "O"},
    "P12": {"month": "Jun", "weeks": 5, "col": "P"},
}
PERIODS    = list(FISCAL_CALENDAR.keys())
PERIOD_COL = {p: 5 + i for i, p in enumerate(PERIODS)}  # E=5 … P=16


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


def _col_letter_to_num(letter: str) -> int:
    """Convert column letter(s) to 1-based column number. E→5, AB→28."""
    num = 0
    for ch in letter.upper():
        num = num * 26 + (ord(ch) - ord('A') + 1)
    return num


def _is_pg_sheet(wb, name: str, pg_names=None) -> bool:
    """True if the sheet is a Product Group sheet.

    When pg_names is provided (keys from load_pg_list), uses that set directly.
    Falls back to the seasonality-index heuristic when pg_names is None.
    """
    if name in KNOWN_NON_PG_SHEETS:
        return False
    if pg_names is not None:
        return name in pg_names
    ws = wb[name]
    val = ws.cell(row=7, column=5).value
    return isinstance(val, (int, float)) and not isinstance(val, bool) and 0.1 <= val <= 5.0


# ---------------------------------------------------------------------------
# Dynamic loaders — read live values from the workbook
# ---------------------------------------------------------------------------

def load_fiscal_calendar(wb) -> dict:
    """Build fiscal calendar from Month tab (weeks/names) + Helpers N-P (column mapping).

    Only includes periods where Active Fiscal Period = 1 (col F of Month tab).
    Returns {period: {month, weeks, col}} — same shape as the FISCAL_CALENDAR constant.
    """
    # Month tab: col A=period, col B=name, col C=weeks, col F=active
    ws_month = wb["Month"]
    month_rows = {}
    for row in ws_month.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        period = str(row[0])
        name   = str(row[1]) if row[1] is not None else ""
        weeks  = int(row[2]) if isinstance(row[2], (int, float)) else 0
        active = row[5] if len(row) > 5 else None
        if active:
            month_rows[period] = {"month": name, "weeks": weeks}

    # Helpers N-P: col N=period, col O=col_letter (rows 3+; row 2 is header)
    ws_helpers = wb["Helpers"]
    col_map = {}
    for row in ws_helpers.iter_rows(min_row=3, max_row=25, min_col=14, max_col=15, values_only=True):
        period, col_letter = row
        if period and col_letter:
            col_map[str(period)] = str(col_letter)

    # Combine: active periods that also have a column mapping, in period order
    calendar = {}
    for period in sorted(month_rows.keys()):
        if period in col_map:
            calendar[period] = {
                "month": month_rows[period]["month"],
                "weeks": month_rows[period]["weeks"],
                "col":   col_map[period],
            }
    return calendar


def load_pg_list(wb) -> dict:
    """Read Helpers T-U to get {pg_name: [item_names]}.

    Col T = Product Group name, col U = individual item name.
    Header is at row 2; data starts at row 3.
    One PG can map to multiple items (multiple rows with the same PG name).
    """
    ws = wb["Helpers"]
    pgs = {}
    for row in ws.iter_rows(min_row=3, min_col=20, max_col=21, values_only=True):
        pg, item = row
        if not pg:
            continue
        pg   = str(pg).strip()
        item = str(item).strip() if item else None
        if pg not in pgs:
            pgs[pg] = []
        if item:
            pgs[pg].append(item)
    return pgs


# ---------------------------------------------------------------------------
# Static extraction constants
# ---------------------------------------------------------------------------

# Non-period inputs from Product Group sheets — constant per SKU, read from the P01 column.
# cogs (row 147) is here rather than in per-period inputs because it is a fixed cost per unit.
PG_STATIC_INPUTS = {
    "upcharge_dist_pct": {"row": 15},
    "upcharge_cat_pct":  {"row": 23},
    "case_count":        {"row": 148},
    "cogs":              {"row": 147},
}


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

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


def extract_pg_config(ws, period_col=None) -> dict:
    """Extract seasonality and static inputs from a PG sheet.

    period_col: {period: col_number} mapping. Defaults to module-level PERIOD_COL.
    Static inputs (upcharges, case_count, cogs) are constant across periods —
    read from the P01 column (lowest column number in period_col).
    """
    if period_col is None:
        period_col = PERIOD_COL
    seasonality = {
        p: _num(ws.cell(row=7, column=col).value) for p, col in period_col.items()
    }
    p01_col = min(period_col.values()) if period_col else 5
    static = {
        field: _num(ws.cell(row=meta["row"], column=p01_col).value)
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

    print("  [+] Fiscal calendar (Month tab + Helpers N-P)", flush=True)
    fiscal_calendar = load_fiscal_calendar(wb)
    period_col = {p: _col_letter_to_num(d["col"]) for p, d in fiscal_calendar.items()}
    print(f"      {len(fiscal_calendar)} active period(s): {list(fiscal_calendar)}", flush=True)

    print("  [+] PG/SKU list (Helpers T-U)", flush=True)
    pg_list = load_pg_list(wb)
    print(f"      {len(pg_list)} PG(s): {list(pg_list)}", flush=True)

    print("  [+] Sales Rates", flush=True)
    sales_rates = extract_sales_rates(wb)
    print(f"      {len(sales_rates)} rows", flush=True)

    pg_sheets = [name for name in pg_list if name in all_sheets]
    missing   = [name for name in pg_list if name not in all_sheets]
    if missing:
        print(f"  [!] PGs in Helpers but no matching sheet: {missing}", flush=True)
    print(f"  [+] Product Group sheets ({len(pg_sheets)} found):", flush=True)

    skus = {}
    for name in pg_sheets:
        print(f"      - {name}", flush=True)
        pg = extract_pg_config(wb[name], period_col=period_col)
        skus[name] = {
            "seasonality":   pg["seasonality"],
            "static_inputs": pg["static_inputs"],
            "items":         pg_list[name],
        }

    return {
        "_meta": {
            "source_file":     excel_path.name,
            "extracted_at":    datetime.now(timezone.utc).isoformat(),
            "all_sheets":      all_sheets,
            "pg_sheets_found": pg_sheets,
        },
        "fiscal_calendar": fiscal_calendar,
        "pg_list":         pg_list,
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

    n_skus  = len(data["skus"])
    n_rates = len(data["sales_rates"])
    print(f"\nWrote {out}  ({out.stat().st_size:,} bytes)")
    print(f"  {n_skus} SKU(s)  |  {n_rates} sales rate rows  |  {len(data['fiscal_calendar'])} active periods")
    print("\nNext: python packages/engine/extract_inputs.py  (extract per-period inputs)")


if __name__ == "__main__":
    main()

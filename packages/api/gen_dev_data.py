#!/usr/bin/env python3
"""
gen_dev_data.py — Pre-extract a DAP workbook to JSON for fast UI development.

Usage (run from repo root):
    python packages/api/gen_dev_data.py "data/raw/260413 - WFM_CORP - DAP.xlsx"

Output: data/processed/dev_data.json  (gitignored)
Shape:  same as /api/extract response — { fiscal_calendar, account, skus }
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ENGINE_DIR = REPO_ROOT / "packages" / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from extract_config import extract as extract_config
from extract_inputs import extract as extract_inputs
from run_account import run_account


_PROMO_PERIOD_FIELDS = (
    "name_promo1", "price_promo1", "weeks_event_promo1",
    "scan_promo1", "fixed_promo1", "lift_promo1",
)

_PRICING_PERIOD_FIELDS = (
    "base_price", "gross_price", "edlp_direct", "edlp_mcb_pct", "price_impact_manual",
)


def merge_skus(config_skus: dict, inputs_skus: dict) -> dict:
    result = {}
    for name in sorted(set(config_skus) | set(inputs_skus)):
        c = config_skus.get(name, {})
        inp = inputs_skus.get(name, {})
        promo_periods = {
            period: {f: pdata.get(f) for f in _PROMO_PERIOD_FIELDS}
            for period, pdata in inp.get("periods", {}).items()
        }
        pricing_periods = {
            period: {f: pdata.get(f) for f in _PRICING_PERIOD_FIELDS}
            for period, pdata in inp.get("periods", {}).items()
        }
        current_inputs = {f: inp.get("current_inputs", {}).get(f) for f in _PRICING_PERIOD_FIELDS}
        result[name] = {
            "velocity":           inp.get("velocity"),
            "current_acv":        inp.get("current_acv"),
            "acv_pct":            inp.get("acv_pct", {}),
            "probability":        inp.get("probability", {}),
            "slotting_lump_sum":  inp.get("slotting_lump_sum"),
            "slotting_per_store": inp.get("slotting_per_store"),
            "seasonality":        c.get("seasonality", {}),
            "static_inputs":      c.get("static_inputs", {}),
            "promo_periods":      promo_periods,
            "pricing_periods":    pricing_periods,
            "current_inputs":     current_inputs,
        }
    return result


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python gen_dev_data.py <path-to-DAP.xlsx>")

    xlsx_path = Path(sys.argv[1])
    if not xlsx_path.exists():
        sys.exit(f"File not found: {xlsx_path}")

    print(f"Extracting {xlsx_path.name}...")
    config  = extract_config(xlsx_path)
    inputs  = extract_inputs(xlsx_path)

    print("Running engine...")
    results = run_account(config, inputs)

    # Roll up per-period totals across all SKUs
    period_totals: dict = {}
    for sku_data in results.get("skus", {}).values():
        for p, row in sku_data.get("periods", {}).items():
            if p not in period_totals:
                period_totals[p] = {"gross_sales": 0.0, "unit_sales": 0.0}
            period_totals[p]["gross_sales"] += row.get("gross_sales", 0) or 0
            period_totals[p]["unit_sales"]  += row.get("unit_sales",  0) or 0
    results["account_periods"] = period_totals

    payload = {
        "fiscal_calendar": config.get("fiscal_calendar", {}),
        "account":         inputs.get("account", {}),
        "skus":            merge_skus(config.get("skus", {}), inputs.get("skus", {})),
        "results":         results,
    }

    out = REPO_ROOT / "data" / "processed" / "dev_data.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")

    n_skus = len(payload["skus"])
    acct = results["account_total"]
    print(f"Wrote {out}  ({out.stat().st_size:,} bytes)")
    print(f"  {n_skus} SKU(s) | gross_sales={acct['gross_sales']:,.0f} | profit={acct['profit_after_total_spend']:,.0f}")


if __name__ == "__main__":
    main()

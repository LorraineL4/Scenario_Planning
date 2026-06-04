#!/usr/bin/env python3
"""
gen_dev_data.py — Rebuild dev_data.json from already-extracted config.json + inputs.json.

Run extract_config.py and extract_inputs.py on your DAP file first, then:

    python packages/api/gen_dev_data.py

Output: data/processed/dev_data.json  (gitignored)
Shape:  same as /api/extract response — { fiscal_calendar, account, skus, results }
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ENGINE_DIR = REPO_ROOT / "packages" / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from run_account import run_account


_PROMO_PERIOD_FIELDS = (
    "name_promo1", "price_promo1", "weeks_event_promo1",
    "scan_promo1", "fixed_promo1", "lift_promo1",
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
        }
    return result


def main():
    config_path = REPO_ROOT / "data" / "processed" / "config.json"
    inputs_path = REPO_ROOT / "data" / "processed" / "inputs.json"

    if not config_path.exists() or not inputs_path.exists():
        sys.exit(
            "config.json or inputs.json not found in data/processed/.\n"
            "Run extract_config.py and extract_inputs.py on your DAP file first:\n"
            "  python packages/engine/extract_config.py \"data/raw/<DAP>.xlsx\" --output data/processed/config.json\n"
            "  python packages/engine/extract_inputs.py \"data/raw/<DAP>.xlsx\" --output data/processed/inputs.json"
        )

    print(f"Reading {config_path.name} and {inputs_path.name}...")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    inputs = json.loads(inputs_path.read_text(encoding="utf-8"))

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

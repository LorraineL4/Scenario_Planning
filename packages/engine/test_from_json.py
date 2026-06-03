#!/usr/bin/env python3
"""
test_from_json.py  —  End-to-end test: JSON extractors → engine → compare to Excel.

Reads data/processed/config.json, inputs.json, and expected.json, runs the engine
for every SKU × period, and compares results against Excel-extracted expected values.

Run from project root:
    python packages/engine/test_from_json.py
    python packages/engine/test_from_json.py --sku "COR 100% Cali EVOO 1L"
    python packages/engine/test_from_json.py --sku "COR 100% Cali EVOO 1L" "Lucini Everyday EVOO 1L"
    python packages/engine/test_from_json.py --sku "COR 100% Cali EVOO 1L" --period P01
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from run_account import run_sku, PERIODS

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH   = ROOT / "data" / "processed" / "config.json"
INPUTS_PATH   = ROOT / "data" / "processed" / "inputs.json"
EXPECTED_PATH = ROOT / "data" / "processed" / "expected.json"

# Unit-count fields are rounded to 0 decimal places in engine output — use wider tolerance
UNIT_FIELDS = {"baseline_weekly", "unit_sales", "promo_units", "non_promo_units",
               "incremental_units", "base_units"}

# Fields excluded from comparison — slotting (non-working spend) not yet fully implemented
SKIP_FIELDS = {"total_spend", "profit_after_total_spend"}

# Tolerance per field group
def tolerance(field: str) -> float:
    return 0.5 if field in UNIT_FIELDS else 0.02


def load_json(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing: {path}\nRun the extractors first.")
    return json.loads(path.read_text(encoding="utf-8"))


def compare_period(engine: dict, expected: dict, sku: str, period: str) -> list:
    """Return list of (field, engine_val, expected_val) for any DIFFs."""
    diffs = []
    for field, exp_val in expected.items():
        if exp_val is None or field in SKIP_FIELDS:
            continue
        eng_val = engine.get(field)
        if eng_val is None:
            continue
        if abs(float(eng_val) - float(exp_val)) >= tolerance(field):
            diffs.append((field, eng_val, exp_val))
    return diffs


def main():
    parser = argparse.ArgumentParser(description="Run end-to-end engine test against Excel expected values.")
    parser.add_argument("--sku",    default=None, nargs="+", help="Test one or more SKU names")
    parser.add_argument("--period", default=None, help="Test a single period (e.g. P01)")
    args = parser.parse_args()

    cfg_data      = load_json(CONFIG_PATH)
    inp_data      = load_json(INPUTS_PATH)
    expected_data = load_json(EXPECTED_PATH)

    skus_to_test = args.sku if args.sku else list(inp_data["skus"].keys())
    periods_to_test = [args.period] if args.period else PERIODS

    total_checks = 0
    total_diffs  = 0
    sku_failures = {}

    print(f"\nRunning engine for {len(skus_to_test)} SKU(s) × {len(periods_to_test)} period(s) ...\n")

    for sku in skus_to_test:
        if sku not in inp_data["skus"]:
            print(f"  SKIP  {sku}  (not in inputs.json)")
            continue
        if sku not in expected_data["skus"]:
            print(f"  SKIP  {sku}  (not in expected.json)")
            continue

        sku_result = run_sku(cfg_data, inp_data, sku)
        sku_diffs  = []

        for period in periods_to_test:
            engine_out   = sku_result["periods"][period]
            expected_out = expected_data["skus"][sku][period]
            diffs = compare_period(engine_out, expected_out, sku, period)
            n_fields = sum(1 for v in expected_out.values() if v is not None)
            total_checks += n_fields
            total_diffs  += len(diffs)
            if diffs:
                sku_diffs.append((period, diffs))

        if sku_diffs:
            sku_failures[sku] = sku_diffs
            print(f"  FAIL  {sku}")
            for period, diffs in sku_diffs:
                for field, eng, exp in diffs:
                    print(f"        {period}  {field:<35} engine={float(eng):>12,.2f}  excel={float(exp):>12,.2f}  diff={abs(float(eng)-float(exp)):,.2f}")
        else:
            print(f"  OK    {sku}")

    print(f"\n{'='*60}")
    print(f"  Checks : {total_checks}")
    print(f"  Passed : {total_checks - total_diffs}")
    print(f"  Failed : {total_diffs}")
    if total_diffs == 0:
        print(f"  Result : ALL PASSED")
    else:
        print(f"  Result : {len(sku_failures)} SKU(s) with differences")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()

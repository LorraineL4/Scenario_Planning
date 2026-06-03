#!/usr/bin/env python3
"""
test_from_json.py  —  End-to-end test: JSON extractors → engine → compare to Excel.

Reads data/processed/config.json and data/processed/inputs.json,
builds Config + ScenarioInputs for one SKU + period, runs the engine,
and checks results against known Excel values.

Run from project root:
    python packages/engine/test_from_json.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_engine import Config, ScenarioInputs, run_engine, EXCEL_EXPECTED

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "data" / "processed" / "config.json"
INPUTS_PATH = ROOT / "data" / "processed" / "inputs.json"

SKU    = "COR 100% Cali EVOO 1L"
PERIOD = "P01"


def load_json(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing: {path}\nRun the extractors first.")
    return json.loads(path.read_text(encoding="utf-8"))


def build_config(cfg_data: dict, inp_data: dict, sku: str, period: str) -> Config:
    acct  = cfg_data["account"]
    cal   = cfg_data["fiscal_calendar"][period]
    sku_cfg = cfg_data["skus"][sku]

    return Config(
        number_of_stores       = int(acct["number_of_stores"]),
        seasonality_index      = sku_cfg["seasonality"][period],
        weeks_in_period        = cal["weeks"],
        terms_spoils_pct       = acct["terms_spoils_pct"],
        distributor_program_pct= acct["distributor_program_pct"],
        digital_sales_pct      = acct["digital_sales_pct"] or 0.0,
        other_program_pct      = acct["other_program_pct"] or 0.0,
        constant_elasticity    = -0.96,    # would come from Sales Rates lookup in production
        current_base_price     = 38.99,    # reference price; only used when price_impact_manual is None
    )


def build_inputs(cfg_data: dict, inp_data: dict, sku: str, period: str) -> ScenarioInputs:
    sku_inp  = inp_data["skus"][sku]
    p        = sku_inp["periods"][period]
    static   = cfg_data["skus"][sku]["static_inputs"]

    def f(v, default=0.0):
        return float(v) if v is not None else default

    def i(v, default=0):
        return int(v) if v is not None else default

    return ScenarioInputs(
        acv_pct               = f(p["acv_pct"]),
        velocity              = f(sku_inp["velocity"]),
        slotting              = f(sku_inp["slotting_lump_sum"]),

        base_price            = f(p["base_price"]),
        gross_price           = f(p["gross_price"]),
        edlp_direct           = f(p["edlp_direct"]),
        edlp_mcb_pct          = f(p["edlp_mcb_pct"]),
        upcharge_dist_pct     = f(static["upcharge_dist_pct"]),
        upcharge_cat_pct      = f(static["upcharge_cat_pct"]),
        price_impact_manual   = p["price_impact_manual"],   # None = auto-calc
        misc_impact_pct       = f(p["misc_impact_pct"]),

        weeks_event_promo1    = i(p["weeks_event_promo1"]),
        price_promo1          = f(p["price_promo1"]),
        scan_promo1           = f(p["scan_promo1"]),
        lift_promo1           = f(p["lift_promo1"]),
        fixed_promo1          = f(p["fixed_promo1"]),
        mcb_promo1_pct        = f(p["mcb_promo1_pct"]),
        coupon_discount_promo1= f(p["coupon_discount_promo1"]),
        coupon_cost_promo1    = f(p["coupon_cost_promo1"]),
        coupon_redemption_promo1 = f(p["coupon_redemption_promo1"]),
        admin_promo1          = f(p["admin_promo1"]),
        buyout_weeks_promo1   = i(p["buyout_weeks_promo1"]),
        buyout_amount_promo1  = f(p["buyout_amount_promo1"]),
        brick_promo1          = f(p["brick_promo1"]),

        weeks_event_promo2    = i(p["weeks_event_promo2"]),
        price_promo2          = f(p["price_promo2"]),
        scan_promo2           = f(p["scan_promo2"]),
        lift_promo2           = f(p["lift_promo2"]),
        fixed_promo2          = f(p["fixed_promo2"]),
        mcb_promo2_pct        = f(p["mcb_promo2_pct"]),
        coupon_discount_promo2= f(p["coupon_discount_promo2"]),
        coupon_cost_promo2    = f(p["coupon_cost_promo2"]),
        coupon_redemption_promo2 = f(p["coupon_redemption_promo2"]),
        admin_promo2          = f(p["admin_promo2"]),
        buyout_weeks_promo2   = i(p["buyout_weeks_promo2"]),
        buyout_amount_promo2  = f(p["buyout_amount_promo2"]),
        brick_promo2          = f(p["brick_promo2"]),

        cogs                  = f(p["cogs"]),
    )


def main():
    print(f"\nLoading extracted JSON ...")
    cfg_data = load_json(CONFIG_PATH)
    inp_data = load_json(INPUTS_PATH)
    print(f"  config.json  — {len(cfg_data['skus'])} SKUs")
    print(f"  inputs.json  — {len(inp_data['skus'])} SKUs")

    print(f"\nBuilding Config + ScenarioInputs for: {SKU} / {PERIOD}")
    cfg = build_config(cfg_data, inp_data, SKU, PERIOD)
    inp = build_inputs(cfg_data, inp_data, SKU, PERIOD)

    results = run_engine(cfg, inp)

    print(f"\n=== End-to-end test: {SKU} / {PERIOD} ===")
    print(f"  {'Metric':<35} {'Engine':>12}  {'Excel':>12}  {'Match':>6}\n")

    # Unit-count metrics are rounded to 0 decimal places in engine output;
    # money metrics are rounded to 2. Tolerances match accordingly.
    UNIT_KEYS = {"baseline_weekly", "non_promo_units", "promo_units",
                 "incremental_units", "base_units", "unit_sales"}

    all_ok = True
    for key, excel_val in EXCEL_EXPECTED.items():
        engine_val = results.get(key)
        if engine_val is None:
            print(f"  {key.replace('_',' '):<35} {'MISSING':>12}  {excel_val:>12,.2f}  {'MISS':>6}")
            all_ok = False
            continue
        tol = 0.5 if key in UNIT_KEYS else 0.01
        match = abs(float(engine_val) - excel_val) < tol
        if not match:
            all_ok = False
        label = "OK" if match else "DIFF"
        print(f"  {key.replace('_',' '):<35} {float(engine_val):>12,.2f}  {excel_val:>12,.2f}  {label:>6}")

    print()
    if all_ok:
        print("  All checks passed.")
    else:
        print("  SOME CHECKS FAILED — see DIFF rows above.")
    print()


if __name__ == "__main__":
    main()

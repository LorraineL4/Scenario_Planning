#!/usr/bin/env python3
"""
run_account.py  —  Run the DAP engine for all SKUs × all periods.

Reads data/processed/config.json and inputs.json (produced by the extractors),
runs run_engine() for every SKU × period combination, and aggregates:
  - period outputs → annual per SKU (summable fields summed; rates recalculated)
  - SKU annuals → account total

Usage:
    python packages/engine/run_account.py
    python packages/engine/run_account.py --output data/processed/results.json

Output JSON shape:
  {
    "skus": {
      "<sku_name>": {
        "slotting_by_period": { "P01": 0.0, ..., "P12": 0.0 },
        "periods": { "P01": { ...engine outputs... }, ..., "P12": { ... } },
        "annual":  { ...summed + recalculated rates... }
      }
    },
    "account_total": { ...summed across all SKUs... }
  }
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_engine import Config, ScenarioInputs, run_engine

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "data" / "processed" / "config.json"
INPUTS_PATH = ROOT / "data" / "processed" / "inputs.json"

PERIODS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12"]

# Fields summed directly across periods and across SKUs
SUMMABLE = frozenset({
    "unit_sales", "base_units", "promo_units", "incremental_units", "non_promo_units",
    "gross_sales", "net_sales", "defined_trade", "total_cogs",
    "retailer_working_spend", "distributor_working",
    "digital_sales_spend", "other_spend", "terms_spoils_spend", "total_spend",
    "profit_after_working_spend", "profit_after_total_spend",
})


# ---------------------------------------------------------------------------
# Slotting allocation
# ---------------------------------------------------------------------------

def allocate_slotting(acv_by_period: dict, slotting_lump: float) -> dict:
    """
    Allocate annual slotting lump sum to periods where ACV increases.

    Slotting is paid when new distribution is added — i.e., when ACV%
    rises vs the prior period. Allocation is proportional to the size of
    each ACV increase. P01 compares against 0 (no prior-year context).

    Example: P03=20%, P04=80% → delta of 60pp → all slotting goes to P04.
    Example: P04=60%, P07=90% → deltas 60pp and 30pp → 67% in P04, 33% in P07.

    See DAP_METHODOLOGY.md §10 for full rationale.
    """
    prev_acv = 0.0
    deltas = {}
    for p in PERIODS:
        acv = acv_by_period.get(p) or 0.0
        delta = max(0.0, acv - prev_acv)
        if delta > 0:
            deltas[p] = delta
        prev_acv = acv

    total_delta = sum(deltas.values())
    if total_delta == 0 or not slotting_lump:
        return {p: 0.0 for p in PERIODS}

    return {
        p: round((deltas.get(p, 0.0) / total_delta) * slotting_lump, 4)
        for p in PERIODS
    }


# ---------------------------------------------------------------------------
# Config / inputs builders (one per SKU per period)
# ---------------------------------------------------------------------------

def _build_config(cfg_data: dict, inp_data: dict, sku: str, period: str) -> Config:
    acct    = inp_data["account"]
    cal     = cfg_data["fiscal_calendar"][period]
    sku_cfg = cfg_data["skus"][sku]
    return Config(
        number_of_stores        = int(acct["number_of_stores"]),
        seasonality_index       = sku_cfg["seasonality"][period] or 1.0,
        weeks_in_period         = cal["weeks"],
        terms_spoils_pct        = acct["terms_spoils_pct"] or 0.0,
        distributor_program_pct = acct["distributor_program_pct"] or 0.0,
        digital_sales_pct       = acct["digital_sales_pct"] or 0.0,
        other_program_pct       = acct["other_program_pct"] or 0.0,
        # elasticity / reference price only matter when price_impact_manual is None;
        # extracted DAP data always has price_impact_manual set per period
        constant_elasticity     = 0.0,
        current_base_price      = 1.0,
    )


def _build_inputs(
    cfg_data: dict, inp_data: dict, sku: str, period: str, slotting: float,
    dist_baseline_override: float = None,
) -> ScenarioInputs:
    p      = inp_data["skus"][sku]["periods"][period]
    static = cfg_data["skus"][sku]["static_inputs"]

    def f(v, default=0.0):
        return float(v) if v is not None else default

    def i(v, default=0):
        return int(v) if v is not None else default

    return ScenarioInputs(
        acv_pct               = f(p["acv_pct"]),
        velocity              = f(inp_data["skus"][sku]["velocity"]),
        slotting              = slotting,

        base_price            = f(p["base_price"]),
        gross_price           = f(p["gross_price"]),
        edlp_direct           = f(p["edlp_direct"]),
        edlp_mcb_pct          = f(p["edlp_mcb_pct"]),
        upcharge_dist_pct     = f(static["upcharge_dist_pct"]),
        upcharge_cat_pct      = f(static["upcharge_cat_pct"]),
        price_impact_manual   = p["price_impact_manual"],
        misc_impact_pct       = f(p["misc_impact_pct"]),

        weeks_event_promo1       = i(p["weeks_event_promo1"]),
        price_promo1             = f(p["price_promo1"]),
        scan_promo1              = f(p["scan_promo1"]),
        lift_promo1              = f(p["lift_promo1"]),
        fixed_promo1             = f(p["fixed_promo1"]),
        mcb_promo1_pct           = f(p["mcb_promo1_pct"]),
        coupon_discount_promo1   = f(p["coupon_discount_promo1"]),
        coupon_cost_promo1       = f(p["coupon_cost_promo1"]),
        coupon_redemption_promo1 = f(p["coupon_redemption_promo1"]),
        admin_promo1             = f(p["admin_promo1"]),
        buyout_weeks_promo1      = i(p["buyout_weeks_promo1"]),
        buyout_amount_promo1     = f(p["buyout_amount_promo1"]),
        brick_promo1             = f(p["brick_promo1"]),

        weeks_event_promo2       = i(p["weeks_event_promo2"]),
        price_promo2             = f(p["price_promo2"]),
        scan_promo2              = f(p["scan_promo2"]),
        lift_promo2              = f(p["lift_promo2"]),
        fixed_promo2             = f(p["fixed_promo2"]),
        mcb_promo2_pct           = f(p["mcb_promo2_pct"]),
        coupon_discount_promo2   = f(p["coupon_discount_promo2"]),
        coupon_cost_promo2       = f(p["coupon_cost_promo2"]),
        coupon_redemption_promo2 = f(p["coupon_redemption_promo2"]),
        admin_promo2             = f(p["admin_promo2"]),
        buyout_weeks_promo2      = i(p["buyout_weeks_promo2"]),
        buyout_amount_promo2     = f(p["buyout_amount_promo2"]),
        brick_promo2             = f(p["brick_promo2"]),

        cogs                  = f(static.get("cogs")),
        dist_baseline_override = dist_baseline_override,
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def _aggregate(outputs: list) -> dict:
    """Sum summable fields; recalculate derived rate fields from aggregates."""
    annual = {k: 0.0 for k in SUMMABLE}
    for row in outputs:
        for k in SUMMABLE:
            v = row.get(k)
            if isinstance(v, (int, float)):
                annual[k] += v

    gs = annual["gross_sales"]
    annual["allin_trade_rate_pct"] = round(annual["total_spend"] / gs * 100, 2) if gs else 0.0

    return {k: round(v, 2) for k, v in annual.items()}


# ---------------------------------------------------------------------------
# Top-level runners
# ---------------------------------------------------------------------------

def run_sku(cfg_data: dict, inp_data: dict, sku: str) -> dict:
    sku_inp   = inp_data["skus"][sku]
    stores    = inp_data["account"]["number_of_stores"]
    eff_vel   = sku_inp.get("effective_velocity_by_period", {})

    acv_by_period  = {p: sku_inp["periods"][p].get("acv_pct") for p in PERIODS}
    slotting_alloc = allocate_slotting(acv_by_period, sku_inp.get("slotting_lump_sum") or 0.0)

    period_outputs = {}
    for p in PERIODS:
        cfg = _build_config(cfg_data, inp_data, sku, p)
        # Use pre-computed SUMPRODUCT baseline when available (multi-item PGs)
        override = eff_vel[p] * stores if eff_vel.get(p) is not None else None
        inp = _build_inputs(cfg_data, inp_data, sku, p, slotting_alloc[p], override)
        period_outputs[p] = run_engine(cfg, inp)

    return {
        "slotting_by_period": slotting_alloc,
        "periods":            period_outputs,
        "annual":             _aggregate(list(period_outputs.values())),
    }


def run_account(cfg_data: dict, inp_data: dict) -> dict:
    sku_results = {}
    for sku in inp_data["skus"]:
        sku_results[sku] = run_sku(cfg_data, inp_data, sku)

    account_annual = _aggregate([r["annual"] for r in sku_results.values()])
    return {
        "skus":          sku_results,
        "account_total": account_annual,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Run DAP engine for all SKUs and periods.")
    parser.add_argument("--config", default=str(CONFIG_PATH), help="Path to config.json")
    parser.add_argument("--inputs", default=str(INPUTS_PATH), help="Path to inputs.json")
    parser.add_argument("--output", "-o", default=str(ROOT / "data" / "processed" / "results.json"))
    args = parser.parse_args()

    for path in (Path(args.config), Path(args.inputs)):
        if not path.exists():
            sys.exit(f"Missing: {path}\nRun extract_config.py and extract_inputs.py first.")

    cfg_data = json.loads(Path(args.config).read_text(encoding="utf-8"))
    inp_data = json.loads(Path(args.inputs).read_text(encoding="utf-8"))

    n_skus = len(inp_data["skus"])
    print(f"Running engine: {n_skus} SKUs × 12 periods ({n_skus * 12} computations) ...")

    results = run_account(cfg_data, inp_data)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")

    acct = results["account_total"]
    print(f"\n{'Account Annual Summary':}")
    print(f"  {'Unit sales':<30} {acct['unit_sales']:>14,.0f}")
    print(f"  {'Gross sales':<30} {acct['gross_sales']:>14,.2f}")
    print(f"  {'Net sales':<30} {acct['net_sales']:>14,.2f}")
    print(f"  {'Total COGS':<30} {acct['total_cogs']:>14,.2f}")
    print(f"  {'Total spend':<30} {acct['total_spend']:>14,.2f}")
    print(f"  {'All-in trade rate':<30} {acct['allin_trade_rate_pct']:>13.1f}%")
    print(f"  {'Profit after working':<30} {acct['profit_after_working_spend']:>14,.2f}")
    print(f"  {'Profit after total':<30} {acct['profit_after_total_spend']:>14,.2f}")
    print(f"\nWrote {out}  ({out.stat().st_size:,} bytes)")
    print("\nPer-SKU annual gross sales:")
    for sku, data in results["skus"].items():
        gs = data["annual"]["gross_sales"]
        print(f"  {sku:<45} {gs:>12,.2f}")


if __name__ == "__main__":
    main()

"""
Standalone DAP model test — one SKU, one period, no database or API needed.
Run:  python packages/engine/test_engine.py
Cross-check the printed outputs against your Excel DAP.
"""

from dataclasses import dataclass
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Config:
    """Set once per account/SKU — shared across all scenarios."""
    number_of_stores: int
    velocity: float             # units per store per week (single value per SKU)
    seasonality_index: float    # for the period being tested
    weeks_in_period: int
    terms_spoils_pct: float
    distributor_program_pct: float
    digital_sales_pct: float
    other_program_pct: float
    slotting: float             # lump sum for this period
    constant_elasticity: float  # from Sales Rates table (e.g. -0.96 for COR 1L EVOO)
    current_base_price: float   # reference price used for elasticity auto-calc


@dataclass
class ScenarioInputs:
    """Entered per scenario, per period."""
    # Distribution
    acv_pct: float              # % store coverage → TDP = acv_pct × number_of_stores

    # Everyday pricing
    base_price: float           # retail shelf price
    gross_price: float          # manufacturer invoice to distributor
    edlp_direct: float          # $/unit everyday allowance
    edlp_mcb_pct: float         # MCB % on everyday
    upcharge_dist_pct: float    # distributor upcharge (e.g. 0.08)
    upcharge_cat_pct: float     # catalog upcharge (e.g. 0.48) — used for MCB cost to mfr
    price_impact_manual: Optional[float]  # None = auto-calc from prices; 0.0 = no change
    misc_impact_pct: float

    # Promo slot 1
    weeks_event_promo1: int
    price_promo1: float
    scan_promo1: float
    lift_promo1: float          # e.g. 1.5 = 150% above baseline
    fixed_promo1: float
    mcb_promo1_pct: float
    coupon_discount_promo1: float
    coupon_cost_promo1: float
    coupon_redemption_promo1: float
    admin_promo1: float
    buyout_weeks_promo1: int
    buyout_amount_promo1: float
    brick_promo1: float

    # Promo slot 2
    weeks_event_promo2: int
    price_promo2: float
    scan_promo2: float
    lift_promo2: float
    fixed_promo2: float
    mcb_promo2_pct: float
    coupon_discount_promo2: float
    coupon_cost_promo2: float
    coupon_redemption_promo2: float
    admin_promo2: float
    buyout_weeks_promo2: int
    buyout_amount_promo2: float
    brick_promo2: float

    # Cost
    cogs: float


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

def run_engine(cfg: Config, inp: ScenarioInputs) -> dict:
    """Run the DAP model for one SKU, one period. Returns a flat dict of outputs."""

    # --- 1. Distribution baseline ---
    tdp = inp.acv_pct * cfg.number_of_stores
    dist_baseline = cfg.velocity * tdp          # weekly units for whole account

    # --- 2. Price elasticity impact ---
    if inp.price_impact_manual is not None:
        price_elasticity_impact = inp.price_impact_manual
    else:
        price_elasticity_impact = (inp.base_price / cfg.current_base_price) ** cfg.constant_elasticity - 1

    # --- 3. Baseline (weekly, full adjustments) ---
    baseline = (
        dist_baseline
        * (1 + price_elasticity_impact)
        * (1 + inp.misc_impact_pct)
        * cfg.seasonality_index
    )

    # --- 4. Volume ---
    weeks_non_promo = cfg.weeks_in_period - inp.weeks_event_promo1 - inp.weeks_event_promo2

    promo_units_1 = inp.weeks_event_promo1 * baseline * (1 + inp.lift_promo1)
    promo_units_2 = inp.weeks_event_promo2 * baseline * (1 + inp.lift_promo2)
    promo_units = promo_units_1 + promo_units_2

    incremental_units_1 = inp.weeks_event_promo1 * baseline * inp.lift_promo1
    incremental_units_2 = inp.weeks_event_promo2 * baseline * inp.lift_promo2
    incremental_units = incremental_units_1 + incremental_units_2

    non_promo_units = weeks_non_promo * baseline
    base_units = non_promo_units + (promo_units - incremental_units)
    unit_sales = non_promo_units + promo_units

    # --- 5. Revenue ---
    gross_sales = unit_sales * inp.gross_price
    incremental_gross = incremental_units * inp.gross_price

    # --- 6. Per-unit cost chain ---
    mcb_credit_everyday = inp.edlp_mcb_pct * inp.gross_price * (1 + inp.upcharge_dist_pct)
    everyday_net_cost = inp.gross_price * (1 + inp.upcharge_dist_pct) - inp.edlp_direct - mcb_credit_everyday
    edlp_cost_per_unit = inp.edlp_direct + mcb_credit_everyday

    # Promo cost to manufacturer (uses catalog upcharge for MCB)
    mcb_cost_p1 = inp.mcb_promo1_pct * inp.gross_price * (1 + inp.upcharge_cat_pct)
    per_unit_cost_mfr_1 = inp.scan_promo1 + (inp.coupon_cost_promo1 * inp.coupon_redemption_promo1) + mcb_cost_p1

    mcb_cost_p2 = inp.mcb_promo2_pct * inp.gross_price * (1 + inp.upcharge_cat_pct)
    per_unit_cost_mfr_2 = inp.scan_promo2 + (inp.coupon_cost_promo2 * inp.coupon_redemption_promo2) + mcb_cost_p2

    # Promo credit to retailer (uses distributor upcharge for MCB)
    mcb_credit_p1 = inp.mcb_promo1_pct * inp.gross_price * (1 + inp.upcharge_dist_pct)
    per_unit_credit_ret_1 = inp.scan_promo1 + (inp.coupon_discount_promo1 * inp.coupon_redemption_promo1) + mcb_credit_p1

    mcb_credit_p2 = inp.mcb_promo2_pct * inp.gross_price * (1 + inp.upcharge_dist_pct)
    per_unit_credit_ret_2 = inp.scan_promo2 + (inp.coupon_discount_promo2 * inp.coupon_redemption_promo2) + mcb_credit_p2

    # --- 7. Trade spend build-up ---
    buyout_spend = (
        inp.buyout_weeks_promo1 * baseline * inp.buyout_amount_promo1
        + inp.buyout_weeks_promo2 * baseline * inp.buyout_amount_promo2
    )
    brick = inp.brick_promo1 + inp.brick_promo2

    activity_spend = (
        promo_units_1 * per_unit_cost_mfr_1 + promo_units_1 * inp.admin_promo1
        + promo_units_2 * per_unit_cost_mfr_2 + promo_units_2 * inp.admin_promo2
    )
    fixed_spend = inp.fixed_promo1 + inp.fixed_promo2
    everyday_spend = unit_sales * inp.edlp_direct

    retailer_working_spend = activity_spend + fixed_spend + everyday_spend + buyout_spend + brick

    distributor_working = gross_sales * cfg.distributor_program_pct
    digital_sales_spend = gross_sales * cfg.digital_sales_pct
    other_spend = gross_sales * cfg.other_program_pct
    terms_spoils_spend = gross_sales * cfg.terms_spoils_pct

    total_spend = (
        retailer_working_spend + distributor_working
        + digital_sales_spend + other_spend
        + terms_spoils_spend + cfg.slotting
    )
    net_sales = gross_sales - total_spend

    # Incremental spend (for ROI calc — variable per-unit portion only)
    incremental_spend = incremental_units_1 * per_unit_cost_mfr_1 + incremental_units_2 * per_unit_cost_mfr_2

    # --- 8. Profit layers ---
    total_cogs = unit_sales * inp.cogs
    base_profit = base_units * (inp.gross_price - edlp_cost_per_unit - inp.cogs)

    # Direct formula (verified against Excel): gs - retailer_working - total_cogs - distributor - digital - other
    profit_after_working_spend = (
        gross_sales - retailer_working_spend - total_cogs
        - distributor_working - digital_sales_spend - other_spend
    )
    # Derived to match Excel row 131 (used for promo ROI display)
    incremental_profit_after_trade = (
        profit_after_working_spend + distributor_working + digital_sales_spend + other_spend
        - base_profit + brick
    )
    profit_after_total_spend = profit_after_working_spend - terms_spoils_spend - cfg.slotting

    # --- 9. Retail metrics ---
    everyday_retail_margin_pct = 1 - (everyday_net_cost / inp.base_price) if inp.base_price else 0

    promo_net_cost_1 = everyday_net_cost - per_unit_credit_ret_1
    effective_promo_price_1 = inp.price_promo1 - (inp.coupon_discount_promo1 * inp.coupon_redemption_promo1)
    promo_retail_margin_pct_1 = (
        1 - (promo_net_cost_1 / effective_promo_price_1) if effective_promo_price_1 else 0
    )

    allin_trade_rate = total_spend / gross_sales if gross_sales else 0
    promo_efficiency = incremental_gross / incremental_spend if incremental_spend else None
    promo_roi = incremental_profit_after_trade / incremental_spend if incremental_spend else None

    return {
        # Distribution
        "tdp":                              round(tdp, 1),
        "dist_baseline_weekly":             round(dist_baseline, 1),
        # Volume
        "baseline_weekly":                  round(baseline, 1),
        "non_promo_units":                  round(non_promo_units, 0),
        "promo_units":                      round(promo_units, 0),
        "incremental_units":                round(incremental_units, 0),
        "base_units":                       round(base_units, 0),
        "unit_sales":                       round(unit_sales, 0),
        # Revenue
        "gross_sales":                      round(gross_sales, 2),
        "net_sales":                        round(net_sales, 2),
        # Per-unit costs
        "everyday_net_cost":                round(everyday_net_cost, 4),
        "everyday_retail_margin_pct":       round(everyday_retail_margin_pct * 100, 2),
        "promo1_retail_margin_pct":         round(promo_retail_margin_pct_1 * 100, 2),
        # Spend
        "retailer_working_spend":           round(retailer_working_spend, 2),
        "distributor_working":              round(distributor_working, 2),
        "terms_spoils_spend":               round(terms_spoils_spend, 2),
        "total_spend":                      round(total_spend, 2),
        "allin_trade_rate_pct":             round(allin_trade_rate * 100, 2),
        # Profit
        "profit_after_working_spend":       round(profit_after_working_spend, 2),
        "profit_after_total_spend":         round(profit_after_total_spend, 2),
        # Promo analytics
        "promo_efficiency":                 round(promo_efficiency, 3) if promo_efficiency else "n/a",
        "promo_roi":                        round(promo_roi, 3) if promo_roi else "n/a",
    }


# ---------------------------------------------------------------------------
# Real inputs — WFM, COR 100% Cali EVOO 1L, P01 (July, 4 weeks)
# Values extracted directly from 260413 - WFM_CORP - DAP.xlsx
# ---------------------------------------------------------------------------

config = Config(
    number_of_stores=526,
    velocity=3.2645707013362464,          # units/store/week (Distribution tab col L)
    seasonality_index=1.0194969362101305, # PG sheet row 7 col E
    weeks_in_period=4,
    terms_spoils_pct=0.046,
    distributor_program_pct=0.06,
    digital_sales_pct=0.0,
    other_program_pct=0.0,
    slotting=0.0,
    constant_elasticity=-0.96,            # not used — price_impact_manual is set below
    current_base_price=38.99,             # not used — price_impact_manual is set below
)

inputs = ScenarioInputs(
    acv_pct=0.9952168461538463,           # 99.52% (Distribution tab col P = P01)

    base_price=38.99,
    gross_price=25.47,
    edlp_direct=3.50,
    edlp_mcb_pct=0.0,
    upcharge_dist_pct=0.08,
    upcharge_cat_pct=0.48,
    price_impact_manual=-0.05840492512496598,  # auto-calc result from Excel row 13
    misc_impact_pct=0.0,

    # 20% TPR B, 2 weeks
    weeks_event_promo1=2,
    price_promo1=27.992,
    scan_promo1=5.50368,
    lift_promo1=2.1996657524453984,
    fixed_promo1=0.0,
    mcb_promo1_pct=0.0,
    coupon_discount_promo1=2.2014720000000003,
    coupon_cost_promo1=2.2014720000000003,
    coupon_redemption_promo1=0.2,
    admin_promo1=0.03,
    buyout_weeks_promo1=0,
    buyout_amount_promo1=0.0,
    brick_promo1=0.0,

    # No second promo
    weeks_event_promo2=0,
    price_promo2=0.0,
    scan_promo2=0.0,
    lift_promo2=0.0,
    fixed_promo2=0.0,
    mcb_promo2_pct=0.0,
    coupon_discount_promo2=0.0,
    coupon_cost_promo2=0.0,
    coupon_redemption_promo2=0.0,
    admin_promo2=0.0,
    buyout_weeks_promo2=0,
    buyout_amount_promo2=0.0,
    brick_promo2=0.0,

    cogs=11.184396876757829,
)


EXCEL_EXPECTED = {
    "baseline_weekly":          1640.512880994656,
    "non_promo_units":          3281.025761989312,
    "promo_units":              10498.185763528269,
    "incremental_units":        7217.160001538957,
    "base_units":               6562.051523978624,
    "unit_sales":               13779.211525517581,
    "gross_sales":              350956.5175549328,
    "retailer_working_spend":   110943.13333707386,
    "profit_after_working_spend": 64843.822814378625,
    "total_spend":              148144.52419789674,
    "profit_after_total_spend": 48699.823006851715,
}

if __name__ == "__main__":
    results = run_engine(config, inputs)

    print("\n=== DAP Engine — P01 Test (WFM / COR 100% Cali EVOO 1L) ===")
    print(f"  {'Metric':<35} {'Engine':>12}  {'Excel':>12}  {'Match':>6}\n")

    for key, excel_val in EXCEL_EXPECTED.items():
        engine_val = results[key]
        if isinstance(engine_val, (int, float)):
            match = "OK" if abs(float(engine_val) - excel_val) < 0.01 else "DIFF"
            print(f"  {key.replace('_',' '):<35} {float(engine_val):>12,.2f}  {excel_val:>12,.2f}  {match:>6}")

    print()
    print("  --- Other outputs ---\n")
    other_keys = [k for k in results if k not in EXCEL_EXPECTED]
    for k in other_keys:
        val = results[k]
        label = k.replace("_", " ")
        if isinstance(val, float):
            print(f"  {label:<35} {val:>12,.2f}")
        else:
            print(f"  {label:<35} {val!s:>12}")
    print()

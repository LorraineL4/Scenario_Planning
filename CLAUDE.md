# Scenario Planning Tool

## What This Is

A web app that lets CPG sales consultants save and compare account plans side by side. It replaces a manual workflow of copy-pasting financials out of an Excel DAP tool.

## Key Reference Files

| File | Purpose |
|---|---|
| `DAP_METHODOLOGY.md` | Full DAP model documentation — sheets, inputs, outputs, formulas |
| `packages/engine/dap-reference.json` | Machine-readable DAP structure for the Python engine |
| `data/raw/DAP_original.xlsx` | Original Excel file — **do not re-read for logic, it is gitignored** |

## Architecture

```
Frontend (React)
  ├── Scenario input form
  ├── Side-by-side comparison table (delta + % change)
  └── Waterfall / contribution charts

Backend (Python FastAPI)
  ├── DAP model engine (replicates DAP_METHODOLOGY.md formulas)
  ├── Scenario CRUD (create, clone, archive, lock as baseline)
  └── Account / SKU management

Database (Postgres)
  ├── Reference data: Sales Rates, Seasonality coefficients
  ├── Distribution baselines per account/SKU
  └── Saved scenarios (inputs + computed outputs)
```

## Phased Delivery

| Phase | Scope |
|---|---|
| MVP | Single account, single SKU, 8 key inputs, save + compare 2–3 scenarios |
| V2 | Multi-SKU rollup, clone scenarios, delta charts, consultant + client roles |
| V3 | Sensitivity sliders, what-if analysis, export to Excel/PPT |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  CONFIGURATION (set once, shared across all scenarios)      │
│                                                             │
│  Client Setup                                               │
│  ────────────                                               │
│  Client name                                                │
│  Fiscal year                                                │
│  Fiscal period start month                                  │
│                                                             │
│  Account Setup          SKU Setup         Reference Data    │
│  ─────────────          ─────────         ──────────────    │
│  Account name           SKU name          Seasonality ×12   │
│  Sales channel          COGS              Distribution       │
│  Distributor            Case count          baseline ×12    │
│  No. of stores          Dist upcharge %   Sales rates       │
│  T&S %                  Catalog upcharge %  + elasticity    │
│  Dist program %         Rounding type                       │
│  Digital / Other %                                          │
│  TPR fee / Ad fee                                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  MODEL ENGINE  (runs per SKU, per period, per scenario)     │
│                                                             │
│  1. Baseline = dist_baseline × price_elasticity             │
│                              × misc_impact × seasonality    │
│                                                             │
│  2. Volume                                                  │
│     promo_units  = Σ weeks_promo[i] × baseline × (1+lift)   │
│     base_units   = remaining weeks × baseline               │
│     total_units  = base_units + promo_units                 │
│                                                             │
│  3. Revenue                                                 │
│     gross_sales  = total_units × gross_price                │
│                                                             │
│  4. Per-unit cost chain                                     │
│     everyday_net_cost   = gross × (1+dist_upcharge) − edlp  │
│     promo_cost_to_mfr   = scan + coupon + mcb (cat upchg)   │
│     promo_credit_to_ret = scan + coupon + mcb (dist upchg)  │
│                                                             │
│  5. Trade spend build-up                                    │
│     retailer_working = promo spend + edlp + fixed + brick   │
│     non_working      = gross × (t&s% + dist% + digital%     │
│                        + other%)                            │
│     total_spend      = retailer_working + non_working       │
│                        + slotting                           │
│                                                             │
│  6. Profit layers                                           │
│     total_COGS           = total_units × COGS               │
│     profit_after_working = gross_sales − retailer_working   │
│                            − total_COGS                     │
│     profit_after_total   = above − non_working − slotting   │
│     net_sales            = gross_sales − total_spend        │
│                                                             │
│  7. Roll up: sum periods → annual; aggregate SKUs → account │
└──────────────────────────────┬──────────────────────────────┘
                               ▲
                               │
┌─────────────────────────────────────────────────────────────┐
│  USER INPUTS  (entered per scenario, per period P01–P12)    │
│                                                             │
│  Everyday Pricing              Promo Slot 1 & 2 (each)     │
│  ────────────────              ───────────────────────      │
│  ★ base_price (retail)         ★ price_promo               │
│  ★ gross_price (to dist)       ★ weeks_event_promo          │
│    edlp_direct ($/unit)        ★ scan_promo ($/unit BB)     │
│    edlp_mcb_pct                ★ lift_promo (% above base)  │
│    price_impact_manual         ★ fixed_promo (lump fee)     │
│    misc_impact_pct               mcb_promo_pct              │
│                                  coupon_discount / cost     │
│  ★ = drives most scenario        coupon_redemption_pct      │
│      variation                   admin_promo ($/unit)       │
│                                  buyout_weeks / amount      │
│                                  brick_promo (lump sum)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  OUTPUTS  (computed per period + annual total)              │
│                                                             │
│  Volume          Revenue & Spend       Profit               │
│  ──────          ─────────────────     ──────               │
│  Total units     Gross sales           Profit after         │
│  Base units      Net sales               working spend      │
│  Promo units     Total spend           Profit after         │
│                  Retailer working        total spend        │
│                  Non-working spend                          │
│                  Slotting                                   │
│                  All-in trade rate                          │
│                                                             │
│  Retail                                                     │
│  ──────          Promo Analytics                            │
│  Retail $        ─────────────                              │
│  Retail margin   Promo efficiency                           │
│  Retail margin % Promo ROI                                  │
└─────────────────────────────────────────────────────────────┘
```

Scenario comparison re-runs the Model Engine for each saved scenario against the same Configuration, then diffs the Outputs.  
Full formula details: `DAP_METHODOLOGY.md §4` | Field index: `packages/engine/dap-reference.json`

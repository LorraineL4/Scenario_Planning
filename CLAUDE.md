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
  └── Saved scenarios (inputs + computed outputs)
        inputs include acv_pct, velocity, slotting ×12 — combined to produce dist_baseline
```

## Phased Delivery

| Phase | Scope |
|---|---|
| MVP | Single account, single SKU, 8 key inputs, save + compare 2–3 scenarios |
| V2 | Multi-SKU rollup, clone scenarios, delta charts, consultant + client roles |
| V3 | Sensitivity sliders, what-if analysis, export to Excel/PPT |

## How It Works

The app separates data into three layers:

| Layer | What it is | Examples |
|---|---|---|
| **Configuration** | Set once per engagement, shared across all scenarios | Account name, # of stores, T&S %, distributor, COGS, case count, seasonality ×12, sales rates, net sales trade definition |
| **User Inputs** | Entered per scenario, per period (P01–P12) | `acv_pct`, `velocity`, `base_price`, `gross_price`, `scan_promo`, `weeks_event_promo`, `lift_promo`, `fixed_promo`, `slotting` |
| **Outputs** | Computed by the engine from Configuration + Inputs | Total units, gross sales, net sales, retailer working spend, non-working spend, profit after working, profit after total |

The ★ inputs (`acv_pct`, `velocity`, `base_price`, `gross_price`, and the promo slot fields) drive most scenario variation. The rest are refinements.

Scenario comparison re-runs the engine for each saved scenario against the same Configuration, then diffs the Outputs.  
Full formula details: `DAP_METHODOLOGY.md §4` | Field index: `packages/engine/dap-reference.json`

## Version Control

**Branch strategy**
- Work directly on `main` for small, low-risk changes (docs, config, single-file edits)
- Create a feature branch for anything spanning multiple files or taking more than one session:
  `git checkout -b feature/short-description`
- Merge back to `main` when the feature is working and tested

**Commit conventions**
- Commit at logical checkpoints, not after every file save
- Message format: `<verb> <what>` — e.g.:
  - `Add volume calculation to DAP engine`
  - `Fix scan promo formula for multi-week events`
  - `Update seasonality coefficients for WFM account`
- Keep messages under 72 characters

**Never commit**
- Any `.xlsx` / `.xls` files (client data)
- `.env` files or files containing API keys, DB passwords, or connection strings
- `data/raw/` — this is gitignored; keep it that way

**Push policy**
- Always ask before pushing to GitHub unless explicitly told to push
- Never force-push to `main`

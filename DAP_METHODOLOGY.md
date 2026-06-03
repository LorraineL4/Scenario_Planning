# DAP Methodology Reference

Extracted from `260413 - WFM_CORP - DAP.xlsx` (Whole Foods Market account).  
**Do not re-read the original Excel.** This document is the authoritative reference.  
Machine-readable structure: `packages/engine/dap-reference.json`

---

## 1. Workbook Overview

| Sheet | Type | Purpose |
|---|---|---|
| Account Info | Input | Account-level rates and configuration |
| Distribution | Input | Per-SKU velocity, pipeline, and slotting by period (ACV % moved to scenario input) |
| Sales Rates | Lookup | Channel × Product × Price Point → Sales Rate + Elasticity |
| `[Product Group]` (~40 sheets) | Calc | Per-SKU financial model for 12 fiscal periods |
| Total | Aggregation | Flat DB pulling every metric from every PG sheet |
| Account Roll-up | Output | Monthly P&L across all SKUs (SUMIFS on Total) |
| Trade Summary | Output | Cross-SKU trade spend breakdown |
| PG Summary | Output | Per-SKU summary |
| Distribution Summary | Output | Distribution / pipeline rollup |
| Promo Calendar | Output | Visual promo event calendar by month |
| Helpers | Reference | Row/column index, price rounding bands, scenario labels |
| Sales Rates | Reference | 527-row lookup table |
| Scenario (alpha) | Prototype | Lightweight scenario comparison (being replaced) |
| Fixed Fee Calculator | Utility | Allocates lump fees across SKUs by gross sales share |
| Check | Utility | Validation / error-checking |

### Fiscal Calendar

- Fiscal year: **July (P01) → June (P12)**
- Week pattern: **4/4/5** repeating (P01=4wk, P02=4wk, P03=5wk, …)
- Total: 52 weeks (53-week years handled separately)
- PG sheet columns: E=P01, F=P02, G=P03, H=P04, I=P05, J=P06, K=P07, L=P08, M=P09, N=P10, O=P11, P=P12, Q=P13, R=P14, S=P15, **T=Annual Total**

---

## 2. Account Info Inputs

Sheet: `Account Info`

| Cell | Field | Description |
|---|---|---|
| D3 | Account Name | e.g., "WFM_CORP" |
| D4 | Sales Manager | Rep name |
| D5 | Sales Channel | e.g., "WFM" — maps to channel in Sales Rates lookup |
| D6 | Pricing Strategy | e.g., "EDLC, High/Low" |
| D7 | Primary Distributor | e.g., "UNFI" |
| D8 | Secondary Distributor | Optional |
| D12 | Number of Stores | Used for pipeline and velocity calculations |
| D13 | Terms/Spoils % | Non-working trade rate applied to Gross Sales (e.g., 4.6%) |
| D14 | Distributor Program % | e.g., 6% ClearVue-type program applied to Gross Sales |
| D15 | Digital Sales Program % | Applied to Gross Sales |
| D16 | Other Program % | Applied to Gross Sales |
| G4 | TPR Fee | Fixed $ per TPR event |
| G5 | Length of TPR (weeks) | Default weeks per TPR event |
| G6 | Ad Fee | Fixed $ per ad event |
| G7 | Length of Ad (weeks) | Default weeks per ad |
| G8 | Min % to execute deal | Threshold ACV % for a promo to count |
| G9 | Can execute scans? | Yes/No flag |

---

## 3. Product Group Sheet Structure

Each of the ~40 PG sheets is identical in structure: **237 rows × 36 columns**.

### Row Map — Inputs

#### Everyday Pricing (rows 10–31)

| Row | Field Code | Description | Data Type |
|---|---|---|---|
| 7 | `seasonality` | Seasonality index per period (12 values, pre-set) | Decimal (e.g., 1.019) |
| 10 | `base_price` | Everyday retail shelf price | Currency |
| 11 | `gross` | Gross price — manufacturer's invoice to distributor | Currency |
| 12 | `edlp` | EDLP/EDLC subsidy: direct $ per unit everyday allowance | Currency |
| 13 | `price_impact` | Manual price change impact % override (overrides auto-calc) | % or blank |
| 15 | `upcharge_dist` | Distributor upcharge % (e.g., 8%) | % |
| 23 | `upcharge_cat` | Catalog upcharge % — full retailer markup (e.g., 48%) | % |
| 25 | `edlp_mcb` | MCB % for distributor on everyday pricing | % |
| 31 | `misc_impact` | Miscellaneous volume impact % (catch-all modifier) | % |

#### Promotion Slot 1 (rows 35–62)

| Row | Field Code | Description | Data Type |
|---|---|---|---|
| 35 | `name_promo1` | Event name (e.g., "20% TPR B") | Text |
| 36 | `price_promo1` | Promotional retail price per unit | Currency |
| 37 | `weeks_event_promo1` | Weeks on promo this period | Integer (0–5) |
| 38 | `scan_promo1` | Bill-Back / Scan $ per unit | Currency |
| 39 | `fixed_promo1` | Fixed fee per event (lump sum) | Currency |
| 40 | `lift_promo1` | Expected lift % above baseline (e.g., 1.29 = 129%) | Decimal |
| 42 | `notes_promo1` | Promo depth % for calendar display (e.g., 0.20 = 20% off) | % |
| 51 | `mcb_promo1` | MCB % distributor on promo | % |
| 55 | `coupon_discount_promo1` | Coupon credit to retailer per unit | Currency |
| 56 | `coupon_cost_promo1` | Coupon cost to manufacturer per unit | Currency |
| 57 | `coupon_red_promo1` | Coupon redemption rate % | % |
| 58 | `admin_promo1` | Admin fee per unit | Currency |
| 59 | `buyout_weeks_promo1` | Buyout weeks (weeks of baseline to buy forward) | Integer |
| 60 | `buyout_amount_promo1` | Buyout trade $ per unit | Currency |
| 62 | `brick_promo1` | Lump sum brick amount | Currency |

#### Promotion Slot 2 (rows 66–93)

Same field structure as Promo 1. Field codes use `_promo2` suffix.

| Row | Field Code |
|---|---|
| 66 | `name_promo2` |
| 67 | `price_promo2` |
| 68 | `weeks_event_promo2` |
| 69 | `scan_promo2` |
| 70 | `fixed_promo2` |
| 71 | `lift_promo2` |
| 73 | `notes_promo2` |
| 82 | `mcb_promo2` |
| 86 | `coupon_discount_promo2` |
| 87 | `coupon_cost_promo2` |
| 88 | `coupon_red_promo2` |
| 89 | `admin_promo2` |
| 90 | `buyout_weeks_promo2` |
| 91 | `buyout_amount_promo2` |
| 93 | `brick_promo2` |

#### COGS & Pack Size (rows 147–148)

| Row | Field Code | Description |
|---|---|---|
| 147 | `cogs` | Cost of Goods per unit |
| 148 | `case_count` | Units per case (for standard case conversion) |

#### Distribution (scenario input)

| Field Code | Description | Data Type |
|---|---|---|
| `acv_pct` | ACV distribution % per period (P01–P12). Drives `TDP = acv_pct × number_of_stores` | % per period |

### Row Map — Outputs / Calculated Fields

#### Volume (rows 96–106)

| Row | Metric | Formula (plain English) |
|---|---|---|
| 96 | Standard Cases | `Unit_Sales / case_count` |
| 97 | Unit Sales | `Non_Promo_Units + Promo_Units` (both slots) |
| 98 | Baseline (Price Chng only) | `Dist_Baseline × (1 + Price_Elasticity_Impact%)` |
| 99 | Baseline (TDP Chng only) | TDP-adjusted baseline pulled from Distribution sheet via SUMIFS |
| 100 | Baseline (TDP + Price + Seasonal) | `Dist_Baseline × (1 + Price_Elasticity_Impact%) × (1 + Misc_Impact%) × Seasonality_Index` |
| 101 | Promo Units | `(weeks_promo1 × Baseline × (1 + lift_promo1)) + (weeks_promo2 × Baseline × (1 + lift_promo2))` |
| 102 | Non-Promo Units | `(Weeks_in_Period − weeks_promo1 − weeks_promo2) × Baseline` |
| 103 | Incremental Units | `(weeks_promo1 × Baseline × lift_promo1) + (weeks_promo2 × Baseline × lift_promo2)` |
| 104 | Base Units | `Non_Promo_Units + (Promo_Units − Incremental_Units)` |
| 105 | Velocity Plus Up | `Incremental_Units / Base_Units` |
| 106 | Pipeline Units | New distribution pipeline volume from Distribution sheet |

#### Revenue (rows 108–110)

| Row | Metric | Formula |
|---|---|---|
| 108 | Gross Sales | `Unit_Sales × gross_price` |
| 109 | Incremental Gross | `Incremental_Units × gross_price` |
| 110 | Base Gross | `Base_Units × gross_price` |

#### COGS (row 112)

| Row | Metric | Formula |
|---|---|---|
| 112 | Cost of Goods | `Unit_Sales × cogs` |

#### Spend (rows 116–126)

| Row | Metric | Formula |
|---|---|---|
| 116 | Total Spend (Pricing + Promo) | Sum of all retailer-facing spend: EDLP + scans + MCB + fixed + brick |
| 117 | Incremental Spend | Spend attributable to promo incremental volume |
| 118 | Base Spend | `Base_Units × edlp_cost_per_unit` |
| 119 | Admin Fee Spend | `Promo_Units × (admin_promo1 + admin_promo2)` — excluded from retailer margin |
| 120 | Slotting (Prob-Weighted) | Pulled from Distribution sheet, probability-weighted |
| 121 | Total Fixed | `fixed_promo1 + fixed_promo2` (per event) |
| 122 | Total Brick | `brick_promo1 + brick_promo2` |
| 123 | Activity Spend | Per-unit promo spend × promo units + fixed fees |
| 124 | Everyday Spend | `Total_Units × edlp_cost_per_unit` |
| 125 | Buyout Spend | `buyout_weeks × Baseline × buyout_amount_per_unit` |
| 126 | Retailer Working T:S | `Retailer_Working_Spend / Gross_Sales` |

#### Profit (rows 128–132)

| Row | Metric | Formula |
|---|---|---|
| 128 | Profit After Working Spend | `(Base_Profit + Incremental_Profit) − Brick − Distributor_Working − Digital − Other` |
| 129 | Promo Profit | `Promo_Units × (Base_Profit_per_Unit − Per_Unit_Promo_Spend − Admin) − Fixed_Fee` |
| 130 | Base Profit | `Base_Units × (gross_price − edlp_cost_per_unit − cogs)` |
| 131 | Incremental Profit After Trade | `Incremental_Gross − Incremental_COGS − Incremental_Spend` |
| 132 | Profit Per Unit After Spend | `Profit_After_Working_Spend / Unit_Sales` |

#### Retail Metrics (rows 134–144)

| Row | Metric | Formula |
|---|---|---|
| 134 | Total Retail Dollars | `Promo_Retail_$ + Non_Promo_Retail_$` |
| 138 | Total Retail Margin | `Promo_Retail_Margin_$ + Non_Promo_Retail_Margin_$` |
| 141 | Retail Margin % | `Total_Retail_Margin / Total_Retail_Dollars` |
| 143 | TDPs (Prob-Weighted) | From Distribution sheet — probability-weighted TDP count |
| 144 | TDPs (100% Probability) | From Distribution sheet — hard TDP count |

#### Account-Rate Spend (rows 194–202)

| Row | Metric | Formula |
|---|---|---|
| 194 | Distributor Working Spend | `Gross_Sales × Distributor_Program%` (from Account Info D14) |
| 195 | Digital Sales Spend | `Gross_Sales × Digital_Sales%` (from Account Info D15) |
| 196 | Other Spend | `Gross_Sales × Other%` (from Account Info D16) |
| 197 | Terms & Spoils Spend | `Gross_Sales × T&S%` (from Account Info D13) — non-working |
| 198 | Retailer Working Spend | `Other + Digital + Total_Spend_(Pricing_Promo)` |
| 199 | Total Working + Distributor | `Retailer_Working + Distributor_Working` |
| 200 | Total Spend (All) | `Distributor + Digital + Other + T&S + Slotting + Retailer_Working` |
| 201 | Profit After Total Spend | `Profit_After_Working_Spend − T&S − Slotting` |
| 202 | Profit After Promo & Pricing | `Base_Profit + Incremental_Profit − Brick` |

---

## 4. Core Formula Logic

### 4.1 Baseline Volume

```
Baseline(period) = Distribution_Baseline(period)
                 × (1 + Price_Elasticity_Impact%)
                 × (1 + Misc_Impact%)
                 × Seasonality_Index(period)
```

`Distribution_Baseline = velocity × TDP`, where:
- **velocity** — per-store sales rate per SKU; scenario input (Distribution tab col L), entered per scenario
- **TDP** = `scenario_acv_pct × number_of_stores` — TDP is scenario-specific because `acv_pct` is a user input entered per scenario per period

**Price Elasticity Impact (row 14 / 191):**
- If `price_impact` (row 13) is manually entered → use that value directly
- Otherwise, auto-calc: `(New_EDP / Current_EDP) ^ Elasticity − 1`
- `Elasticity` (row 220) = observed elasticity if sales rate data exists, else constant elasticity from Sales Rates table
- Observed elasticity: `LN(new_rate / current_rate) / LN(new_price / current_price)`

### 4.2 Promo Volume

```
Promo_Units(p)       = weeks_promo1(p) × Baseline(p) × (1 + lift_promo1)
                     + weeks_promo2(p) × Baseline(p) × (1 + lift_promo2)

Incremental_Units(p) = weeks_promo1(p) × Baseline(p) × lift_promo1
                     + weeks_promo2(p) × Baseline(p) × lift_promo2

Non_Promo_Units(p)   = (Weeks_in_Period(p) − weeks_promo1(p) − weeks_promo2(p)) × Baseline(p)

Total_Units(p)       = Non_Promo_Units(p) + Promo_Units(p)
```

### 4.3 Everyday Net Unit Cost (row 18)

```
MCB_Credit           = edlp_mcb% × gross_price × (1 + upcharge_dist%)
Everyday_Net_Cost    = gross_price × (1 + upcharge_dist%) − edlp_direct_$ − MCB_Credit
```

### 4.4 Everyday Retail Margin (row 19)

```
Everyday_Retail_Margin% = 1 − (Everyday_Net_Cost / base_price)
```

### 4.5 Per-Unit Promo Spend — Cost to Manufacturer (row 152)

```
MCB_Cost             = mcb_promo% × gross_price × (1 + upcharge_cat%)   ← CATALOG upcharge
Per_Unit_Promo_Cost  = scan_promo + (coupon_cost × coupon_redemption%) + MCB_Cost
```

### 4.6 Per-Unit Credit to Retailer (row 169)

```
MCB_Credit_Promo     = mcb_promo% × gross_price × (1 + upcharge_dist%)  ← DISTRIBUTOR upcharge
Per_Unit_Credit      = scan_promo + (coupon_discount × coupon_redemption%) + MCB_Credit_Promo
```

> These two are different amounts. Cost to manufacturer > credit to retailer when catalog upcharge > distributor upcharge (which is always the case).

### 4.7 Promo Retail Margin (row 45)

```
Promo_Net_Cost       = Everyday_Net_Cost − Per_Unit_Credit_to_Retailer
Effective_Promo_Price = price_promo − (coupon_discount × coupon_redemption%)
Promo_Retail_Margin% = 1 − (Promo_Net_Cost / Effective_Promo_Price)
```

### 4.8 Promo Efficiency and ROI (rows 47–48)

```
Efficiency = Incremental_Gross / Incremental_Spend
ROI        = Incremental_Profit_After_Trade / Incremental_Spend
```

### 4.9 Trade Spend Build-up

```
Retailer_Working_Spend = (Promo_Units × Per_Unit_Promo_Cost)
                       + (Promo_Units × admin_promo)         ← admin excluded from margin %
                       + (Total_Units × edlp_direct_$)
                       + fixed_promo
                       + buyout_spend
                       + brick

Buyout_Spend           = buyout_weeks × Baseline × buyout_amount_per_unit

Distributor_Working    = Gross_Sales × Distributor_Program%
Digital_Sales_Spend    = Gross_Sales × Digital_Sales%
Other_Spend            = Gross_Sales × Other%
T&S_Spend              = Gross_Sales × T&S%

Total_Spend            = Retailer_Working + Distributor_Working + Digital_Sales
                       + Other + T&S + Slotting
```

### 4.10 Profit Layers

```
Base_Profit_per_Unit          = gross_price − edlp_cost_per_unit − cogs
Base_Profit                   = Base_Units × Base_Profit_per_Unit
Incremental_Profit_After_Trade = Incremental_Gross − (Incremental_Units × cogs) − Incremental_Spend
Profit_After_Working_Spend    = Base_Profit + Incremental_Profit_After_Trade
                               − brick − Distributor_Working − Digital − Other
Profit_After_Total_Spend      = Profit_After_Working_Spend − T&S − Slotting
Net_Sales                     = Gross_Sales − Defined_Trade

Defined_Trade = sum of components in Config.net_sales_trade_components.
Default includes all six (retailer_working_spend, distributor_working,
digital_sales_spend, other_spend, terms_spoils_spend, slotting),
which equals Total_Spend. Total_Spend is always computed and drives
allin_trade_rate_pct regardless of this setting.
```

---

## 5. Sales Rates Lookup Table

Sheet: `Sales Rates` (527 rows)

| Column | Field | Description |
|---|---|---|
| A | Channel of Trade | e.g., WFM, Food, Mass, Natural |
| B | Product Group | Matches PG sheet name |
| C | Rounding Type | D / Q / H / Do (see §6) |
| D | Price Point | Rounded price used as lookup key |
| E | Sales Rate | Normalized volume index at this price (1.0 = base rate) |
| F | Constant Elasticity | Fixed elasticity coefficient (e.g., −0.96) |

**Usage:** `SUMIFS(sales_rates[Sales Rate], [Product Group], PG_name, [Price Point], rounded_price, [Channel], channel)`

---

## 6. Price Rounding Logic

Before looking up the sales rate, the input price is rounded by type:

| Code | Rule | Excel equivalent |
|---|---|---|
| D (Dimes) | Round to nearest dime, subtract $0.01 | `MROUND(price, 0.1) − 0.01` |
| Q (Quarters) | Round to nearest quarter-band, subtract $0.01 | VLOOKUP against Helpers quarters table |
| H (Halves) | Round to nearest half-dollar, subtract $0.01 | `MROUND(price, 0.5) − 0.01` |
| Do (Dollars) | Round to nearest dollar, subtract $0.01 | `MROUND(price, 1) − 0.01` |

---

## 7. Distribution Sheet Structure

One row per SKU. Key columns:

| Column Range | Data |
|---|---|
| A | SKU / Product Group name |
| AV–BH | Oracle probability-weighted ACV by period |
| AD | New distribution change probability |
| AF | Cases per Store (for pipeline calc) |
| AG | Pipeline lead time (periods) |
| AI | New Stores count |
| AJ | Units per Case |
| AM | Slotting lump sum $ |
| AN | Slotting per store $ |
| AO | Cases per Store for slotting |

**Velocity** (`Distribution[velocity]`, col L) — per-store sales rate per SKU; scenario input, entered per scenario alongside `acv_pct`.  
**Slotting** (`Distribution[slotting_lump_sum]`, col AM) — lump sum per period; scenario input.  
**TDP calc:** `TDP = scenario_acv_pct × Number_of_Stores`  
**Distribution Baseline:** `velocity[sku] × TDP`

---

## 8. Aggregation Flow

```
PG Sheets (per SKU, per period)
  │  every metric row × period column → value
  ▼
Total Sheet (flat DB, ~15,988 rows)
  │  each row = (PG × Metric × Period → value)
  │  populated by direct cell references to PG sheets
  ▼
Account Roll-up (monthly P&L)
  │  SUMIFS(Total, [Metric], metric_name, [Period], period)
  ▼
Trade Summary / PG Summary / Distribution Summary
  (further SUMIFS on Account Roll-up or Total)
```

---

## 9. Ambiguities and Known Gaps

| Item | Status |
|---|---|
| Exact seasonality coefficients per SKU | Stored in PG sheet row 7; all current SKUs use the same Oils category pattern. FY28+ repeats FY27 pattern. |
| Promo 2 row numbers (66–93) | Inferred as mirror of Promo 1 (35–62); confirm against actual file if row offset differs |
| Pipeline volume formula | Pulled from Distribution sheet; exact SUMIFS formula not confirmed |
| Quarters rounding lookup table | Stored in Helpers columns A–B; boundary values not fully extracted |
| Fixed Fee Calculator allocation | Proportional to baseline gross sales share across SKUs; used for lump-sum events |
| Scenario (alpha) sheet logic | Not replicated — being replaced by this web app |
| **COR Marinade** extraction | ACV is 0 in scenario cols (P–AB) for all items — data may live in oracle-weighted ACV cols (AV–BH). Engine produces all-zero output for this PG when extracted from Excel. Does not affect web app (users enter ACV directly). |
| **COR Vinaigrette Dressing** extraction | Engine over-counts baseline by ~8.5% — some Distribution rows appear to be placeholder/scenario rows that the Excel formula excludes. Root cause not yet identified. Does not affect web app. |
| **Lucini Everyday EVOO 1L** extraction | Single-row PG but ~1.5% systematic gap vs Excel. Likely a minor velocity source difference. Does not affect web app. |


## 10. Slotting Allocation Methodology

Slotting is extracted from the Distribution sheet as a single annual lump sum per SKU (`slotting_lump_sum`, col AM). The engine requires a per-period value. Allocation rule:

**Slotting is assigned to the period(s) where new distribution is added**, defined as any period where ACV% increases vs the prior period.

### Algorithm

1. Compute `delta[p] = max(0, acv_pct[p] − acv_pct[p−1])` for P02–P12. For P01, compare against 0 (no prior-year data available).
2. `total_delta = sum of all positive deltas`
3. `slotting[p] = (delta[p] / total_delta) × slotting_lump_sum`
4. If `total_delta = 0` (flat ACV all year) or `slotting_lump_sum = 0`, all periods receive `slotting = 0`.

### Examples

| Scenario | ACV pattern | Slotting allocation |
|---|---|---|
| New distribution mid-year | P01–P03 = 0%, P04 = 100% | 100% in P04 |
| Existing distribution, no change | P01–P12 = 80% (P01 delta = 80pp vs 0) | 100% in P01 |
| Two waves | P04: 0%→60%, P09: 60%→90% | 67% in P04, 33% in P09 |
| Declining ACV | P01 = 90%, P06 = 50% | No increase → slotting = 0 all periods |

### Rationale

Slotting is a fee paid to a retailer to secure shelf space for **new** store entries. Allocating it to the period where ACV increases ties the cost to the distribution event that triggers it, rather than spreading it arbitrarily across the year.

---

## Domain Vocabulary

| Term | Meaning |
|---|---|
| DAP | Account Planning Excel workbook (the source model) |
| PG / Product Group | A single SKU's planning sheet within the DAP |
| TDP | Total Distribution Points (stores × ACV%) |
| ACV | All Commodity Volume — distribution coverage % |
| T&S | Terms & Spoils — non-working trade (shrinkage, returns) |
| Scan / BB | Bill-Back — per-unit payment to retailer during a promo |
| MCB | Market Conduct Bill-back — distributor program funding |
| EDLP / EDLC | Every Day Low Price / Cost — everyday pricing subsidization |
| Working Trade | Spend tied directly to a consumer event (scan, display, ad) |
| Non-Working Trade | Spend not tied to an event (T&S, distributor programs) |
| Gross Price | Manufacturer's invoice price to distributor (not shelf price) |
| Net Sales | Gross Sales − Defined Trade (sum of trade components selected by Config.net_sales_trade_components; defaults to all six = Total Spend) |
| Lift % | Volume uplift above baseline during a promo |
| Baseline | Expected velocity with no promo, adjusted for price + seasonality |

## Critical Model Rules

- **MCB has two upcharge perspectives** — credit to retailer uses distributor upcharge (~8%); cost to manufacturer uses catalog upcharge (~48%). Never mix them. See `DAP_METHODOLOGY.md`.
- **Admin fees are excluded from retailer margin %** but do reduce manufacturer profit.
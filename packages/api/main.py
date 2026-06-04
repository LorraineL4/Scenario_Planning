from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Dict, List, Optional
import io
import json
import re
import sys
import tempfile
import shutil

REPO_ROOT  = Path(__file__).resolve().parent.parent.parent
ENGINE_DIR = REPO_ROOT / "packages" / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from extract_config import extract as extract_config
from extract_inputs import extract as extract_inputs
from run_account import run_account
from write_dap import write_dap

app = FastAPI(title="Scenario Planning API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/dev-data")
async def dev_data():
    path = REPO_ROOT / "data" / "processed" / "dev_data.json"
    if not path.exists():
        raise HTTPException(404, "dev_data.json not found — run: python packages/api/gen_dev_data.py <DAP.xlsx>")
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


@app.post("/api/extract")
async def extract_workbook(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported.")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        config  = extract_config(tmp_path)
        inputs  = extract_inputs(tmp_path)
        results = run_account(config, inputs)
    except Exception as e:
        raise HTTPException(422, str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    # Persist for /api/compute
    processed_dir = REPO_ROOT / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    (processed_dir / "config.json").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    (processed_dir / "inputs.json").write_text(json.dumps(inputs, ensure_ascii=False), encoding="utf-8")

    _add_account_periods(results)

    return {
        "fiscal_calendar": config.get("fiscal_calendar", {}),
        "account":         inputs.get("account", {}),
        "skus":            _merge_skus(config.get("skus", {}), inputs.get("skus", {})),
        "results":         results,
    }


def _add_account_periods(results: dict) -> None:
    """Roll up per-period gross_sales and unit_sales across all SKUs."""
    period_totals: dict = {}
    for sku_data in results.get("skus", {}).values():
        for p, row in sku_data.get("periods", {}).items():
            if p not in period_totals:
                period_totals[p] = {"gross_sales": 0.0, "unit_sales": 0.0}
            period_totals[p]["gross_sales"] += row.get("gross_sales", 0) or 0
            period_totals[p]["unit_sales"]  += row.get("unit_sales",  0) or 0
    results["account_periods"] = period_totals


class DistributionRow(BaseModel):
    SKU_name: str
    unit_velocity: float
    months: dict          # {"Jul": 48.5, "Aug": 52.0, ...}  values 0–100
    dist_prob: float      # 0–100

class PricingPeriodOverride(BaseModel):
    base_price: Optional[float] = None
    gross_price: Optional[float] = None
    edlp_direct: Optional[float] = None
    price_impact_manual: Optional[float] = None
    upcharge_dist_pct: Optional[float] = None
    edlp_mcb_pct: Optional[float] = None

class PricingSkuOverride(BaseModel):
    sku_name: str
    periods: Dict[str, PricingPeriodOverride] = {}

class PromoCellOverride(BaseModel):
    promo_price: Optional[float] = None
    weeks: Optional[int] = None
    scan: Optional[float] = None
    fixed_fee: Optional[float] = None
    expected_lift: Optional[float] = None

class PromoSkuOverride(BaseModel):
    sku_name: str
    periods: Dict[str, Optional[PromoCellOverride]] = {}

class ComputeRequest(BaseModel):
    distribution_rows: Optional[List[DistributionRow]] = None
    pricing_rows: Optional[List[PricingSkuOverride]] = None
    promo_rows: Optional[List[PromoSkuOverride]] = None


@app.post("/api/compute")
async def compute_scenario(req: ComputeRequest):
    config_path = REPO_ROOT / "data" / "processed" / "config.json"
    inputs_path = REPO_ROOT / "data" / "processed" / "inputs.json"
    if not config_path.exists() or not inputs_path.exists():
        raise HTTPException(404, "No base data on server — upload a DAP file first.")

    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    inp = json.loads(inputs_path.read_text(encoding="utf-8"))

    # month abbreviation → period id  (e.g. "Jul" → "P01")
    month_to_period: dict = {}
    for period, info in cfg.get("fiscal_calendar", {}).items():
        m = (info.get("month") or "")[:3]
        if m:
            month_to_period[m] = period

    if req.distribution_rows:
        for row in req.distribution_rows:
            sku = inp.get("skus", {}).get(row.SKU_name)
            if not sku:
                continue
            # Save original velocity before overwriting — needed for ratio calculation below.
            orig_velocity = sku.get("velocity") or row.unit_velocity
            sku["velocity"] = row.unit_velocity
            periods = sku.get("periods", {})
            for month, pct in row.months.items():
                period = month_to_period.get(month[:3])
                if period and period in periods:
                    periods[period]["acv_pct"] = pct / 100.0
            prob = row.dist_prob / 100.0
            for p in sku.get("probability", {}):
                sku["probability"][p] = prob

            # Scale effective_velocity_by_period by the ratio of new ACV to original ACV.
            # This preserves the multi-item SUMPRODUCT structure from extract_inputs.py
            # rather than recomputing from a single-item simplified formula.
            if "effective_velocity_by_period" in sku:
                orig_acv = sku.get("acv_pct", {})
                vel_ratio = row.unit_velocity / orig_velocity if orig_velocity else 1.0
                for p, orig_eff_vel in sku["effective_velocity_by_period"].items():
                    new_acv = sku.get("periods", {}).get(p, {}).get("acv_pct")
                    orig = orig_acv.get(p, 0)
                    if new_acv is not None and orig > 0:
                        sku["effective_velocity_by_period"][p] = orig_eff_vel * vel_ratio * (new_acv / orig)
                    elif new_acv is not None:
                        sku["effective_velocity_by_period"][p] = orig_eff_vel * vel_ratio

    if req.pricing_rows:
        for row in req.pricing_rows:
            sku = inp.get("skus", {}).get(row.sku_name)
            if not sku:
                continue
            # upcharge_dist_pct is static per SKU — take from any period and write to static_inputs
            for pdata in row.periods.values():
                if pdata.upcharge_dist_pct is not None:
                    sku.setdefault("static_inputs", {})["upcharge_dist_pct"] = pdata.upcharge_dist_pct
                    break
            for period_id, pdata in row.periods.items():
                p = sku.get("periods", {}).get(period_id)
                if p is None:
                    continue
                if pdata.base_price          is not None: p["base_price"]          = pdata.base_price
                if pdata.gross_price         is not None: p["gross_price"]         = pdata.gross_price
                if pdata.edlp_direct         is not None: p["edlp_direct"]         = pdata.edlp_direct
                if pdata.price_impact_manual is not None: p["price_impact_manual"] = pdata.price_impact_manual
                if pdata.edlp_mcb_pct        is not None: p["edlp_mcb_pct"]        = pdata.edlp_mcb_pct

    if req.promo_rows is not None:
        # Promo block is active: clear all promo slots for all SKUs, then apply block
        for sku_data in inp.get("skus", {}).values():
            for p_data in sku_data.get("periods", {}).values():
                for slot in ("1", "2"):
                    p_data[f"name_promo{slot}"]         = None
                    p_data[f"price_promo{slot}"]        = None
                    p_data[f"weeks_event_promo{slot}"]  = None
                    p_data[f"scan_promo{slot}"]         = None
                    p_data[f"fixed_promo{slot}"]        = None
                    p_data[f"lift_promo{slot}"]         = None
        for row in req.promo_rows:
            sku = inp.get("skus", {}).get(row.sku_name)
            if not sku:
                continue
            for period_id, cell in row.periods.items():
                p = sku.get("periods", {}).get(period_id)
                if p is None or cell is None:
                    continue
                p["price_promo1"]       = cell.promo_price
                p["weeks_event_promo1"] = cell.weeks
                p["scan_promo1"]        = cell.scan
                p["fixed_promo1"]       = cell.fixed_fee
                p["lift_promo1"]        = (1.0 + cell.expected_lift / 100.0) if cell.expected_lift is not None else None

    try:
        results = run_account(cfg, inp)
    except Exception as e:
        raise HTTPException(422, str(e))

    _add_account_periods(results)
    at = results.get("account_total", {})

    # Weighted retailer margin and retail dollars from per-SKU period output
    total_gross, weighted_margin = 0.0, 0.0
    retail_dollars = 0.0
    for sku_data in results.get("skus", {}).values():
        for p_data in sku_data.get("periods", {}).values():
            gs = p_data.get("gross_sales") or 0
            margin = p_data.get("everyday_retail_margin_pct")
            if gs > 0 and margin is not None:
                weighted_margin += margin * gs
                total_gross += gs
            net_cost = p_data.get("everyday_net_cost") or 0
            if net_cost and margin is not None and margin < 100:
                retail_dollars += (p_data.get("unit_sales") or 0) * net_cost / (1 - margin / 100)

    # Average ACV from (possibly modified) period-level inputs
    total_acv, acv_count = 0.0, 0
    for sku_data in inp.get("skus", {}).values():
        for period_data in sku_data.get("periods", {}).values():
            v = period_data.get("acv_pct")
            if v is not None:
                total_acv += v
                acv_count += 1

    # Period-ordered chart data
    period_order = list(cfg.get("fiscal_calendar", {}).keys())
    acct_periods = results.get("account_periods", {})
    per = [
        {
            "grossSales": acct_periods.get(p, {}).get("gross_sales") or 0,
            "units":      acct_periods.get(p, {}).get("unit_sales")  or 0,
        }
        for p in period_order
    ]

    return {
        "grossSales":         at.get("gross_sales")               or 0,
        "tradeRate":          (at.get("allin_trade_rate_pct") or 0) / 100,
        "netSales":           at.get("net_sales")                 or 0,
        "totalSpend":         at.get("total_spend")               or 0,
        "totalUnits":         at.get("unit_sales")                or 0,
        "promoUnits":         at.get("promo_units")               or 0,
        "profitAfterTotal":   at.get("profit_after_total_spend")  or 0,
        "profitAfterWorking": at.get("profit_after_working_spend") or 0,
        "stores":             cfg.get("account", {}).get("number_of_stores") or 0,
        "acvPct":             (total_acv / acv_count) if acv_count > 0 else 0,
        "workingSpend":       (at.get("retailer_working_spend") or 0) + (at.get("distributor_working") or 0),
        "retailDollars":      retail_dollars,
        "retailMarginPct":    (weighted_margin / total_gross / 100) if total_gross > 0 else None,
        "per":                per,
    }


_PROMO_PERIOD_FIELDS = (
    "name_promo1", "price_promo1", "weeks_event_promo1",
    "scan_promo1", "fixed_promo1", "lift_promo1",
)

_PRICING_PERIOD_FIELDS = (
    "base_price", "gross_price", "edlp_direct", "edlp_mcb_pct", "price_impact_manual",
)


def _merge_skus(config_skus: dict, inputs_skus: dict) -> dict:
    result = {}
    for name in sorted(set(config_skus) | set(inputs_skus)):
        c   = config_skus.get(name, {})
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


@app.post("/api/writeback")
async def writeback_scenario(
    file: UploadFile = File(...),
    scenario_inputs: str = Form(...),
):
    """
    Accept a DAP .xlsx and a JSON scenario_inputs payload, write the scenario's
    distribution/pricing/promo values into the workbook, and stream the modified
    file back as a download.  Nothing is written to disk.
    """
    if not (file.filename or "").endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported.")

    try:
        inputs = json.loads(scenario_inputs)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Invalid scenario_inputs JSON: {exc}")

    source_bytes = await file.read()

    try:
        result_bytes = write_dap(source_bytes, inputs)
    except Exception as exc:
        raise HTTPException(422, str(exc))

    stem = Path(file.filename or "workbook").stem
    safe = re.sub(r'[\\/:*?"<>|]', "-", (inputs.get("scenario_name") or "scenario")).strip()
    out_name = f"{stem}-{safe}.xlsx"

    return StreamingResponse(
        io.BytesIO(result_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )

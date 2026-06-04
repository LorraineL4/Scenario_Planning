from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pathlib import Path
from typing import List, Optional
import json
import sys
import tempfile
import shutil

REPO_ROOT  = Path(__file__).resolve().parent.parent.parent
ENGINE_DIR = REPO_ROOT / "packages" / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from extract_config import extract as extract_config
from extract_inputs import extract as extract_inputs
from run_account import run_account

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

class ComputeRequest(BaseModel):
    distribution_rows: Optional[List[DistributionRow]] = None


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
            sku["velocity"] = row.unit_velocity
            periods = sku.get("periods", {})
            for month, pct in row.months.items():
                period = month_to_period.get(month[:3])
                if period and period in periods:
                    periods[period]["acv_pct"] = pct / 100.0
            prob = row.dist_prob / 100.0
            for p in sku.get("probability", {}):
                sku["probability"][p] = prob

            # effective_velocity_by_period is the baseline the engine actually reads.
            # Recompute it from the new velocity × acv_pct × probability so the
            # engine reflects the block's overrides rather than the extracted defaults.
            if "effective_velocity_by_period" in sku:
                for p, _ in sku["effective_velocity_by_period"].items():
                    acv = sku.get("periods", {}).get(p, {}).get("acv_pct", 0)
                    sku["effective_velocity_by_period"][p] = row.unit_velocity * acv * prob

    try:
        results = run_account(cfg, inp)
    except Exception as e:
        raise HTTPException(422, str(e))

    _add_account_periods(results)
    at = results.get("account_total", {})
    return {
        "grossSales": at.get("gross_sales")  or 0,
        "tradeRate":  (at.get("allin_trade_rate_pct") or 0) / 100,
        "netSales":   at.get("net_sales")    or 0,
        "totalSpend": at.get("total_spend")  or 0,
    }


def _merge_skus(config_skus: dict, inputs_skus: dict) -> dict:
    result = {}
    for name in sorted(set(config_skus) | set(inputs_skus)):
        c   = config_skus.get(name, {})
        inp = inputs_skus.get(name, {})
        result[name] = {
            "velocity":         inp.get("velocity"),
            "current_acv":      inp.get("current_acv"),
            "acv_pct":          inp.get("acv_pct", {}),
            "probability":      inp.get("probability", {}),
            "slotting_lump_sum":  inp.get("slotting_lump_sum"),
            "slotting_per_store": inp.get("slotting_per_store"),
            "seasonality":      c.get("seasonality", {}),
            "static_inputs":    c.get("static_inputs", {}),
        }
    return result

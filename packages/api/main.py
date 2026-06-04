from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
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

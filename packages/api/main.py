from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import sys
import tempfile
import shutil

ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE_DIR))

from extract_config import extract as extract_config
from extract_inputs import extract as extract_inputs

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


@app.post("/api/extract")
async def extract_workbook(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported.")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        config = extract_config(tmp_path)
        inputs = extract_inputs(tmp_path)
    except Exception as e:
        raise HTTPException(422, str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    return {
        "fiscal_calendar": config.get("fiscal_calendar", {}),
        "account":         inputs.get("account", {}),
        "skus":            _merge_skus(config.get("skus", {}), inputs.get("skus", {})),
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

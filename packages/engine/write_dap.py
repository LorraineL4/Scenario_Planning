"""
write_dap.py — Write a resolved scenario back into a DAP .xlsx workbook.

Writes only to the input cells the tool manages; never touches formula cells
or any cell outside scope.  Returns the modified workbook as raw bytes so
the API layer can stream it without touching the filesystem.

  scenario_inputs schema
  ----------------------
  {
    "fiscal_calendar": {
      "P01": {"month": "Jul", "col": "E", "weeks": 4}, ...
    },
    "scenario_name": "Conservative",
    "distribution": [
      {"SKU_name": "...", "unit_velocity": 2.576,
       "dist_prob": 100, "months": {"Jul": 99.52, ...}}
    ],
    "pricing": {
      "SKU Name": {"P01": {"base_price": 27.99, ...}, ...}
    },
    "promo": {
      "SKU Name|||P01": {
        "name": "20% TPR", "promo_price": 15.99, "weeks": 2,
        "scan": 3.03, "fixed_fee": 0, "expected_lift": 44
      }
    }
  }
"""
import io
import re
import time
import zipfile
import openpyxl
from openpyxl.utils import column_index_from_string

# ── Distribution sheet constants (mirror extract_inputs.py) ──────────────────
_DIST_COL_SKU_NAME   = 2   # B  (may be a HYPERLINK formula with data_only=False)
_DIST_COL_SKU_TEXT   = 3   # C  (plain-text copy of the SKU name, always readable)
_DIST_COL_VELOCITY   = 12  # L
_DIST_COL_ACV_P01    = 16  # P … AA  (P01–P12)
_DIST_COL_PROB_P01   = 74  # BV … CG (P01–P12)
_DIST_DATA_START_ROW = 7
_DIST_HEADER_KW = {"SKU", "PRODUCT", "ITEM", "NAME", "GROUP", "DESCRIPTION"}

# ── PG sheet row mapping (mirror extract_inputs.py PG_PERIOD_INPUTS) ─────────
_PG_ROWS = {
    # everyday pricing
    "base_price":               10,
    "gross_price":              11,
    "edlp_direct":              12,
    "price_impact_manual":      13,
    "edlp_mcb_pct":             25,
    "misc_impact_pct":          31,
    # promo slot 1
    "name_promo1":              35,
    "price_promo1":             36,
    "weeks_event_promo1":       37,
    "scan_promo1":              38,
    "fixed_promo1":             39,
    "lift_promo1":              40,   # Excel: multiplier (1.44); UI: % int (44)
    "mcb_promo1_pct":           51,
    "coupon_discount_promo1":   55,
    "coupon_cost_promo1":       56,
    "coupon_redemption_promo1": 57,
    "admin_promo1":             58,
    "buyout_weeks_promo1":      59,
    "buyout_amount_promo1":     60,
    "brick_promo1":             62,
    # promo slot 2
    "name_promo2":              66,
    "price_promo2":             67,
    "weeks_event_promo2":       68,
    "scan_promo2":              69,
    "fixed_promo2":             70,
    "lift_promo2":              71,
    "mcb_promo2_pct":           82,
    "coupon_discount_promo2":   86,
    "coupon_cost_promo2":       87,
    "coupon_redemption_promo2": 88,
    "admin_promo2":             89,
    "buyout_weeks_promo2":      90,
    "buyout_amount_promo2":     91,
    "brick_promo2":             93,
}

# UI promo fields mapped per slot. Keys are always "pg|||period|||1" or "pg|||period|||2".
_PROMO_SLOT_ROWS = {
    "1": {
        "name":          _PG_ROWS["name_promo1"],
        "promo_price":   _PG_ROWS["price_promo1"],
        "weeks":         _PG_ROWS["weeks_event_promo1"],
        "scan":          _PG_ROWS["scan_promo1"],
        "fixed_fee":     _PG_ROWS["fixed_promo1"],
        "expected_lift": _PG_ROWS["lift_promo1"],
    },
    "2": {
        "name":          _PG_ROWS["name_promo2"],
        "promo_price":   _PG_ROWS["price_promo2"],
        "weeks":         _PG_ROWS["weeks_event_promo2"],
        "scan":          _PG_ROWS["scan_promo2"],
        "fixed_fee":     _PG_ROWS["fixed_promo2"],
        "expected_lift": _PG_ROWS["lift_promo2"],
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "-", s).strip()


def _safe_write(ws, row: int, col: int, value) -> None:
    """Write value only if the cell is not a formula cell."""
    if value is None:
        return
    cell = ws.cell(row=row, column=col)
    if isinstance(cell.value, str) and cell.value.startswith("="):
        return
    cell.value = value


def _scan_sku_row_map(ws_dist) -> dict[str, int]:
    """Build SKU→row map from an already-open Distribution worksheet.

    Col B may contain a HYPERLINK formula (unreadable with data_only=False),
    so we fall back to col C which always holds the plain-text SKU name.
    This avoids opening the workbook a second time with data_only=True.
    """
    result: dict[str, int] = {}
    for row in ws_dist.iter_rows(min_row=_DIST_DATA_START_ROW):
        # Try col C (plain text) first; fall back to col B
        cell_c = row[_DIST_COL_SKU_TEXT - 1]
        cell_b = row[_DIST_COL_SKU_NAME - 1]
        raw = cell_c.value if isinstance(cell_c.value, str) else cell_b.value
        if not isinstance(raw, str) or not raw.strip():
            continue
        name = raw.strip()
        if any(kw in name.upper() for kw in _DIST_HEADER_KW):
            continue
        result.setdefault(name, cell_b.row)
    return result


def _strip_calc_chain(data: bytes) -> bytes:
    """Remove xl/calcChain.xml from the saved workbook so Excel rebuilds its
    calculation chain from scratch — prevents stale-chain formula errors."""
    buf = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data), "r") as zin:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename != "xl/calcChain.xml":
                    zout.writestr(item, zin.read(item.filename))
    return buf.getvalue()


# ── Main entry point ─────────────────────────────────────────────────────────

def write_dap(source_bytes: bytes, scenario_inputs: dict) -> bytes:
    """
    Apply *scenario_inputs* to the DAP workbook supplied as *source_bytes* and
    return the modified workbook as bytes (never touches the filesystem).

    # TODO: before writing, validate that the workbook's account name, SKU list,
    # and fiscal calendar match the scenario config.  For now we assume the user
    # has selected the correct file.
    """
    fiscal_calendar: dict = scenario_inputs.get("fiscal_calendar", {})
    periods = list(fiscal_calendar.keys())           # ordered P01 … P12
    period_col_offset = {p: i for i, p in enumerate(periods)}

    # month name → period code  (e.g. "Jul" → "P01")
    month_to_period = {
        info["month"]: p
        for p, info in fiscal_calendar.items()
        if info.get("month")
    }

    # period code → Excel column number on PG sheets  (from "col" letter)
    period_to_pg_col = {}
    for p, info in fiscal_calendar.items():
        col_letter = info.get("col")
        if col_letter:
            period_to_pg_col[p] = column_index_from_string(col_letter)

    t0 = time.time()
    distribution_rows: list = scenario_inputs.get("distribution") or []

    # ── Single workbook open (data_only=False preserves all formulas) ─────────
    wb = openpyxl.load_workbook(io.BytesIO(source_bytes), data_only=False)
    print(f"[write_dap] workbook loaded in {time.time()-t0:.1f}s ({len(source_bytes)//1024}KB, {len(wb.sheetnames)} sheets)")

    # Case-insensitive sheet name index
    sheet_index = {name.lower(): name for name in wb.sheetnames}

    # ── Build SKU → row map from col C (plain text, no second open needed) ────
    sku_row_map: dict[str, int] = {}
    if distribution_rows and "Distribution" in wb.sheetnames:
        sku_row_map = _scan_sku_row_map(wb["Distribution"])
        print(f"[write_dap] SKU row map: {len(sku_row_map)} entries")

    # ── 1. Distribution sheet ─────────────────────────────────────────────────
    if distribution_rows and "Distribution" in wb.sheetnames:
        ws_dist = wb["Distribution"]
        for dr in distribution_rows:
            sku_name = dr.get("SKU_name") or dr.get("sku_name", "")
            excel_row = sku_row_map.get(sku_name)
            if excel_row is None:
                continue

            # Velocity (col L)
            if dr.get("unit_velocity") is not None:
                _safe_write(ws_dist, excel_row, _DIST_COL_VELOCITY, dr["unit_velocity"])

            # ACV % (cols P–AA) and probability (cols BV–CG)
            months: dict = dr.get("months") or {}
            prob_decimal = (dr.get("dist_prob") or 100) / 100.0

            for month_name, acv_val in months.items():
                period = month_to_period.get(month_name)
                if period is None:
                    continue
                offset = period_col_offset.get(period)
                if offset is None:
                    continue
                # ACV as whole %
                _safe_write(ws_dist, excel_row,
                            _DIST_COL_ACV_P01 + offset, float(acv_val))
                # Probability (same value for every period from dist_prob)
                _safe_write(ws_dist, excel_row,
                            _DIST_COL_PROB_P01 + offset, prob_decimal)

    # ── 2. PG sheets — pricing fields ─────────────────────────────────────────
    pricing: dict = scenario_inputs.get("pricing") or {}
    for sku_name, period_data in pricing.items():
        actual_sheet = sheet_index.get(sku_name.lower())
        if actual_sheet is None:
            continue
        ws_pg = wb[actual_sheet]
        for period, fields in period_data.items():
            col = period_to_pg_col.get(period)
            if col is None:
                continue
            for field_key, row in _PG_ROWS.items():
                # Only write pricing rows (rows < 35 are everyday pricing)
                if row >= 35:
                    break
                val = fields.get(field_key)
                _safe_write(ws_pg, row, col, val)

    # ── 3. PG sheets — promo slot 1 ───────────────────────────────────────────
    promo: dict = scenario_inputs.get("promo") or {}
    for cell_key, promo_data in promo.items():
        parts = cell_key.split("|||")
        if len(parts) != 3:
            continue
        sku_name, period, slot = parts
        col = period_to_pg_col.get(period)
        if col is None:
            continue
        actual_sheet = sheet_index.get(sku_name.lower())
        if actual_sheet is None:
            continue
        ws_pg = wb[actual_sheet]

        row_map = _PROMO_SLOT_ROWS.get(slot)
        if row_map is None:
            continue

        for ui_field, excel_row in row_map.items():
            val = promo_data.get(ui_field)
            if val is None:
                continue
            # lift is stored as % integer in UI (44 → 1.44 in Excel)
            if ui_field == "expected_lift":
                val = 1.0 + float(val) / 100.0
            _safe_write(ws_pg, excel_row, col, val)

    # ── 4. Finalise and return bytes ──────────────────────────────────────────
    wb.calculation.fullCalcOnLoad = True
    t1 = time.time()
    out = io.BytesIO()
    wb.save(out)
    saved_bytes = out.getvalue()
    print(f"[write_dap] save: {time.time()-t1:.1f}s ({len(saved_bytes)//1024}KB)")
    t2 = time.time()
    result = _strip_calc_chain(saved_bytes)
    print(f"[write_dap] calcChain strip: {time.time()-t2:.1f}s  total: {time.time()-t0:.1f}s")
    return result

"""
write_dap.py — Write scenario inputs back to a DAP .xlsx workbook.

Only overwrites fields the app manages:
  - Distribution sheet: ACV % per period (cols P–AA, whole %)
  - PG sheets: promo slot 1 fields (rows 35–40) per period

Everything else in the workbook is untouched.
"""
import re
from pathlib import Path
import openpyxl

# Column constants — must match extract_inputs.py
_DIST_COL_SKU_NAME   = 2   # B — Product Group / item name
_DIST_COL_ACV_P01    = 16  # P = P01; Q = P02; … AA = P12
_DIST_DATA_START_ROW = 7
_DIST_HEADER_KEYWORDS = {"SKU", "PRODUCT", "ITEM", "NAME", "GROUP", "DESCRIPTION"}

# PG sheet rows — must match extract_inputs.py PG_PERIOD_INPUTS
_PG_COL_P01 = 5  # column E = P01
_PROMO1_ROWS = {
    "name":  35,
    "price": 36,
    "weeks": 37,
    "scan":  38,
    "fixed": 39,
    "lift":  40,  # Excel: multiplier (1.44); UI: percent integer (44)
}


def _safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', '-', s).strip()


def write_dap(
    source_xlsx: Path,
    scenario_name: str,
    distribution_rows: list,
    promo_grid: dict,
    fiscal_calendar: dict,
    output_dir: Path | None = None,
) -> Path:
    """
    Open *source_xlsx*, apply scenario inputs, save as
    ``<stem>-<scenario_name>.xlsx`` in *output_dir* (defaults to same dir).

    Parameters
    ----------
    distribution_rows
        List of dicts: ``{SKU_name, months: {month_name: acv_0_to_100}}``.
        ACV values are 0–100 whole percentages matching the Excel cell format.
    promo_grid
        Dict of ``"sku_name|||P01"`` → ``{name, promo_price, weeks, scan,
        fixed_fee, expected_lift}``.  ``expected_lift`` is a % integer (44 → 1.44).
    fiscal_calendar
        ``{"P01": {"month": "Jul", ...}, ...}``  — ordered dict, preserving
        fiscal year sequence so we can map month name → period → column offset.
    """
    wb = openpyxl.load_workbook(source_xlsx, data_only=False)

    # Build mapping helpers from the fiscal calendar (preserve insertion order = fiscal order)
    month_to_period  = {info["month"]: p for p, info in fiscal_calendar.items() if info.get("month")}
    period_col_offset = {p: i for i, p in enumerate(fiscal_calendar.keys())}

    # ── 1. Distribution sheet ──────────────────────────────────────────────────
    if distribution_rows and "Distribution" in wb.sheetnames:
        ws_dist = wb["Distribution"]

        # Map SKU/item name → Excel row number (first occurrence)
        sku_row: dict[str, int] = {}
        for row in ws_dist.iter_rows(min_row=_DIST_DATA_START_ROW):
            cell_b = row[_DIST_COL_SKU_NAME - 1]
            raw = cell_b.value
            if not isinstance(raw, str) or not raw.strip():
                continue
            name = raw.strip()
            if any(kw in name.upper() for kw in _DIST_HEADER_KEYWORDS):
                continue
            sku_row.setdefault(name, cell_b.row)

        for dr in distribution_rows:
            sku_name = dr.get("SKU_name") or dr.get("sku_name", "")
            excel_row = sku_row.get(sku_name)
            if excel_row is None:
                continue
            for month_name, acv_val in (dr.get("months") or {}).items():
                period = month_to_period.get(month_name)
                if period is None:
                    continue
                offset = period_col_offset.get(period)
                if offset is None:
                    continue
                ws_dist.cell(row=excel_row, column=_DIST_COL_ACV_P01 + offset).value = float(acv_val)

    # ── 2. PG sheets (promo slot 1) ────────────────────────────────────────────
    if promo_grid:
        # Build a case-insensitive sheet name lookup once
        sheet_map = {s.lower(): s for s in wb.sheetnames}

        for cell_key, promo in promo_grid.items():
            if "|||" not in cell_key:
                continue
            sku_name, period = cell_key.split("|||", 1)
            offset = period_col_offset.get(period)
            if offset is None:
                continue
            col = _PG_COL_P01 + offset

            actual_name = sheet_map.get(sku_name.lower())
            if actual_name is None:
                continue
            ws_pg = wb[actual_name]

            def _write(row, value):
                if value is not None:
                    ws_pg.cell(row=row, column=col).value = value

            _write(_PROMO1_ROWS["name"],  promo.get("name"))
            _write(_PROMO1_ROWS["price"], _float(promo.get("promo_price")))
            _write(_PROMO1_ROWS["weeks"], _int(promo.get("weeks")))
            _write(_PROMO1_ROWS["scan"],  _float(promo.get("scan")))
            _write(_PROMO1_ROWS["fixed"], _float(promo.get("fixed_fee")))
            if promo.get("expected_lift") is not None:
                _write(_PROMO1_ROWS["lift"], 1.0 + float(promo["expected_lift"]) / 100.0)

    # ── 3. Save ────────────────────────────────────────────────────────────────
    out_dir  = output_dir or source_xlsx.parent
    out_path = out_dir / f"{source_xlsx.stem}-{_safe_name(scenario_name)}.xlsx"
    wb.save(out_path)
    return out_path


def _float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _int(v):
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None

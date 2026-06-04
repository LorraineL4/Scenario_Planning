import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DAP_SAMPLE } from './dap-data.js';
import { parseDAP } from './dap-xlsx.js';

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = {
  vel: (n) => (Number(n) || 0).toFixed(2),
  acv: (n) => Math.round(Number(n) || 0).toString(),
  prob: (n) => Math.round(Number(n) || 0) + "%",
};
const clampACV = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/* diverging heatmap: 0 = Omnium red, 50 = white, 100 = Omnium navy */
const lerp = (a, b, t) => a + (b - a) * t;
function heatColor(v) {
  v = Math.max(0, Math.min(100, Number(v) || 0));
  const red = [247, 64, 58], white = [255, 255, 255], navy = [22, 87, 136];
  let c;
  if (v <= 50) { const t = v / 50; c = red.map((x, i) => lerp(x, white[i], t)); }
  else { const t = (v - 50) / 50; c = white.map((x, i) => lerp(x, navy[i], t)); }
  return c.map(Math.round);
}
/* perceived brightness (YIQ) — pick white text on dark fills */
const isDarkFill = ([r, g, b]) => (r * 299 + g * 587 + b * 114) / 1000 < 150;

/* ---------- editable cell ---------- */
function Cell({ value, display, edited, editing, onStart, onCommit, align, heat, readOnly, suffix }) {
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  const style = {};
  if (heat != null) {
    const rgb = heatColor(heat);
    style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    if (!edited) style.color = isDarkFill(rgb) ? "#ffffff" : "var(--ink)";
  }
  const cls = "cell num" + (align ? " " + align : "") + (edited ? " edited" : "") + (readOnly ? " ro" : "");
  if (editing) {
    return (
      <td className={cls} style={style}>
        <input
          ref={inputRef}
          className="cell-input"
          defaultValue={value}
          inputMode="decimal"
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(e.target.value); }
            else if (e.key === "Escape") { e.preventDefault(); onCommit(null); }
          }}
        />
      </td>
    );
  }
  return (
    <td className={cls} style={style} onClick={readOnly ? undefined : onStart} title={readOnly ? "" : "Click to edit"}>
      <span className="cell-val">{display}{suffix || ""}</span>
    </td>
  );
}

/* ---------- apply popover ---------- */
function ApplyPopover({ row, anchor, onApply, onClose }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("Dec");
  const [val, setVal] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  useEffect(() => {
    if (start && MONTHS.indexOf(end) < MONTHS.indexOf(start)) setEnd(start);
  }, [start]); // eslint-disable-line

  const valNum = parseFloat(val);
  const valid = start && !isNaN(valNum) && valNum >= 0 && valNum <= 100;

  const pos = useMemo(() => {
    if (!anchor) return { top: 80, left: 80 };
    const W = 268, H = 250, m = 8;
    let left = anchor.left - W - 10;
    if (left < m) left = anchor.right + 10;
    let top = anchor.top;
    if (top + H > window.innerHeight - m) top = window.innerHeight - H - m;
    if (top < m) top = m;
    return { top, left };
  }, [anchor]);

  const endOptions = MONTHS.filter((m) => !start || MONTHS.indexOf(m) >= MONTHS.indexOf(start));

  return (
    <div className="pop" ref={ref} style={{ top: pos.top, left: pos.left }}>
      <div className="pop-head">
        <div className="pop-title">Adjust ACV range</div>
        <button className="pop-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="pop-sku">{row.SKU_name}</div>

      <label className="pop-field">
        <span>Start month</span>
        <select value={start} onChange={(e) => setStart(e.target.value)}>
          <option value="" disabled>Select…</option>
          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>

      <label className={"pop-field" + (start ? "" : " disabled")}>
        <span>End month</span>
        <select value={end} disabled={!start} onChange={(e) => setEnd(e.target.value)}>
          {endOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>

      <label className="pop-field">
        <span>ACV value (0–100)</span>
        <input
          type="number" min="0" max="100" step="1" value={val}
          placeholder="e.g. 45"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) onApply(start, end, clampACV(valNum)); }}
        />
      </label>

      <button className="pop-apply" disabled={!valid} onClick={() => onApply(start, end, clampACV(valNum))}>
        Apply {start ? `${start}–${end}` : ""}
      </button>
    </div>
  );
}

/* ---------- main ---------- */
export default function App() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [edited, setEdited] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [popover, setPopover] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const dragDepth = useRef(0);

  const loadSample = useCallback(() => {
    const data = (DAP_SAMPLE || []).map((r) => ({ ...r, months: { ...r.months } }));
    setRows(data); setMeta({ sheet: "Sample data", count: data.length });
    setEdited(new Set()); setSearch(""); setCollapsed(new Set()); setErr(null);
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true); setErr(null);
    try {
      const buf = await file.arrayBuffer();
      const res = await parseDAP(buf);
      const data = res.rows.map((r) => ({ ...r, months: { ...r.months } }));
      setRows(data);
      setMeta({ sheet: res.sheet, count: data.length, file: file.name });
      setEdited(new Set()); setSearch(""); setCollapsed(new Set());
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onOver = (e) => { e.preventDefault(); };
    const onEnter = (e) => { e.preventDefault(); dragDepth.current++; setDragging(true); };
    const onLeave = (e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { setDragging(false); dragDepth.current = 0; } };
    const onDrop = (e) => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  const markEdited = (rowId, field) => setEdited((s) => { const n = new Set(s); n.add(rowId + "|" + field); return n; });

  const commitCell = (rowId, field, raw) => {
    setEditing(null);
    if (raw === null || raw === undefined) return;
    setRows((rs) => rs.map((r) => {
      if (r.id !== rowId) return r;
      const nr = { ...r };
      if (field === "unit_velocity") nr.unit_velocity = Math.max(0, parseFloat(raw) || 0);
      else if (field === "dist_prob") nr.dist_prob = Math.max(0, Math.min(100, Math.round(parseFloat(raw) || 0)));
      else if (field.startsWith("m:")) {
        const m = field.slice(2);
        nr.months = { ...r.months, [m]: clampACV(parseFloat(raw)) };
      }
      return nr;
    }));
    markEdited(rowId, field);
  };

  const applyRange = (rowId, start, end, value) => {
    const si = MONTHS.indexOf(start), ei = MONTHS.indexOf(end);
    setRows((rs) => rs.map((r) => {
      if (r.id !== rowId) return r;
      const months = { ...r.months };
      for (let i = si; i <= ei; i++) months[MONTHS[i]] = value;
      return { ...r, months };
    }));
    setEdited((s) => {
      const n = new Set(s);
      for (let i = si; i <= ei; i++) n.add(rowId + "|m:" + MONTHS[i]);
      return n;
    });
    setPopover(null);
  };

  const groups = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.SKU_name.toLowerCase().includes(q) || r.Product_Group.toLowerCase().includes(q))
      : rows;
    const order = [], map = new Map();
    for (const r of filtered) {
      if (!map.has(r.Product_Group)) { map.set(r.Product_Group, []); order.push(r.Product_Group); }
      map.get(r.Product_Group).push(r);
    }
    return order.map((g) => ({ name: g, rows: map.get(g) }));
  }, [rows, search]);

  const totalShown = groups.reduce((a, g) => a + g.rows.length, 0);
  const toggleGroup = (g) => setCollapsed((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const allCollapsed = rows && groups.length > 0 && groups.every((g) => collapsed.has(g.name));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(groups.map((g) => g.name)));
  };

  /* ----- landing (no data) ----- */
  if (!rows) {
    return (
      <div className={"landing" + (dragging ? " drag" : "")}>
        <div className="landing-card">
          <div className="brand-mark">DAP</div>
          <h1>Scenario Planner</h1>
          <p className="lede">Drop your DAP workbook (<code>.xlsx</code>) anywhere on this page to load and edit the distribution table.</p>
          {loading && <div className="status">Parsing workbook…</div>}
          {err && <div className="status err">{err}</div>}
          <div className="landing-actions">
            <label className="btn primary">
              Choose .xlsx file
              <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </label>
            <button className="btn ghost" onClick={loadSample}>Load sample data</button>
          </div>
        </div>
        <div className="drop-hint">Drop .xlsx to load</div>
      </div>
    );
  }

  /* ----- table view ----- */
  const popRow = popover ? rows.find((r) => r.id === popover.rowId) : null;

  return (
    <div className={"app" + (dragging ? " drag" : "")}>
      <header className="bar">
        <div className="bar-left">
          <div className="brand-mark sm">DAP</div>
          <div className="bar-titles">
            <div className="bar-title">Scenario Planner</div>
            <div className="bar-sub">{meta.file ? meta.file + " · " : ""}{meta.sheet} · {totalShown} of {rows.length} SKUs</div>
          </div>
        </div>
        <div className="bar-right">
          <div className="search">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" d="M10.5 3a7.5 7.5 0 105.3 12.8l5.2 5.2 1.4-1.4-5.2-5.2A7.5 7.5 0 0010.5 3z"/></svg>
            <input placeholder="Search SKU or product group…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-x" onClick={() => setSearch("")}>✕</button>}
          </div>
          <label className="btn sm">
            Load file
            <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
          </label>
        </div>
      </header>

      <div className="table-wrap">
        <table className="dap">
          <thead>
            <tr>
              <th className="sticky-l c-pg">Product Group</th>
              <th className="sticky-l c-sku">SKU Name</th>
              <th className="num">Unit<br/>Velocity</th>
              <th className="num">Current<br/>ACV</th>
              {MONTHS.map((m) => <th key={m} className="num c-mon">{m}</th>)}
              <th className="num">Dist<br/>Prob</th>
              <th className="sticky-r c-adj">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
                <React.Fragment key={g.name}>
                  {g.rows.map((r, ri) => (
                    <tr key={r.id} className={ri === 0 && gi > 0 ? "pg-start" : ""}>
                      <td className={"sticky-l c-pg pg-cell" + (ri === 0 ? " pg-lead" : "")}>{ri === 0 ? r.Product_Group : ""}</td>
                      <td className="sticky-l c-sku sku-cell">{r.SKU_name}</td>
                      <Cell
                        align="r" value={r.unit_velocity} display={fmt.vel(r.unit_velocity)}
                        edited={edited.has(r.id + "|unit_velocity")}
                        editing={editing && editing.rowId === r.id && editing.field === "unit_velocity"}
                        onStart={() => setEditing({ rowId: r.id, field: "unit_velocity" })}
                        onCommit={(v) => commitCell(r.id, "unit_velocity", v)}
                      />
                      <td className="cell num r ro acv-cur"><span className="cell-val">{fmt.acv(r.current_ACV)}</span></td>
                      {MONTHS.map((m) => (
                        <Cell
                          key={m} align="r" heat={r.months[m]}
                          value={r.months[m]} display={fmt.acv(r.months[m])}
                          edited={edited.has(r.id + "|m:" + m)}
                          editing={editing && editing.rowId === r.id && editing.field === "m:" + m}
                          onStart={() => setEditing({ rowId: r.id, field: "m:" + m })}
                          onCommit={(v) => commitCell(r.id, "m:" + m, v)}
                        />
                      ))}
                      <Cell
                        align="r" suffix="%" value={r.dist_prob} display={Math.round(r.dist_prob)}
                        edited={edited.has(r.id + "|dist_prob")}
                        editing={editing && editing.rowId === r.id && editing.field === "dist_prob"}
                        onStart={() => setEditing({ rowId: r.id, field: "dist_prob" })}
                        onCommit={(v) => commitCell(r.id, "dist_prob", v)}
                      />
                      <td className="sticky-r c-adj">
                        <button
                          className={"adj-btn" + (popover && popover.rowId === r.id ? " on" : "")}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPopover(popover && popover.rowId === r.id ? null : { rowId: r.id, anchor: rect });
                          }}
                        >Adjust ▾</button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            {totalShown === 0 && (
              <tr><td className="empty" colSpan={MONTHS.length + 5}>No SKUs match "{search}".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {popover && popRow && (
        <ApplyPopover
          row={popRow} anchor={popover.anchor}
          onApply={(s, e, v) => applyRange(popover.rowId, s, e, v)}
          onClose={() => setPopover(null)}
        />
      )}

      {dragging && <div className="drop-overlay"><div className="drop-overlay-inner">Drop .xlsx to load a new DAP</div></div>}
    </div>
  );
}

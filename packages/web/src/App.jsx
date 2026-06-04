import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseDAP } from './dap-xlsx.js';
import CompareView from './components/CompareView.jsx';
import ScenarioListView from './components/ScenarioListView.jsx';
import ScenariosView from './components/ScenariosView.jsx';
import ScenarioComposerView from './components/ScenarioComposerView.jsx';
import { Icon } from './components/ui.jsx';

// ─── helpers ───────────────────────────────────────────────────────────────

function devDataToRows(devData) {
  const cal = devData.fiscal_calendar || {}
  return Object.entries(devData.skus || {}).map(([name, sku], i) => {
    const months = {}
    Object.entries(cal).forEach(([period, info]) => {
      months[info.month] = Math.round((sku.acv_pct?.[period] || 0) * 100)
    })
    const periods = Object.keys(cal)
    return {
      id: `dev-${i}`,
      Product_Group: name,
      SKU_name: name,
      unit_velocity: sku.velocity || 0,
      current_ACV: Math.round((sku.current_acv || 0) * 100),
      months,
      dist_prob: Math.round((sku.probability?.[periods[0]] ?? 1.0) * 100),
    }
  })
}

// Transforms raw API response into a scenario object for the Compare view.
// All ratio/percent fields are stored as 0–1 decimals so delta chips work uniformly.
function buildBaseScenario(devData) {
  const { account, skus: inputSkus, results, fiscal_calendar } = devData
  const { account_total, account_periods, skus: resultSkus } = results || {}

  // Average ACV across all SKU-periods (already 0–1 in inputs)
  let totalAcv = 0, acvCount = 0
  for (const sku of Object.values(inputSkus || {})) {
    for (const v of Object.values(sku.acv_pct || {})) {
      totalAcv += v; acvCount++
    }
  }

  // Weighted retailer margin and promo ROI from period-level engine output
  let totalGross = 0, weightedMargin = 0
  let totalPromoUnits = 0, weightedPromoROI = 0
  for (const sku of Object.values(resultSkus || {})) {
    for (const p of Object.values(sku.periods || {})) {
      if (p.gross_sales > 0 && p.everyday_retail_margin_pct != null) {
        weightedMargin  += p.everyday_retail_margin_pct * p.gross_sales
        totalGross      += p.gross_sales
      }
      if (p.promo_units > 0 && p.promo_roi != null && isFinite(p.promo_roi)) {
        weightedPromoROI  += p.promo_roi * p.promo_units
        totalPromoUnits   += p.promo_units
      }
    }
  }

  // Period-ordered chart data
  const periodOrder = Object.keys(fiscal_calendar || {})
  const per = periodOrder.map(p => ({
    grossSales: account_periods?.[p]?.gross_sales || 0,
    units:      account_periods?.[p]?.unit_sales  || 0,
  }))

  const at = account_total || {}
  return {
    id:               's-base',
    name:             'Base Plan',
    tag:              'navy',
    note:             `${account?.account_name || ''} · ${account?.sales_channel || ''} · ${account?.primary_distributor || ''}`,
    stores:           account?.number_of_stores || 0,
    acvPct:           acvCount  > 0 ? totalAcv / acvCount        : 0,    // 0–1
    totalUnits:       at.unit_sales              || 0,
    promoUnits:       at.promo_units             || 0,
    grossSales:       at.gross_sales             || 0,
    netSales:         at.net_sales               || 0,
    totalSpend:       at.total_spend             || 0,
    tradeRate:        (at.allin_trade_rate_pct   || 0) / 100,             // 0–1
    profitAfterTotal:   at.profit_after_total_spend   || 0,
    profitAfterWorking: at.profit_after_working_spend || 0,
    retailMarginPct:  totalGross > 0 ? (weightedMargin / totalGross) / 100 : null,  // 0–1
    promoROI:         totalPromoUnits > 0 ? weightedPromoROI / totalPromoUnits : null,
    per,
  }
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = {
  vel:  (n) => (Number(n) || 0).toFixed(2),
  acv:  (n) => Math.round(Number(n) || 0).toString(),
  prob: (n) => Math.round(Number(n) || 0) + "%",
};
const clampACV = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

const lerp = (a, b, t) => a + (b - a) * t;
function heatColor(v) {
  v = Math.max(0, Math.min(100, Number(v) || 0));
  const red = [247, 64, 58], white = [255, 255, 255], navy = [22, 87, 136];
  let c;
  if (v <= 50) { const t = v / 50; c = red.map((x, i) => lerp(x, white[i], t)); }
  else { const t = (v - 50) / 50; c = white.map((x, i) => lerp(x, navy[i], t)); }
  return c.map(Math.round);
}
const isDarkFill = ([r, g, b]) => (r * 299 + g * 587 + b * 114) / 1000 < 150;

// ─── Editable table cell ────────────────────────────────────────────────────

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

// ─── ACV range popover ──────────────────────────────────────────────────────

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

// ─── Save plan modal ────────────────────────────────────────────────────────

function SaveModal({ activeBlock, blockType = 'distribution', onOverwrite, onSaveNew, onClose }) {
  const [step, setStep] = useState(activeBlock ? 'choice' : 'name');
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  const typeLabel = blockType.charAt(0).toUpperCase() + blockType.slice(1);

  useEffect(() => {
    if (step === 'name') inputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const optBtn = (onClick, title, sub, primary) => (
    <button onClick={onClick} style={{
      padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line)',
      background: primary ? 'var(--navy)' : 'var(--panel)',
      color: primary ? '#fff' : 'var(--ink)',
      fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
    }}>
      <div>{title}</div>
      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, opacity: primary ? 0.8 : 1, color: primary ? 'inherit' : 'var(--muted)' }}>{sub}</div>
    </button>
  );

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '28px 28px 24px', width: 380, boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
        {step === 'choice' ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Save {typeLabel.toLowerCase()} block</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>What would you like to do?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {optBtn(onOverwrite, `Overwrite "${activeBlock?.name}"`, 'Replace the saved block with current values', true)}
              {optBtn(() => setStep('name'), 'Save as new block', 'Create a new named snapshot')}
            </div>
            <button onClick={onClose} style={{
              marginTop: 14, width: '100%', padding: '8px', borderRadius: 8, border: 'none',
              background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Save as new block</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>Give this {typeLabel.toLowerCase()} snapshot a name.</div>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSaveNew(name.trim()); }}
              placeholder="e.g. Conservative, High growth…"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)',
                fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
                background: 'var(--panel-2)', boxSizing: 'border-box', marginBottom: 16,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)',
                background: 'var(--panel)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
              <button
                onClick={() => name.trim() && onSaveNew(name.trim())}
                disabled={!name.trim()}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: name.trim() ? 'pointer' : 'not-allowed',
                  opacity: name.trim() ? 1 : 0.45, fontFamily: 'inherit',
                }}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Plan selector dropdown ─────────────────────────────────────────────────

function PlanDropdown({ activeBlock, blocks, onSelectBase, onSelectBlock }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = activeBlock ? activeBlock.name : 'Base Distribution';
  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
    borderRadius: 7, border: '1px solid var(--line)',
    background: activeBlock ? 'var(--navy-50)' : 'var(--panel)',
    color: activeBlock ? 'var(--navy)' : 'var(--ink-2)',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    maxWidth: 240,
  };
  const itemStyle = (active) => ({
    display: 'flex', alignItems: 'center', width: '100%',
    padding: '8px 12px', borderRadius: 7, border: 'none',
    background: active ? 'var(--navy-50)' : 'transparent',
    color: active ? 'var(--navy)' : 'var(--ink)',
    fontWeight: active ? 700 : 500, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={btnStyle}>
        <Icon name="table" size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <Icon name="arrowDn" size={12} style={{ flex: 'none' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 100,
          minWidth: 220, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 4px' }}>
            <button onClick={() => { onSelectBase(); setOpen(false); }} style={itemStyle(!activeBlock)}>
              <span style={{ flex: 1 }}>Base Distribution</span>
              {!activeBlock && <span style={{ fontSize: 11, fontWeight: 700 }}>current</span>}
            </button>
            {blocks.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--line)', margin: '4px 8px' }} />
                {blocks.map(bl => (
                  <button key={bl.id} onClick={() => { onSelectBlock(bl); setOpen(false); }} style={itemStyle(activeBlock?.id === bl.id)}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bl.name}</span>
                    {activeBlock?.id === bl.id && <span style={{ fontSize: 11, fontWeight: 700, flex: 'none' }}>current</span>}
                  </button>
                ))}
              </>
            )}
            {blocks.length === 0 && (
              <div style={{ padding: '4px 12px 8px', fontSize: 12, color: 'var(--muted)' }}>
                No saved blocks yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App shell ─────────────────────────────────────────────────────────────

function TopBar({ view, setView, account, onExport, onImportClick }) {
  const tab = (id, icon, label) => {
    const active = view === id
    return (
      <button key={id} onClick={() => setView(id)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px',
        borderRadius: 8, border: 'none', fontFamily: 'inherit',
        background: active ? 'var(--navy-50)' : 'transparent',
        color: active ? 'var(--navy)' : 'var(--muted)',
        fontWeight: 600, fontSize: 13.5, cursor: 'pointer', transition: 'all .15s',
      }}>
        <Icon name={icon} size={16} />{label}
      </button>
    )
  }
  const ghostBtn = (icon, label, onClick) => (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
      borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel)',
      color: 'var(--ink-2)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all .15s',
    }}>
      {icon && <Icon name={icon} size={14} />}{label}
    </button>
  )
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 var(--gut)', height: 60,
      background: 'var(--panel)', borderBottom: '1px solid var(--line)', flex: 'none', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/logo.svg" alt="Omnium" style={{ height: 36, width: 'auto' }} />
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '.14em', color: 'var(--ink)' }}>OMNIUM</div>
          <div style={{ fontSize: 9.5, letterSpacing: '.16em', color: 'var(--muted)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>
            Scenario Planner
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <nav style={{ display: 'flex', gap: 2, marginLeft: 12 }}>
        {tab('distribution', 'table',   'Distribution')}
        {tab('pricing',      'sliders', 'Pricing')}
        {tab('promotion',    'star',    'Promotion')}
        {tab('compare',      'compare', 'Compare')}
        {tab('blocks',       'grid',    'Building Blocks')}
        {tab('scenarios',    'layers',  'Scenarios')}
      </nav>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {ghostBtn('download', 'Export', onExport)}
        {ghostBtn(null, 'Import', onImportClick)}
        <div style={{
          width: 32, height: 32, borderRadius: 99, background: 'var(--slate)',
          color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
        }}>
          LL
        </div>
      </div>
    </header>
  )
}

function ContextBar({ account, skuCount }) {
  if (!account) return null
  const item = (label, val) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{val || '—'}</span>
    </div>
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 24, padding: '10px var(--gut)',
      background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', flex: 'none',
      overflowX: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name="box" size={17} style={{ color: 'var(--navy)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          {account.account_name}
        </span>
      </div>
      <div style={{ width: 1, height: 24, background: 'var(--line)', flex: 'none' }} />
      {item('Channel',     account.sales_channel)}
      {item('Distributor', account.primary_distributor)}
      {item('Stores',      account.number_of_stores?.toLocaleString())}
      {skuCount != null && item('SKUs', skuCount.toLocaleString())}
    </div>
  )
}

// ─── Main app ───────────────────────────────────────────────────────────────

export default function App() {
  // Distribution table state
  const [rows, setRows]           = useState(null);
  const [meta, setMeta]           = useState(null);
  const [search, setSearch]       = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [edited, setEdited]       = useState(() => new Set());
  const [editing, setEditing]     = useState(null);
  const [popover, setPopover]     = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [err, setErr]             = useState(null);
  const [loading, setLoading]     = useState(false);
  const dragDepth = useRef(0);

  // Engine / compare state
  const [devData, setDevData] = useState(null);
  const [view, setView]       = useState('compare');
  const [blocks, setBlocks]         = useState({ distribution: [], pricing: [], promotion: [] });
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [baseRows, setBaseRows]     = useState(null);
  const [showBasePlan, setShowBasePlan] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [activeIsBase, setActiveIsBase] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadDevData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/dev-data');
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || res.statusText); }
      const data = await res.json();
      const initialRows = devDataToRows(data);
      setRows(initialRows);
      setMeta({ sheet: data.account?.account_name || 'Dev data', count: initialRows.length });
      setBaseRows(initialRows);
      setActiveBlockId(null);
      setActiveIsBase(false);
      setShowBasePlan(true);
      setDevData(data);
      const acctKey = data.account?.account_name?.toLowerCase().replace(/\s+/g, '_');
      if (acctKey) { try { const saved = JSON.parse(localStorage.getItem(`scenario-workspace-${acctKey}`) || 'null'); if (saved?.blocks) setBlocks(saved.blocks); if (saved?.savedScenarios) setSavedScenarios(saved.savedScenarios); } catch {} }
      setEdited(new Set()); setSearch(""); setCollapsed(new Set()); setErr(null);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true); setErr(null);
    try {
      const buf = await file.arrayBuffer();
      const fd = new FormData();
      fd.append('file', file);

      const [parsedResult, engineResult] = await Promise.allSettled([
        parseDAP(buf),
        fetch('/api/extract', { method: 'POST', body: fd })
          .then(async r => {
            if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || r.statusText); }
            return r.json();
          }),
      ]);

      if (parsedResult.status === 'fulfilled') {
        const tableRows = parsedResult.value.rows.map(r => ({ ...r, months: { ...r.months } }));
        setRows(tableRows);
        setMeta({ sheet: parsedResult.value.sheet, count: tableRows.length, file: file.name });
        setBaseRows(tableRows);
        setActiveBlockId(null);
      } else {
        throw parsedResult.reason;
      }

      if (engineResult.status === 'fulfilled') {
        setDevData(engineResult.value);
        const acctKey = engineResult.value?.account?.account_name?.toLowerCase().replace(/\s+/g, '_');
        if (acctKey) { try { const saved = JSON.parse(localStorage.getItem(`scenario-workspace-${acctKey}`) || 'null'); if (saved?.blocks) setBlocks(saved.blocks); if (saved?.savedScenarios) setSavedScenarios(saved.savedScenarios); } catch {} }
      }
      // If engine API is unreachable, the compare tab shows a graceful "no data" state

      setEdited(new Set()); setSearch(""); setCollapsed(new Set());
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setLoading(false); }
  }, []);

  // Drag-and-drop global listeners
  useEffect(() => {
    const onOver  = (e) => { e.preventDefault(); };
    const onEnter = (e) => { e.preventDefault(); dragDepth.current++; setDragging(true); };
    const onLeave = (e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { setDragging(false); dragDepth.current = 0; } };
    const onDrop  = (e) => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    };
    window.addEventListener("dragover",  onOver);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop",      onDrop);
    return () => {
      window.removeEventListener("dragover",  onOver);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop",      onDrop);
    };
  }, [handleFile]);

  // ── Cell editing helpers ──────────────────────────────────────────────────

  const markEdited = (rowId, field) => setEdited(s => { const n = new Set(s); n.add(rowId + "|" + field); return n; });

  const commitCell = (rowId, field, raw) => {
    setEditing(null);
    if (raw === null || raw === undefined) return;
    setRows(rs => rs.map(r => {
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
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r;
      const months = { ...r.months };
      for (let i = si; i <= ei; i++) months[MONTHS[i]] = value;
      return { ...r, months };
    }));
    setEdited(s => {
      const n = new Set(s);
      for (let i = si; i <= ei; i++) n.add(rowId + "|m:" + MONTHS[i]);
      return n;
    });
    setPopover(null);
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(r => r.SKU_name.toLowerCase().includes(q) || r.Product_Group.toLowerCase().includes(q))
      : rows;
    const order = [], map = new Map();
    for (const r of filtered) {
      if (!map.has(r.Product_Group)) { map.set(r.Product_Group, []); order.push(r.Product_Group); }
      map.get(r.Product_Group).push(r);
    }
    return order.map(g => ({ name: g, rows: map.get(g) }));
  }, [rows, search]);

  const totalShown = groups.reduce((a, g) => a + g.rows.length, 0);
  const toggleGroup = (g) => setCollapsed(s => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const allCollapsed = rows && groups.length > 0 && groups.every(g => collapsed.has(g.name));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(groups.map(g => g.name)));
  };

  const scenarios = useMemo(() => devData ? [buildBaseScenario(devData)] : [], [devData]);
  const fiscalCalendar = devData?.fiscal_calendar || {};
  const skuCount = devData ? Object.keys(devData.skus || {}).length : rows?.length;
  const activePlanBlock = activeBlockId ? (blocks.distribution.find(b => b.id === activeBlockId) ?? null) : null;
  const activeBlock = activeIsBase ? { id: '__base__', name: 'Base Distribution' } : activePlanBlock;

  // ── Building block actions ────────────────────────────────────────────────

  const importRef = useRef(null);

  const loadBlock = useCallback((block) => {
    setRows(block.inputs.map(r => ({ ...r, months: { ...r.months } })));
    setEdited(new Set());
    setActiveBlockId(block.id);
    setActiveIsBase(false);
  }, []);

  const loadBase = useCallback(() => {
    if (!baseRows) return;
    setRows(baseRows.map(r => ({ ...r, months: { ...r.months } })));
    setEdited(new Set());
    setActiveBlockId(null);
    setActiveIsBase(false);
  }, [baseRows]);

  const saveDistributionBlock = useCallback((name) => {
    setBlocks(b => ({
      ...b,
      distribution: [...b.distribution, {
        id: `dist-${Date.now()}`,
        name,
        note: `${rows.length} SKUs · saved`,
        created_at: new Date().toISOString(),
        inputs: rows.map(r => ({ ...r, months: { ...r.months } })),
      }],
    }));
  }, [rows]);

  const handleOverwrite = useCallback(() => {
    if (activeIsBase) {
      setBaseRows(rows.map(r => ({ ...r, months: { ...r.months } })));
      setSaveModalOpen(false);
      return;
    }
    if (!activeBlockId) return;
    setBlocks(b => ({
      ...b,
      distribution: b.distribution.map(bl =>
        bl.id === activeBlockId
          ? { ...bl, note: `${rows.length} SKUs · saved`, inputs: rows.map(r => ({ ...r, months: { ...r.months } })) }
          : bl
      ),
    }));
    setSaveModalOpen(false);
  }, [activeIsBase, activeBlockId, rows]);

  const handleSaveNew = useCallback((name) => {
    if (name.toLowerCase() === 'base distribution') {
      alert('"Base distribution" is reserved. Choose a different name.');
      return;
    }
    if (blocks.distribution.some(b => b.name === name)) {
      alert(`A block named "${name}" already exists. Choose a different name.`);
      return;
    }
    saveDistributionBlock(name);
    setActiveIsBase(false);
    setSaveModalOpen(false);
  }, [blocks.distribution, saveDistributionBlock]);

  const deleteBlock = useCallback((type, id) => {
    setBlocks(b => ({ ...b, [type]: b[type].filter(bl => bl.id !== id) }));
    if (type === 'distribution' && activeBlockId === id && baseRows) {
      setRows(baseRows.map(r => ({ ...r, months: { ...r.months } })));
      setEdited(new Set());
      setActiveBlockId(null);
      setActiveIsBase(false);
    }
  }, [activeBlockId, baseRows]);

  const handleExport = useCallback(() => {
    const acctName = devData?.account?.account_name || 'account';
    const payload = {
      _version: '1.0',
      _meta: { account: acctName, created_at: new Date().toISOString() },
      blocks,
      scenarios: scenarios.map(s => ({ id: s.id, name: s.name, tag: s.tag })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${acctName.replace(/\s+/g, '_')}_scenario.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [blocks, devData, scenarios]);

  const handleImportFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const data = JSON.parse(ev.target.result); if (data.blocks) setBlocks(data.blocks); } catch {}
      e.target.value = '';
    };
    reader.readAsText(file);
  }, []);

  const handleComposeSave = useCallback(({ name, tag, distributionId, pricingId, promotionId }) => {
    setSavedScenarios(ss => [...ss, {
      id: `sc-${Date.now()}`,
      name,
      tag,
      createdAt: new Date().toISOString(),
      distributionId,
      pricingId,
      promotionId,
    }]);
    setView('scenarios');
  }, []);

  const deleteScenario = useCallback((id) => {
    setSavedScenarios(ss => ss.filter(s => s.id !== id));
  }, []);

  useEffect(() => {
    const acctKey = devData?.account?.account_name?.toLowerCase().replace(/\s+/g, '_');
    if (!acctKey) return;
    localStorage.setItem(`scenario-workspace-${acctKey}`, JSON.stringify({ blocks, savedScenarios }));
  }, [blocks, savedScenarios, devData]);

  // ── Landing (no data loaded) ──────────────────────────────────────────────

  if (!rows) {
    return (
      <div className={"landing" + (dragging ? " drag" : "")}>
        <div className="landing-card">
          <img src="/logo.svg" alt="Omnium" style={{ height: 54, width: 'auto' }} />
          <h1>Scenario Planner</h1>
          <p className="lede">
            Drop your DAP workbook (<code>.xlsx</code>) anywhere to load the distribution table and run the financial engine.
          </p>
          {loading && <div className="status">Parsing workbook…</div>}
          {err && <div className="status err">{err}</div>}
          <div className="landing-actions">
            <label className="btn primary">
              Choose .xlsx file
              <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </label>
            {import.meta.env.DEV && (
              <button className="btn ghost" onClick={loadDevData}>Load dev data</button>
            )}
          </div>
        </div>
        <div className="drop-hint">Drop .xlsx to load</div>
      </div>
    );
  }

  // ── App shell (data loaded) ───────────────────────────────────────────────

  const popRow = popover ? rows.find(r => r.id === popover.rowId) : null;

  return (
    <div className={"app" + (dragging ? " drag" : "")}>
      <TopBar view={view} setView={setView} account={devData?.account} onExport={handleExport} onImportClick={() => importRef.current?.click()} />
      <input ref={importRef} type="file" accept=".json" hidden onChange={handleImportFile} />
      <ContextBar account={devData?.account} skuCount={skuCount} />

      {/* ── Distribution tab ── */}
      {view === 'distribution' && (
        <>
          <div className="bar">
            <div className="bar-left" style={{ gap: 8 }}>
              <PlanDropdown
                activeBlock={activePlanBlock}
                blocks={blocks.distribution}
                onSelectBase={loadBase}
                onSelectBlock={loadBlock}
              />
              <div className="bar-sub">
                {meta?.file ? meta.file + ' · ' : ''}{meta?.sheet} · {totalShown} of {rows.length} SKUs
              </div>
            </div>
            <div className="bar-right">
              <div className="search">
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="2" d="M10.5 3a7.5 7.5 0 105.3 12.8l5.2 5.2 1.4-1.4-5.2-5.2A7.5 7.5 0 0010.5 3z"/>
                </svg>
                <input placeholder="Search SKU or product group…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && <button className="search-x" onClick={() => setSearch("")}>✕</button>}
              </div>
              <button className="btn sm" onClick={() => setSaveModalOpen(true)}>Save</button>
              <label className="btn sm">
                Load file
                <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="table-wrap">
            <table className="dap">
              <thead>
                <tr>
                  <th className="sticky-l c-pg">Product Group</th>
                  <th className="sticky-l c-sku">SKU Name</th>
                  <th className="num">Unit<br/>Velocity</th>
                  <th className="num">Current<br/>ACV</th>
                  {MONTHS.map(m => <th key={m} className="num c-mon">{m}</th>)}
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
                        {MONTHS.map(m => (
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
        </>
      )}

      {/* ── Pricing / Promotion placeholder tabs ── */}
      {(view === 'pricing' || view === 'promotion') && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-2)', marginBottom: 6 }}>
              {view === 'pricing' ? 'Pricing' : 'Promotion'} editor
            </div>
            <div style={{ fontSize: 13 }}>In development — coming soon</div>
          </div>
        </div>
      )}

      {/* ── Compare tab ── */}
      {view === 'compare' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CompareView scenarios={scenarios} fiscalCalendar={fiscalCalendar} />
        </div>
      )}

      {/* ── Building Blocks tab ── */}
      {view === 'blocks' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ScenarioListView
            blocks={blocks}
            showBasePlan={showBasePlan}
            onDeleteBlock={deleteBlock}
            onDeleteBase={() => setShowBasePlan(false)}
            onEditBlock={(block) => { loadBlock(block); setView('distribution'); }}
            onEditBase={() => { loadBase(); setActiveIsBase(true); setView('distribution'); }}
          />
        </div>
      )}

      {/* ── Scenarios tab ── */}
      {view === 'scenarios' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ScenariosView
            scenarios={scenarios}
            savedScenarios={savedScenarios}
            blocks={blocks}
            onNewScenario={() => setView('new-scenario')}
            onDeleteScenario={deleteScenario}
          />
        </div>
      )}

      {/* ── Scenario composer ── */}
      {view === 'new-scenario' && (
        <ScenarioComposerView
          blocks={blocks}
          existingCount={savedScenarios.length}
          onSave={handleComposeSave}
          onCancel={() => setView('scenarios')}
        />
      )}

      {saveModalOpen && (
        <SaveModal
          activeBlock={activeBlock}
          blockType="distribution"
          onOverwrite={handleOverwrite}
          onSaveNew={handleSaveNew}
          onClose={() => setSaveModalOpen(false)}
        />
      )}

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Drop .xlsx to load a new DAP</div>
        </div>
      )}
    </div>
  );
}

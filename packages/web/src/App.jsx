import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import CompareView from './components/CompareView.jsx';
import ScenarioListView from './components/ScenarioListView.jsx';
import ScenariosView from './components/ScenariosView.jsx';
import ScenarioComposerView from './components/ScenarioComposerView.jsx';
import PromotionView from './components/PromotionView.jsx';
import PricingView from './components/PricingView.jsx';
import { Icon } from './components/ui.jsx';
import { MONTHS, heatColor, isDarkFill, clampACV, Cell, ApplyPopover } from './components/DistributionTable.jsx';
import { PlanDropdown, SaveModal } from './components/DistributionEditor.jsx';

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

  // Weighted retailer margin, retail dollars from period-level engine output
  let totalGross = 0, weightedMargin = 0, retailDollars = 0
  for (const sku of Object.values(resultSkus || {})) {
    for (const p of Object.values(sku.periods || {})) {
      if (p.gross_sales > 0 && p.everyday_retail_margin_pct != null) {
        weightedMargin += p.everyday_retail_margin_pct * p.gross_sales
        totalGross     += p.gross_sales
      }
      if (p.everyday_net_cost && p.everyday_retail_margin_pct != null && p.everyday_retail_margin_pct < 100) {
        retailDollars += (p.unit_sales || 0) * p.everyday_net_cost / (1 - p.everyday_retail_margin_pct / 100)
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
    note:             null,
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
    workingSpend:     (at.retailer_working_spend || 0) + (at.distributor_working || 0),
    retailDollars,
    retailMarginPct:  totalGross > 0 ? (weightedMargin / totalGross) / 100 : null,  // 0–1
    per,
  }
}

const fmt = {
  vel:  (n) => (Number(n) || 0).toFixed(2),
  acv:  (n) => Math.round(Number(n) || 0).toString(),
  prob: (n) => Math.round(Number(n) || 0) + "%",
};

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
  const [blockRevision, setBlockRevision] = useState(0);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [baseScenarioOverrides, setBaseScenarioOverrides] = useState({});
  const [baseRows, setBaseRows]               = useState(null);
  const [basePricingSnapshot, setBasePricingSnapshot] = useState(null);
  const [basePromoSnapshot,   setBasePromoSnapshot]   = useState(null);
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
      if (acctKey) { try { localStorage.removeItem(`scenario-workspace-${acctKey}`); localStorage.removeItem(`promo-state-${acctKey}`); } catch {} }
      setBlocks({ distribution: [], pricing: [], promotion: [] });
      setSavedScenarios([]);
      setBaseScenarioOverrides({});
      setBasePricingSnapshot(null);
      setBasePromoSnapshot(null);
      setEdited(new Set()); setSearch(""); setCollapsed(new Set()); setErr(null);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/extract', { method: 'POST', body: fd });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || r.statusText); }
      const data = await r.json();

      const serverRows = devDataToRows(data);
      setRows(serverRows);
      setBaseRows(serverRows);
      setMeta({ sheet: data.account?.account_name || file.name, count: serverRows.length, file: file.name });
      setDevData(data);
      setActiveBlockId(null);
      setActiveIsBase(false);
      setShowBasePlan(true);
      const acctKey = data?.account?.account_name?.toLowerCase().replace(/\s+/g, '_');
      if (acctKey) { try { localStorage.removeItem(`scenario-workspace-${acctKey}`); localStorage.removeItem(`promo-state-${acctKey}`); } catch {} }
      setBlocks({ distribution: [], pricing: [], promotion: [] });
      setSavedScenarios([]);
      setBaseScenarioOverrides({});
      setBasePricingSnapshot(null);
      setBasePromoSnapshot(null);
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
    const si = months.indexOf(start), ei = months.indexOf(end);
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r.months };
      for (let i = si; i <= ei; i++) updated[months[i]] = value;
      return { ...r, months: updated };
    }));
    setEdited(s => {
      const n = new Set(s);
      for (let i = si; i <= ei; i++) n.add(rowId + "|m:" + months[i]);
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

  const scenarios = useMemo(() => devData ? [{ ...buildBaseScenario(devData), ...baseScenarioOverrides }] : [], [devData, baseScenarioOverrides]);
  const fiscalCalendar = devData?.fiscal_calendar || {};
  const orderedMonths = Object.values(fiscalCalendar).map(info => info.month).filter(Boolean);
  const months = orderedMonths.length ? orderedMonths : MONTHS;
  const skuCount = devData ? Object.keys(devData.skus || {}).length : rows?.length;
  const activePlanBlock = activeBlockId ? (blocks.distribution.find(b => b.id === activeBlockId) ?? null) : null;
  const activeBlock = activeIsBase ? { id: '__base__', name: 'Base Distribution' } : activePlanBlock;
  const acctKey = devData?.account?.account_name?.toLowerCase().replace(/\s+/g, '_') ?? null;

  const planPromos = useMemo(() => {
    if (!devData) return { grid: {}, promos: [] };
    // Build SKU→ProductGroup mapping from baseRows
    const skuToGroup = {};
    for (const r of baseRows || []) skuToGroup[r.SKU_name] = r.Product_Group;
    const nameToColor = new Map();
    const grid = {};
    for (const [skuName, skuData] of Object.entries(devData.skus || {})) {
      const pg = skuToGroup[skuName];
      if (!pg) continue;
      for (const [period, pdata] of Object.entries(skuData.promo_periods || {})) {
        const name  = pdata.name_promo1;
        const weeks = pdata.weeks_event_promo1;
        if (!name || !weeks) continue;
        const key = `${pg}|||${period}`;
        if (grid[key]) continue; // first SKU in group wins
        if (!nameToColor.has(name)) nameToColor.set(name, nameToColor.size);
        const lift = pdata.lift_promo1;
        grid[key] = {
          id:            `plan-${name.replace(/\s+/g, '-').toLowerCase()}-${period}`,
          colorIdx:      nameToColor.get(name),
          name,
          promo_price:   Math.round((pdata.price_promo1 || 0) * 100) / 100,
          weeks,
          scan:          Math.round((pdata.scan_promo1  || 0) * 100) / 100,
          fixed_fee:     Math.round((pdata.fixed_promo1 || 0) * 100) / 100,
          expected_lift: lift ? Math.round((lift - 1) * 100) : 0,
        };
      }
    }
    const promos = Array.from(nameToColor.entries()).map(([name, colorIdx]) => ({
      id: `plan-${name.replace(/\s+/g, '-').toLowerCase()}`,
      colorIdx,
      name,
    }));
    return { grid, promos };
  }, [devData, baseRows]);

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
      _meta: {
        account: acctName,
        created_at: new Date().toISOString(),
        source_file: devData?._meta?.source_file || null,
      },
      devData,
      baseRows,
      blocks,
      savedScenarios,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${acctName.replace(/\s+/g, '_')}_scenarios.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [blocks, baseRows, savedScenarios, devData]);

  const handleImportFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.devData)        { setDevData(data.devData); }
        if (data.baseRows)       { setBaseRows(data.baseRows); setRows(data.baseRows); }
        if (data.blocks)         { setBlocks(data.blocks); }
        if (data.savedScenarios) { setSavedScenarios(data.savedScenarios); }
        if (data.devData || data.baseRows) setView('compare');
      } catch {}
      e.target.value = '';
    };
    reader.readAsText(file);
  }, []);

  const handleWriteToExcel = useCallback((scenario, scenarioInputs, { onStart, onEnd } = {}) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onStart?.();
      const form = new FormData();
      form.append('file', file);
      try {
        form.append('scenario_inputs', JSON.stringify({
          ...scenarioInputs,
          scenario_name: scenario.name || 'scenario',
        }));
      } catch (err) {
        alert(`Failed to serialize scenario data: ${err.message}`);
        onEnd?.();
        return;
      }
      try {
        const res = await fetch('/api/writeback', { method: 'POST', body: form });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText);
          alert(`Write-back failed: ${msg}`);
          return;
        }
        const blob = await res.blob();
        const disp = res.headers.get('content-disposition') || '';
        const match = disp.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : `${file.name.replace(/\.xlsx$/i, '')}-${scenario.name}.xlsx`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(`Write-back failed: ${err.message}`);
      } finally {
        onEnd?.();
      }
    };
    input.click();
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
    setSavedScenarios(ss => {
      if (ss.some(s => s.id === id)) return ss.filter(s => s.id !== id)
      setShowBasePlan(false)
      return ss
    })
  }, []);

  const updateScenario = useCallback((id, updates) => {
    setSavedScenarios(ss => {
      if (ss.some(s => s.id === id)) return ss.map(s => s.id === id ? { ...s, ...updates } : s)
      // base scenario — store overrides in separate state
      setBaseScenarioOverrides(prev => ({ ...prev, ...updates }))
      return ss
    })
  }, []);

  const updateBlockInputs = useCallback((type, blockId, inputs) => {
    if (!blockId || blockId === '__base__') {
      if (type === 'distribution') setBaseRows(inputs);
      else if (type === 'pricing')  setBasePricingSnapshot(inputs);
      else if (type === 'promotion') setBasePromoSnapshot(inputs);
    } else {
      setBlocks(b => ({
        ...b,
        [type]: b[type].map(bl => bl.id === blockId ? { ...bl, inputs } : bl),
      }));
      setBlockRevision(r => r + 1);
    }
  }, []);

  const createDistributionBlock = useCallback((id, name, rows) => {
    const newBlock = {
      id,
      name,
      note: `${rows.length} SKUs · saved`,
      created_at: new Date().toISOString(),
      inputs: rows.map(r => ({ ...r, months: { ...r.months } })),
    };
    setBlocks(b => ({ ...b, distribution: [...b.distribution, newBlock] }));
  }, []);

  const savePricingBlock = useCallback((id, name, snapshot) => {
    setBlocks(b => ({
      ...b,
      pricing: [...b.pricing, {
        id,
        name,
        note: `${Object.keys(snapshot).length} SKUs · saved`,
        created_at: new Date().toISOString(),
        inputs: snapshot,
      }],
    }));
  }, []);

  const overwritePricingBlock = useCallback((blockId, snapshot) => {
    setBlocks(b => ({
      ...b,
      pricing: b.pricing.map(bl =>
        bl.id === blockId
          ? { ...bl, inputs: snapshot, note: `${Object.keys(snapshot).length} SKUs · saved` }
          : bl
      ),
    }));
  }, []);

  const createPromotionBlock = useCallback((id, name, state) => {
    const newBlock = {
      id,
      name,
      note: `${Object.keys(state.grid || {}).length} cells · saved`,
      created_at: new Date().toISOString(),
      inputs: state,
    };
    setBlocks(b => ({ ...b, promotion: [...b.promotion, newBlock] }));
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
            <label className="btn">
              Import saved scenarios
              <input type="file" accept=".json" hidden onChange={handleImportFile} />
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
                  {months.map(m => <th key={m} className="num c-mon">{m}</th>)}
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
                        {months.map(m => (
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
                  <tr><td className="empty" colSpan={months.length + 5}>No SKUs match "{search}".</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {popover && popRow && (
            <ApplyPopover
              row={popRow} anchor={popover.anchor} months={months}
              onApply={(s, e, v) => applyRange(popover.rowId, s, e, v)}
              onClose={() => setPopover(null)}
            />
          )}
        </>
      )}

      {/* ── Pricing tab ── */}
      {view === 'pricing' && (
        <PricingView
          devData={devData}
          fiscalCalendar={fiscalCalendar}
          blocks={blocks.pricing}
          onSaveNew={savePricingBlock}
          onOverwrite={overwritePricingBlock}
        />
      )}

      {/* ── Promotion tab ── */}
      {view === 'promotion' && (
        <PromotionView rows={rows} fiscalCalendar={fiscalCalendar} accountKey={acctKey} planPromos={planPromos} />
      )}

      {/* ── Compare tab ── */}
      {view === 'compare' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CompareView scenarios={showBasePlan ? scenarios : []} savedScenarios={savedScenarios} blocks={blocks} fiscalCalendar={fiscalCalendar} blockRevision={blockRevision} />
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
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <ScenariosView
            scenarios={showBasePlan ? scenarios : []}
            savedScenarios={savedScenarios}
            blocks={blocks}
            devData={devData}
            baseRows={baseRows}
            fiscalCalendar={fiscalCalendar}
            basePromoState={planPromos}
            basePricingSnapshot={basePricingSnapshot}
            basePromoSnapshot={basePromoSnapshot}
            onNewScenario={() => setView('new-scenario')}
            onDeleteScenario={deleteScenario}
            onUpdateScenario={updateScenario}
            onSaveDistribution={(blockId, inputs) => updateBlockInputs('distribution', blockId, inputs)}
            onCreateDistributionBlock={createDistributionBlock}
            onSavePromotion={(blockId, state) => updateBlockInputs('promotion', blockId, state)}
            onCreatePromotionBlock={createPromotionBlock}
            onSavePricing={(blockId, snapshot) => updateBlockInputs('pricing', blockId, snapshot)}
            onCreatePricingBlock={savePricingBlock}
            months={months}
            onWriteToExcel={handleWriteToExcel}
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

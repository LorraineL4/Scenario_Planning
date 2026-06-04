import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { SaveModal, PlanDropdown } from './DistributionEditor.jsx'
import { Cell } from './DistributionTable.jsx'

// ─── Field definitions ────────────────────────────────────────────────────────

const INPUT_FIELDS = [
  { key: 'base_price',          label: 'Everyday Price',       type: 'dollar'      },
  { key: 'gross_price',         label: 'Gross Price',          type: 'dollar'      },
  { key: 'edlp_direct',        label: 'EDP Subsidization',    type: 'dollar'      },
  { key: 'price_impact_manual', label: 'Price Chng vs EDP',   type: 'pct_decimal' },
  { key: 'upcharge_dist_pct',   label: 'Dist Upcharge',       type: 'pct_decimal' },
]

const COMPUTED_FIELDS = [
  { key: '_weekly_baseline', label: 'Weekly Baseline',          type: 'number' },
  { key: '_ed_nuc',          label: 'Everyday Net Unit Cost',   type: 'dollar' },
  { key: '_retail_margin',   label: 'Everyday Retail Margin',   type: 'pct'    },
]

// Sticky left widths — Product Group col is 220px, Field col is 200px
const PG_W  = 220
const FLD_W = 200

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtVal(type, v) {
  if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  if (type === 'dollar')      return '$' + n.toFixed(2)
  if (type === 'pct')         return n.toFixed(1) + '%'
  if (type === 'pct_decimal') return (n * 100).toFixed(1) + '%'
  if (type === 'number')      return n.toFixed(1)
  return String(v)
}

// Raw edit value shown in the input box
function editRaw(type, v) {
  if (v === null || v === undefined) return ''
  if (type === 'pct_decimal') return (Number(v) * 100).toFixed(2)
  if (type === 'dollar')      return Number(v).toFixed(2)
  return String(Number(v))
}

function parseVal(type, raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/[$%,\s]/g, '')
  if (s === '' || s === '-') return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (type === 'pct_decimal') return n / 100   // user types "8", store 0.08
  return n
}

// ─── DAP engine formulas (frontend replica — no engine changes) ───────────────

function computeEdNuc({ gross_price, upcharge_dist_pct, edlp_mcb_pct, edlp_direct }) {
  const g = gross_price ?? 0
  if (!g) return null
  const u = upcharge_dist_pct ?? 0
  const m = edlp_mcb_pct ?? 0
  const e = edlp_direct ?? 0
  const gross_landed  = g * (1 + u)
  const mcb_credit    = m * g * (1 + u)
  return gross_landed - e - mcb_credit
}

function computeRetailMargin(edNuc, basePrice) {
  if (edNuc === null || !basePrice) return null
  return (1 - edNuc / basePrice) * 100
}

// ─── Initialise from devData ──────────────────────────────────────────────────

function initFromDevData(devData, periods) {
  const data = {}
  for (const [skuName, skuData] of Object.entries(devData?.skus || {})) {
    const upcharge       = skuData.static_inputs?.upcharge_dist_pct ?? 0
    const pricingPeriods = skuData.pricing_periods  || {}
    const currentInputs  = skuData.current_inputs   || {}

    const mkPeriod = (src) => ({
      base_price:          src.base_price           ?? null,
      gross_price:         src.gross_price          ?? null,
      edlp_direct:        src.edlp_direct          ?? null,
      price_impact_manual: src.price_impact_manual  ?? null,
      upcharge_dist_pct:   src.upcharge_dist_pct    ?? upcharge,
      edlp_mcb_pct:        src.edlp_mcb_pct         ?? 0,
    })

    const skuPeriods = {}
    for (const p of periods) {
      skuPeriods[p] = mkPeriod(pricingPeriods[p] || {})
      skuPeriods[p].upcharge_dist_pct = pricingPeriods[p]?.upcharge_dist_pct ?? upcharge
    }

    data[skuName] = { periods: skuPeriods }
  }
  return data
}

// ─── PricingApplyPopover ──────────────────────────────────────────────────────

function PricingApplyPopover({ skuName, periods, fiscalCalendar, anchor, onApply, onClose }) {
  const [startPeriod, setStartPeriod] = useState(periods[0] || '')
  const [vals, setVals] = useState(() => Object.fromEntries(INPUT_FIELDS.map(f => [f.key, ''])))
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const pos = useMemo(() => {
    if (!anchor) return { top: 80, left: 200 }
    const W = 272, H = 440, m = 8
    let left = anchor.left - W - 10
    if (left < m) left = anchor.right + 10
    let top = anchor.top
    if (top + H > window.innerHeight - m) top = window.innerHeight - H - m
    if (top < m) top = m
    return { top, left }
  }, [anchor])

  const handleApply = () => {
    const startIdx = periods.indexOf(startPeriod)
    if (startIdx < 0) return
    const targetPeriods = periods.slice(startIdx)
    const parsed = {}
    for (const field of INPUT_FIELDS) {
      const raw = vals[field.key].trim()
      if (raw === '') continue
      const v = parseVal(field.type, raw)
      if (v !== null) parsed[field.key] = v
    }
    if (Object.keys(parsed).length > 0) onApply(targetPeriods, parsed)
    onClose()
  }

  const hasAnyValue = INPUT_FIELDS.some(f => vals[f.key].trim() !== '')
  const targetCount = periods.slice(periods.indexOf(startPeriod)).length

  return (
    <div className="pop" ref={ref} style={{ top: pos.top, left: pos.left, width: 272 }}>
      <div className="pop-head">
        <div className="pop-title">Set pricing</div>
        <button className="pop-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="pop-sku">{skuName}</div>

      <label className="pop-field">
        <span>Starting period</span>
        <select value={startPeriod} onChange={e => setStartPeriod(e.target.value)}>
          {periods.map(p => <option key={p} value={p}>{fiscalCalendar[p]?.month ?? p}</option>)}
        </select>
      </label>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6, marginBottom: 12 }}>
        Fills {targetCount} period{targetCount !== 1 ? 's' : ''} ({fiscalCalendar[startPeriod]?.month ?? startPeriod}→)
      </div>

      {INPUT_FIELDS.map(field => (
        <label key={field.key} className="pop-field">
          <span>{field.label}{field.type === 'pct_decimal' ? ' (%)' : field.type === 'dollar' ? ' ($)' : ''}</span>
          <input
            type="text"
            inputMode="decimal"
            value={vals[field.key]}
            placeholder="Leave blank to keep"
            onChange={e => setVals(v => ({ ...v, [field.key]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
          />
        </label>
      ))}

      <button className="pop-apply" onClick={handleApply} disabled={!hasAnyValue}>
        Apply
      </button>
    </div>
  )
}

// ─── PricingView ──────────────────────────────────────────────────────────────

export default function PricingView({
  devData,
  fiscalCalendar = {},
  blocks = [],
  initialActiveBlock = null,
  onSaveNew,
  onOverwrite,
  onBlockChange,
}) {
  const periods    = useMemo(() => Object.keys(fiscalCalendar), [fiscalCalendar])
  const allCols    = useMemo(() => periods, [periods])

  const [pricingData, setPricingData] = useState({})
  const [collapsed,   setCollapsed]   = useState(() => new Set())
  const [editing,     setEditing]     = useState(null)   // { sku, field, period }
  const [edited,      setEdited]      = useState(() => new Set())
  const [activeBlock, setActiveBlock] = useState(null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [adjustPopover, setAdjustPopover] = useState(null)  // { skuName, anchor }

  // ── Initialise ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!devData) return
    if (initialActiveBlock) {
      const data = JSON.parse(JSON.stringify(initialActiveBlock.inputs || {}))
      setPricingData(data)
      setActiveBlock(initialActiveBlock)
      setCollapsed(new Set(Object.keys(data)))
    } else {
      const data = initFromDevData(devData, periods)
      setPricingData(data)
      setCollapsed(new Set(Object.keys(data)))
    }
    setEdited(new Set())
    setEditing(null)
  }, [devData, periods])  // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.keys(pricingData).filter(n => !q || n.toLowerCase().includes(q))
  }, [pricingData, search])

  const totalSku = Object.keys(pricingData).length

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleGroup = useCallback((name) => {
    setCollapsed(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }, [])

  const commitCell = useCallback((skuName, field, period, raw) => {
    setEditing(null)
    if (raw === null || raw === undefined) return
    const fieldDef = INPUT_FIELDS.find(f => f.key === field)
    if (!fieldDef) return
    const value = parseVal(fieldDef.type, raw)

    setPricingData(data => {
      const sku = { ...data[skuName], periods: { ...data[skuName]?.periods } }
      if (field === 'upcharge_dist_pct') {
        // static per SKU — propagate to all periods
        for (const p of Object.keys(sku.periods)) {
          sku.periods[p] = { ...sku.periods[p], upcharge_dist_pct: value }
        }
      } else {
        sku.periods[period] = { ...sku.periods[period], [field]: value }
      }
      return { ...data, [skuName]: sku }
    })

    if (value !== null) {
      setEdited(s => { const n = new Set(s); n.add(`${skuName}|${field}|${period}`); return n })
    }
  }, [])

  const applyPricingRange = useCallback((skuName, targetPeriods, values) => {
    setPricingData(data => {
      const sku = { ...data[skuName], periods: { ...data[skuName]?.periods } }
      const { upcharge_dist_pct, ...otherValues } = values
      for (const p of targetPeriods) {
        sku.periods[p] = { ...sku.periods[p], ...otherValues }
      }
      // upcharge is static per SKU — propagate to all periods
      if (upcharge_dist_pct !== undefined) {
        for (const p of Object.keys(sku.periods)) {
          sku.periods[p] = { ...sku.periods[p], upcharge_dist_pct }
        }
      }
      return { ...data, [skuName]: sku }
    })
    setEdited(s => {
      const n = new Set(s)
      for (const p of targetPeriods) {
        for (const key of Object.keys(values)) n.add(`${skuName}|${key}|${p}`)
      }
      return n
    })
  }, [])

  const getComputed = useCallback((skuName, period) => {
    const pdata = pricingData[skuName]?.periods?.[period] || {}
    const edNuc       = computeEdNuc(pdata)
    const retailMargin = computeRetailMargin(edNuc, pdata.base_price)

    let weeklyBaseline = null
    const results = devData?.results?.skus?.[skuName]
    const bu    = results?.periods?.[period]?.base_units
    const weeks = fiscalCalendar?.[period]?.weeks ?? 4
    weeklyBaseline = bu != null ? bu / weeks : null

    return { _weekly_baseline: weeklyBaseline, _ed_nuc: edNuc, _retail_margin: retailMargin }
  }, [pricingData, devData, fiscalCalendar])

  // ── Save / load ───────────────────────────────────────────────────────────

  const snapshot = () => JSON.parse(JSON.stringify(pricingData))

  const handleSaveNew = (name) => {
    const id = `pricing-${Date.now()}`
    const snap = snapshot()
    onSaveNew?.(id, name, snap)
    setActiveBlock({ id, name, inputs: snap })
    onBlockChange?.(id)
    setSaveModalOpen(false)
  }

  const handleOverwrite = () => {
    if (activeBlock) {
      onOverwrite?.(activeBlock.id, snapshot())
    } else {
      onOverwrite?.('__base__', snapshot())
      onBlockChange?.('__base__')
    }
    setSaveModalOpen(false)
  }

  const loadBase = useCallback(() => {
    if (!devData) return
    setPricingData(initFromDevData(devData, periods))
    setActiveBlock(null)
    setEdited(new Set())
    setEditing(null)
    onBlockChange?.('__base__')
  }, [devData, periods, onBlockChange])

  const loadBlock = useCallback((block) => {
    setPricingData(JSON.parse(JSON.stringify(block.inputs || {})))
    setActiveBlock(block)
    setEdited(new Set())
    setEditing(null)
    onBlockChange?.(block.id)
  }, [onBlockChange])

  // ── Shared styles ─────────────────────────────────────────────────────────

  const fldCellStyle = {
    position: 'sticky', left: PG_W, zIndex: 3,
    width: FLD_W, minWidth: FLD_W, maxWidth: FLD_W,
    background: 'var(--panel)',
    boxShadow: '1px 0 0 var(--line-strong)',
    textAlign: 'left', padding: '0 12px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  const EXPANDED_ROWS = 1 + INPUT_FIELDS.length + COMPUTED_FIELDS.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Toolbar ── */}
      <div className="bar">
        <div className="bar-left" style={{ gap: 8 }}>
          <PlanDropdown
            activeBlock={activeBlock}
            blocks={blocks}
            baseLabel="Base Pricing"
            onSelectBase={loadBase}
            onSelectBlock={loadBlock}
          />
          <div className="bar-sub">{groups.length} of {totalSku} SKUs</div>
        </div>
        <div className="bar-right">
          <div className="search">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M10.5 3a7.5 7.5 0 105.3 12.8l5.2 5.2 1.4-1.4-5.2-5.2A7.5 7.5 0 0010.5 3z"/>
            </svg>
            <input placeholder="Search SKU…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-x" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button className="btn sm" onClick={() => setSaveModalOpen(true)}>Save</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-wrap">
        <table className="dap">
          <thead>
            <tr>
              <th className="sticky-l c-pg" style={{ textAlign: 'left' }}>Product Group</th>
              <th style={{ ...fldCellStyle, background: '#eaedf0', zIndex: 7, position: 'sticky', top: 0, paddingTop: 9, paddingBottom: 9, fontWeight: 600, fontSize: 11, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--line-strong)', verticalAlign: 'bottom' }}>
                Field
              </th>
              {allCols.map(p => (
                <th key={p} className="num c-mon">
                  {fiscalCalendar[p]?.month ?? p}
                  <br /><span style={{ fontWeight: 400, fontSize: 10, opacity: 0.55 }}>{p}</span>
                </th>
              ))}
              <th className="sticky-r c-adj">Adjust</th>
            </tr>
          </thead>

          <tbody>
            {groups.map((skuName, gi) => {
              const isCollapsed = collapsed.has(skuName)

              // ── Collapsed: 2 rows (EDP + ED NUC) ─────────────────────────
              if (isCollapsed) {
                return (
                  <React.Fragment key={skuName}>
                    {/* EDP row */}
                    <tr className={gi > 0 ? 'pg-start' : ''}>
                      <td className="sticky-l c-pg pg-cell pg-lead" rowSpan={2} style={{ verticalAlign: 'middle' }}>
                        <button
                          className="grp-toggle"
                          onClick={() => toggleGroup(skuName)}
                          style={{ padding: '4px 12px', fontSize: 12 }}
                        >
                          <span className="caret col">▼</span>
                          {skuName}
                        </button>
                      </td>
                      <td style={{ ...fldCellStyle, fontSize: 11, color: 'var(--muted)' }}>Everyday Price</td>
                      {allCols.map(p => {
                        const v = pricingData[skuName]?.periods?.[p]?.base_price
                        return (
                          <td key={p} className="cell num r ro">
                            <span className="cell-val">{fmtVal('dollar', v)}</span>
                          </td>
                        )
                      })}
                      <td className="sticky-r c-adj" rowSpan={2}>
                        <button
                          className={'adj-btn' + (adjustPopover?.skuName === skuName ? ' on' : '')}
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setAdjustPopover(adjustPopover?.skuName === skuName ? null : { skuName, anchor: rect })
                          }}
                        >Adjust ▾</button>
                      </td>
                    </tr>
                    {/* ED NUC row */}
                    <tr>
                      <td style={{ ...fldCellStyle, fontSize: 11, color: 'var(--muted)' }}>ED NUC</td>
                      {allCols.map(p => {
                        const comp = getComputed(skuName, p)
                        return (
                          <td key={p} className="cell num r ro">
                            <span className="cell-val" style={{ color: 'var(--muted)' }}>{fmtVal('dollar', comp._ed_nuc)}</span>
                          </td>
                        )
                      })}
                    </tr>
                  </React.Fragment>
                )
              }

              // ── Expanded ──────────────────────────────────────────────────
              return (
                <React.Fragment key={skuName}>
                  {/* Section header row */}
                  <tr className={gi > 0 ? 'pg-start' : ''}>
                    <td className="sticky-l c-pg pg-cell pg-lead" rowSpan={EXPANDED_ROWS} style={{ verticalAlign: 'top', paddingTop: 8 }}>
                      <button
                        className="grp-toggle"
                        onClick={() => toggleGroup(skuName)}
                        style={{ padding: '4px 12px', fontSize: 12 }}
                      >
                        <span className="caret">▼</span>
                        {skuName}
                      </button>
                    </td>
                    <td style={{ ...fldCellStyle, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', background: '#f4f6f7' }}>
                      Inputs
                    </td>
                    {allCols.map(p => (
                      <td key={p} className="cell" style={{ background: '#f4f6f7' }} />
                    ))}
                    <td className="sticky-r c-adj" rowSpan={EXPANDED_ROWS} style={{ verticalAlign: 'top', paddingTop: 8 }}>
                      <button
                        className={'adj-btn' + (adjustPopover?.skuName === skuName ? ' on' : '')}
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setAdjustPopover(adjustPopover?.skuName === skuName ? null : { skuName, anchor: rect })
                        }}
                      >Adjust ▾</button>
                    </td>
                  </tr>

                  {/* Editable input rows */}
                  {INPUT_FIELDS.map(field => (
                    <tr key={field.key}>
                      <td style={{ ...fldCellStyle, fontSize: 12, paddingLeft: 20 }}>{field.label}</td>
                      {allCols.map(p => {
                        const v = pricingData[skuName]?.periods?.[p]?.[field.key]
                        const edKey = `${skuName}|${field.key}|${p}`
                        const isEditingThis = editing?.sku === skuName && editing?.field === field.key && editing?.period === p

                        return (
                          <Cell
                            key={p}
                            align="r"
                            value={editRaw(field.type, v)}
                            display={fmtVal(field.type, v)}
                            edited={edited.has(edKey)}
                            editing={isEditingThis}
                            onStart={() => setEditing({ sku: skuName, field: field.key, period: p })}
                            onCommit={raw => commitCell(skuName, field.key, p, raw)}
                          />
                        )
                      })}
                    </tr>
                  ))}

                  {/* Computed rows */}
                  {COMPUTED_FIELDS.map((field, fi) => (
                    <tr key={field.key} style={fi === 0 ? { borderTop: '2px solid var(--line-strong)' } : {}}>
                      <td style={{ ...fldCellStyle, fontSize: 12, paddingLeft: 20, color: 'var(--muted)', fontStyle: 'italic', background: '#f4f6f7' }}>
                        {field.label}
                      </td>
                      {allCols.map(p => {
                        const comp = getComputed(skuName, p)
                        return (
                          <td key={p} className="cell num r ro">
                            <span className="cell-val" style={{ color: 'var(--muted)' }}>{fmtVal(field.type, comp[field.key])}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}

            {groups.length === 0 && (
              <tr>
                <td className="empty" colSpan={allCols.length + 3}>
                  {totalSku === 0 ? 'No pricing data loaded — upload a DAP file.' : `No SKUs match "${search}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adjustPopover && (
        <PricingApplyPopover
          skuName={adjustPopover.skuName}
          periods={periods}
          fiscalCalendar={fiscalCalendar}
          anchor={adjustPopover.anchor}
          onApply={(targetPeriods, values) => applyPricingRange(adjustPopover.skuName, targetPeriods, values)}
          onClose={() => setAdjustPopover(null)}
        />
      )}

      {saveModalOpen && (
        <SaveModal
          activeBlock={activeBlock || { id: '__base__', name: 'Base Pricing' }}
          blockType="pricing"
          onOverwrite={handleOverwrite}
          onSaveNew={handleSaveNew}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </>
  )
}

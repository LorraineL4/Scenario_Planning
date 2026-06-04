import { useState, useRef, useEffect } from 'react'
import { Icon } from './ui.jsx'
import { PlanDropdown, SaveModal } from './DistributionEditor.jsx'

const PERIODS_DEFAULT = ['P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12']

const EMPTY_FORM = { name: '', promo_price: '', weeks: '', scan: '', fixed_fee: '', expected_lift: '' }

const PALETTE = [
  { bg: '#eaf2f8', fg: '#165788', bd: '#9bbfd8' },
  { bg: '#e3f4f3', fg: '#167672', bd: '#8ed4d1' },
  { bg: '#fef3e2', fg: '#9a5900', bd: '#f5c87e' },
  { bg: '#f5ecfe', fg: '#6d28d9', bd: '#c4a9f0' },
  { bg: '#ecfdf5', fg: '#065f46', bd: '#6ee7b7' },
  { bg: '#fce7f3', fg: '#9d174d', bd: '#f9a8d4' },
]
const pal = (i) => PALETTE[(i ?? 0) % PALETTE.length]

const FORM_WIDTH = 330
const FORM_HEIGHT_EST = 390

function getAnchor(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  let left = rect.left
  let top  = rect.bottom + 6
  if (left + FORM_WIDTH  > window.innerWidth  - 12) left = window.innerWidth  - FORM_WIDTH  - 12
  if (top  + FORM_HEIGHT_EST > window.innerHeight - 12) top = rect.top - FORM_HEIGHT_EST - 6
  return { top: Math.max(12, top), left: Math.max(12, left) }
}

function renderField(label, key, values, onChange, opts = {}) {
  const { prefix = null, suffix = null, isNumber = false } = opts
  const hasPre = prefix != null, hasSuf = suffix != null
  const borderRadius = hasPre ? (hasSuf ? 0 : '0 6px 6px 0') : hasSuf ? '6px 0 0 6px' : 6
  const affixBase = {
    padding: '0 9px', display: 'flex', alignItems: 'center', flexShrink: 0,
    background: 'var(--panel-2)', border: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)',
  }
  return (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {hasPre && <span style={{ ...affixBase, borderRight: 'none', borderRadius: '6px 0 0 6px' }}>{prefix}</span>}
        <input
          type={isNumber ? 'number' : 'text'}
          inputMode={isNumber ? 'decimal' : undefined}
          value={values[key] ?? ''}
          onChange={e => onChange({ ...values, [key]: e.target.value })}
          style={{
            flex: 1, minWidth: 0, padding: '7px 9px', border: '1px solid var(--line)',
            borderRadius, fontSize: 13, background: 'var(--panel)', color: 'var(--ink)',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        {hasSuf && <span style={{ ...affixBase, borderLeft: 'none', borderRadius: '0 6px 6px 0' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function PromoFormPanel({ title, values, onChange, onSubmit, submitLabel, onCancel, onRemove, onCopy }) {
  const valid = values.name.trim() !== '' && values.promo_price !== '' && values.weeks !== ''
  const row2 = { display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line-strong)',
      borderRadius: 12, boxShadow: 'var(--shadow)', padding: 18, width: FORM_WIDTH,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {renderField('Event Name', 'name', values, onChange)}
        <div style={row2}>
          {renderField('Promo Price', 'promo_price', values, onChange, { prefix: '$', isNumber: true })}
          {renderField('Weeks', 'weeks', values, onChange, { isNumber: true })}
        </div>
        <div style={row2}>
          {renderField('Scan', 'scan', values, onChange, { prefix: '$', isNumber: true })}
          {renderField('Fixed Fee', 'fixed_fee', values, onChange, { prefix: '$', isNumber: true })}
        </div>
        {renderField('Expected Lift', 'expected_lift', values, onChange, { suffix: '%', isNumber: true })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onSubmit} disabled={!valid} style={{
          flex: 1, padding: '8px', border: 'none', borderRadius: 7,
          background: valid ? 'var(--navy)' : 'var(--line)',
          color: valid ? '#fff' : 'var(--muted)',
          fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
        }}>{submitLabel}</button>
        <button onClick={onCancel} style={{
          padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 7,
          background: 'var(--panel)', color: 'var(--ink-2)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
      {(onCopy || onRemove) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {onCopy && (
            <button onClick={onCopy} style={{
              flex: 1, padding: '7px', borderRadius: 7, border: '1px solid var(--line-strong)',
              background: 'var(--panel-2)', color: 'var(--ink-2)',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Copy to Cells…</button>
          )}
          {onRemove && (
            <button onClick={onRemove} style={{
              flex: 1, padding: '7px', borderRadius: 7, border: '1px solid var(--neg)',
              background: 'transparent', color: 'var(--neg)',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Remove</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PromotionEditor({
  initialGrid = {},
  initialPromos = [],
  initialActiveBlock = null,
  blocks = [],
  baseGrid = {},
  basePromos = [],
  rows,
  fiscalCalendar = {},
  onSaveNew,
  onOverwrite,
  onBlockChange,
  onDraftChange,
}) {
  const productGroups = (() => {
    if (!rows?.length) return []
    const seen = new Set(), out = []
    for (const r of rows) { if (!seen.has(r.Product_Group)) { seen.add(r.Product_Group); out.push(r.Product_Group) } }
    return out
  })()

  const periods = (() => {
    const keys = Object.keys(fiscalCalendar || {})
    return keys.length ? keys : PERIODS_DEFAULT
  })()

  const [promos, setPromos]           = useState(() => [...(initialPromos || [])])
  const [grid, setGrid]               = useState(() => ({ ...(initialGrid || {}) }))
  const [activeBlock, setActiveBlock] = useState(initialActiveBlock || null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [hasEdits, setHasEdits] = useState(false)

  useEffect(() => {
    onDraftChange?.(activeBlock || hasEdits ? { grid, promos } : null)
  }, [grid, promos, activeBlock, hasEdits]) // eslint-disable-line

  const [selectedCells, setSelectedCells] = useState(new Set())
  const [formOpen, setFormOpen]           = useState(false)
  const [formAnchor, setFormAnchor]       = useState({ top: 0, left: 0 })
  const [formValues, setFormValues]       = useState(EMPTY_FORM)
  const [mode, setMode]                   = useState('idle')
  const [pendingPromo, setPendingPromo]   = useState(null)
  const [editingKey, setEditingKey]       = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    if (!formOpen) return
    function handler(e) {
      if (formRef.current && !formRef.current.contains(e.target) && !e.target.closest('td')) {
        setFormOpen(false); setMode('idle'); setEditingKey(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [formOpen])

  // Keys are always 3-part: "pg|||period|||slot" where slot is 1 or 2
  const cellKey = (pg, period, slot) => `${pg}|||${period}|||${slot}`

  // ── Block loading ─────────────────────────────────────────────────────────

  const loadBase = () => {
    setGrid({ ...baseGrid }); setPromos([...basePromos])
    setActiveBlock(null); setHasEdits(false); setFormOpen(false); setMode('idle')
    onBlockChange?.('__base__')
  }

  const loadBlock = (block) => {
    setGrid({ ...(block.inputs?.grid || {}) }); setPromos([...(block.inputs?.promos || [])])
    setActiveBlock(block); setHasEdits(false); setFormOpen(false); setMode('idle')
    onBlockChange?.(block.id)
  }

  const handleSaveNew = (name) => {
    const id = `promo-${Date.now()}`
    const state = { promos, grid }
    onSaveNew?.(id, name, state)
    setActiveBlock({ id, name, inputs: state })
    onBlockChange?.(id)
    setSaveModalOpen(false)
  }

  const handleOverwrite = () => {
    if (activeBlock) {
      onOverwrite?.(activeBlock.id, { promos, grid })
    } else {
      onOverwrite?.('__base__', { promos, grid })
      onBlockChange?.('__base__')
    }
    setSaveModalOpen(false)
  }

  // ── Cell interaction ──────────────────────────────────────────────────────

  function handleCellClick(pg, period, slot, e) {
    const key = cellKey(pg, period, slot)
    if (mode === 'selecting') {
      setSelectedCells(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
      return
    }
    if (formOpen && editingKey === key) { setFormOpen(false); setMode('idle'); setEditingKey(null); return }
    const anchor = getAnchor(e); setFormAnchor(anchor)
    const entry = grid[key]
    if (entry) {
      setFormValues({ name: entry.name ?? '', promo_price: String(entry.promo_price ?? ''), weeks: String(entry.weeks ?? ''), scan: String(entry.scan ?? ''), fixed_fee: String(entry.fixed_fee ?? ''), expected_lift: String(entry.expected_lift ?? '') })
      setEditingKey(key); setMode('editing-cell')
    } else {
      setFormValues(EMPTY_FORM); setEditingKey(key); setMode('adding-cell')
    }
    setFormOpen(true)
  }

  function handleAddToCell() {
    if (!editingKey) return
    const name = formValues.name.trim()
    const existing = promos.find(p => p.name === name)
    const colorIdx = existing ? existing.colorIdx : promos.length
    const promo = {
      id: `promo-${Date.now()}`, colorIdx, name,
      promo_price: parseFloat(formValues.promo_price) || 0,
      weeks: parseInt(formValues.weeks) || 0,
      scan: parseFloat(formValues.scan) || 0,
      fixed_fee: parseFloat(formValues.fixed_fee) || 0,
      expected_lift: parseFloat(formValues.expected_lift) || 0,
    }
    if (!existing) setPromos(ps => [...ps, { id: promo.id, colorIdx, name }])
    setGrid(g => ({ ...g, [editingKey]: promo }))
    setHasEdits(true); setFormOpen(false); setMode('idle'); setEditingKey(null)
  }

  function handleUpdateCell() {
    if (!editingKey) return
    setGrid(g => ({ ...g, [editingKey]: { ...(g[editingKey] || {}), name: formValues.name.trim(), promo_price: parseFloat(formValues.promo_price) || 0, weeks: parseInt(formValues.weeks) || 0, scan: parseFloat(formValues.scan) || 0, fixed_fee: parseFloat(formValues.fixed_fee) || 0, expected_lift: parseFloat(formValues.expected_lift) || 0 } }))
    setHasEdits(true); setFormOpen(false); setMode('idle'); setEditingKey(null)
  }

  function handleCopyClick() {
    if (!editingKey) return
    setPendingPromo({ ...grid[editingKey] }); setSelectedCells(new Set())
    setFormOpen(false); setMode('selecting'); setEditingKey(null)
  }

  function handlePopulate() {
    if (!pendingPromo || !selectedCells.size) return
    setGrid(g => { const next = { ...g }; for (const k of selectedCells) next[k] = { ...pendingPromo, id: `promo-${Date.now()}-${k}` }; return next })
    setHasEdits(true); setSelectedCells(new Set()); setPendingPromo(null); setMode('idle')
  }

  function handleRemoveCell() {
    if (!editingKey) return
    setGrid(g => { const next = { ...g }; delete next[editingKey]; return next })
    setHasEdits(true); setFormOpen(false); setMode('idle'); setEditingKey(null)
  }

  const selecting = mode === 'selecting'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <div className="bar">
        <div className="bar-left" style={{ gap: 8 }}>
          <PlanDropdown
            activeBlock={activeBlock}
            blocks={blocks}
            onSelectBase={loadBase}
            onSelectBlock={loadBlock}
            baseLabel="Base Promotion"
          />
          {selecting && (
            <>
              <button className="btn sm" onClick={() => { setPendingPromo(null); setSelectedCells(new Set()); setMode('idle') }}>
                <Icon name="x" size={13} /> Cancel
              </button>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{pendingPromo?.name}</span>
                {' — click cells to copy to'}
              </div>
              <button
                className="btn sm primary"
                onClick={handlePopulate}
                disabled={selectedCells.size === 0}
                style={{ opacity: selectedCells.size === 0 ? 0.45 : 1 }}
              >
                Copy to {selectedCells.size > 0 ? `${selectedCells.size} cell${selectedCells.size !== 1 ? 's' : ''}` : 'selected cells'}
              </button>
            </>
          )}
        </div>
        <div className="bar-right">
          <button className="btn sm" onClick={() => setSaveModalOpen(true)}>Save</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="dap">
          <thead>
            <tr>
              <th className="sticky-l c-pg" style={{ textAlign: 'left' }}>Product Group</th>
              {periods.map(p => (
                <th key={p} className="num c-mon" style={{ minWidth: 88 }}>{fiscalCalendar[p]?.month || p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productGroups.length === 0 ? (
              <tr><td className="empty" colSpan={periods.length + 1}>No data loaded.</td></tr>
            ) : productGroups.map((pg, gi) => {
              const renderPromoRow = (slot, isFirst) => (
                <tr key={pg + '-' + slot} className={isFirst && gi > 0 ? 'pg-start' : ''}>
                  <td className={'sticky-l c-pg pg-cell' + (isFirst ? ' pg-lead' : '')}
                    style={isFirst ? {} : { fontSize: 11, color: 'var(--muted)', fontWeight: 500, paddingTop: 1, paddingBottom: 1 }}>
                    {isFirst ? pg : 'Promo 2'}
                  </td>
                  {periods.map(period => {
                    const key = cellKey(pg, period, slot)
                    const entry = grid[key]
                    const sel = selectedCells.has(key)
                    const isActive = formOpen && editingKey === key
                    const c = entry ? pal(entry.colorIdx) : null
                    return (
                      <td
                        key={period}
                        onClick={(e) => handleCellClick(pg, period, slot, e)}
                        style={{
                          cursor: 'pointer', padding: '3px 6px', verticalAlign: 'middle',
                          height: 34, minWidth: 88,
                          background: sel ? 'rgba(22,87,136,.12)' : isActive ? 'rgba(22,87,136,.06)' : entry ? c.bg : undefined,
                          boxShadow: sel ? 'inset 0 0 0 2px var(--navy)' : isActive ? 'inset 0 0 0 2px var(--navy)' : entry ? `inset 0 0 0 1px ${c.bd}` : undefined,
                          transition: 'background .1s',
                        }}
                      >
                        {entry ? (
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: c.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                            {entry.name}
                          </div>
                        ) : selecting ? (
                          <div style={{ height: 22, borderRadius: 4, border: `1.5px dashed ${sel ? 'var(--navy)' : 'var(--line-strong)'}` }} />
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              )
              return [renderPromoRow(1, true), renderPromoRow(2, false)]
            })}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div ref={formRef} style={{ position: 'fixed', top: formAnchor.top, left: formAnchor.left, zIndex: 60 }}>
          <PromoFormPanel
            title={mode === 'editing-cell' ? 'Edit Promotion' : 'Add Promotion'}
            values={formValues}
            onChange={setFormValues}
            onSubmit={mode === 'editing-cell' ? handleUpdateCell : handleAddToCell}
            submitLabel={mode === 'editing-cell' ? 'Update' : 'Save'}
            onCancel={() => { setFormOpen(false); setMode('idle'); setEditingKey(null) }}
            onRemove={mode === 'editing-cell' ? handleRemoveCell : null}
            onCopy={mode === 'editing-cell' ? handleCopyClick : null}
          />
        </div>
      )}

      {saveModalOpen && (
        <SaveModal
          activeBlock={activeBlock || { id: '__base__', name: 'Base Promotion' }}
          blockType="promotion"
          onOverwrite={handleOverwrite}
          onSaveNew={handleSaveNew}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </div>
  )
}

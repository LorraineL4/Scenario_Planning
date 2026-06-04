import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Icon } from './ui.jsx'
import { Cell, ApplyPopover, MONTHS, heatColor, isDarkFill, clampACV } from './DistributionTable.jsx'

const fmt = {
  vel:  (n) => (Number(n) || 0).toFixed(2),
  acv:  (n) => Math.round(Number(n) || 0).toString(),
  prob: (n) => Math.round(Number(n) || 0) + '%',
}

// ─── Save modal ───────────────────────────────────────────────────────────────

export function SaveModal({ activeBlock, blockType = 'distribution', onOverwrite, onSaveNew, onClose }) {
  const [step, setStep] = useState(activeBlock ? 'choice' : 'name')
  const [name, setName] = useState('')
  const inputRef = useRef(null)
  const typeLabel = blockType.charAt(0).toUpperCase() + blockType.slice(1)

  useEffect(() => { if (step === 'name') inputRef.current?.focus() }, [step])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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
  )

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
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
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSaveNew(name.trim()) }}
              placeholder="e.g. Conservative, High growth…"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)',
                fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
                background: 'var(--panel-2)', boxSizing: 'border-box', marginBottom: 16, outline: 'none',
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
  )
}

// ─── Plan dropdown ────────────────────────────────────────────────────────────

export function PlanDropdown({ activeBlock, blocks, onSelectBase, onSelectBlock, baseLabel = 'Base Distribution' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = activeBlock ? activeBlock.name : baseLabel
  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
    borderRadius: 7, border: '1px solid var(--line)',
    background: activeBlock ? 'var(--navy-50)' : 'var(--panel)',
    color: activeBlock ? 'var(--navy)' : 'var(--ink-2)',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', maxWidth: 240,
  }
  const itemStyle = (active) => ({
    display: 'flex', alignItems: 'center', width: '100%',
    padding: '8px 12px', borderRadius: 7, border: 'none',
    background: active ? 'var(--navy-50)' : 'transparent',
    color: active ? 'var(--navy)' : 'var(--ink)',
    fontWeight: active ? 700 : 500, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  })

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
            <button onClick={() => { onSelectBase(); setOpen(false) }} style={itemStyle(!activeBlock)}>
              <span style={{ flex: 1 }}>{baseLabel}</span>
              {!activeBlock && <span style={{ fontSize: 11, fontWeight: 700 }}>current</span>}
            </button>
            {blocks.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--line)', margin: '4px 8px' }} />
                {blocks.map(bl => (
                  <button key={bl.id} onClick={() => { onSelectBlock(bl); setOpen(false) }} style={itemStyle(activeBlock?.id === bl.id)}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bl.name}</span>
                    {activeBlock?.id === bl.id && <span style={{ fontSize: 11, fontWeight: 700, flex: 'none' }}>current</span>}
                  </button>
                ))}
              </>
            )}
            {blocks.length === 0 && (
              <div style={{ padding: '4px 12px 8px', fontSize: 12, color: 'var(--muted)' }}>No saved blocks yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Editable distribution table ──────────────────────────────────────────────

export default function DistributionEditor({
  initialRows,
  initialActiveBlock = null,
  blocks = [],
  baseRows,
  showBasePlan = true,
  onSaveNew,
  onOverwrite,
  onBlockChange,
}) {
  const [rows, setRows] = useState(() =>
    (initialRows || []).map(r => ({ ...r, months: { ...r.months } }))
  )
  const [activeBlock, setActiveBlock] = useState(initialActiveBlock)
  const [editing, setEditing]   = useState(null)
  const [edited, setEdited]     = useState(() => new Set())
  const [popover, setPopover]   = useState(null)
  const [search, setSearch]     = useState('')
  const [saveModalOpen, setSaveModalOpen] = useState(false)

  // Groups for table rendering
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter(r => r.SKU_name.toLowerCase().includes(q) || r.Product_Group.toLowerCase().includes(q))
      : rows
    const order = [], map = new Map()
    for (const r of filtered) {
      if (!map.has(r.Product_Group)) { map.set(r.Product_Group, []); order.push(r.Product_Group) }
      map.get(r.Product_Group).push(r)
    }
    return order.map(g => ({ name: g, rows: map.get(g) }))
  }, [rows, search])

  const totalShown = groups.reduce((a, g) => a + g.rows.length, 0)

  const markEdited = (rowId, field) =>
    setEdited(s => { const n = new Set(s); n.add(rowId + '|' + field); return n })

  const commitCell = useCallback((rowId, field, raw) => {
    setEditing(null)
    if (raw === null || raw === undefined) return
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r
      const nr = { ...r }
      if (field === 'unit_velocity') nr.unit_velocity = Math.max(0, parseFloat(raw) || 0)
      else if (field === 'dist_prob') nr.dist_prob = Math.max(0, Math.min(100, Math.round(parseFloat(raw) || 0)))
      else if (field.startsWith('m:')) {
        const m = field.slice(2)
        nr.months = { ...r.months, [m]: clampACV(parseFloat(raw)) }
      }
      return nr
    }))
    markEdited(rowId, field)
  }, [])

  const applyRange = useCallback((rowId, start, end, value) => {
    const si = MONTHS.indexOf(start), ei = MONTHS.indexOf(end)
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r
      const months = { ...r.months }
      for (let i = si; i <= ei; i++) months[MONTHS[i]] = value
      return { ...r, months }
    }))
    setEdited(s => {
      const n = new Set(s)
      for (let i = si; i <= ei; i++) n.add(rowId + '|m:' + MONTHS[i])
      return n
    })
    setPopover(null)
  }, [])

  const loadBase = useCallback(() => {
    setRows((baseRows || []).map(r => ({ ...r, months: { ...r.months } })))
    setActiveBlock(null)
    setEdited(new Set())
    setEditing(null)
    setPopover(null)
    onBlockChange?.('__base__')
  }, [baseRows, onBlockChange])

  const loadBlock = useCallback((block) => {
    setRows((block.inputs || []).map(r => ({ ...r, months: { ...r.months } })))
    setActiveBlock(block)
    setEdited(new Set())
    setEditing(null)
    setPopover(null)
    onBlockChange?.(block.id)
  }, [onBlockChange])

  const handleSaveNew = (name) => {
    const snapshot = rows.map(r => ({ ...r, months: { ...r.months } }))
    onSaveNew?.(name, snapshot)
    setSaveModalOpen(false)
  }

  const handleOverwrite = () => {
    if (!activeBlock) return
    const snapshot = rows.map(r => ({ ...r, months: { ...r.months } }))
    onOverwrite?.(activeBlock.id, snapshot)
    setSaveModalOpen(false)
  }

  const popRow = popover ? rows.find(r => r.id === popover.rowId) : null

  return (
    <>
      {/* Bar */}
      <div className="bar">
        <div className="bar-left" style={{ gap: 8 }}>
          <PlanDropdown
            activeBlock={activeBlock}
            blocks={blocks}
            onSelectBase={loadBase}
            onSelectBlock={loadBlock}
          />
          <div className="bar-sub">
            {totalShown} of {rows.length} SKUs
          </div>
        </div>
        <div className="bar-right">
          <div className="search">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M10.5 3a7.5 7.5 0 105.3 12.8l5.2 5.2 1.4-1.4-5.2-5.2A7.5 7.5 0 0010.5 3z"/>
            </svg>
            <input placeholder="Search SKU or product group…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-x" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button className="btn sm" onClick={() => setSaveModalOpen(true)}>Save</button>
        </div>
      </div>

      {/* Table */}
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
              g.rows.map((r, ri) => (
                <tr key={r.id} className={ri === 0 && gi > 0 ? 'pg-start' : ''}>
                  <td className={'sticky-l c-pg pg-cell' + (ri === 0 ? ' pg-lead' : '')}>{ri === 0 ? r.Product_Group : ''}</td>
                  <td className="sticky-l c-sku sku-cell">{r.SKU_name}</td>
                  <Cell
                    align="r" value={r.unit_velocity} display={fmt.vel(r.unit_velocity)}
                    edited={edited.has(r.id + '|unit_velocity')}
                    editing={editing?.rowId === r.id && editing?.field === 'unit_velocity'}
                    onStart={() => setEditing({ rowId: r.id, field: 'unit_velocity' })}
                    onCommit={(v) => commitCell(r.id, 'unit_velocity', v)}
                  />
                  <td className="cell num r ro acv-cur"><span className="cell-val">{fmt.acv(r.current_ACV)}</span></td>
                  {MONTHS.map(m => (
                    <Cell
                      key={m} align="r" heat={r.months[m]}
                      value={r.months[m]} display={fmt.acv(r.months[m])}
                      edited={edited.has(r.id + '|m:' + m)}
                      editing={editing?.rowId === r.id && editing?.field === 'm:' + m}
                      onStart={() => setEditing({ rowId: r.id, field: 'm:' + m })}
                      onCommit={(v) => commitCell(r.id, 'm:' + m, v)}
                    />
                  ))}
                  <Cell
                    align="r" suffix="%" value={r.dist_prob} display={Math.round(r.dist_prob)}
                    edited={edited.has(r.id + '|dist_prob')}
                    editing={editing?.rowId === r.id && editing?.field === 'dist_prob'}
                    onStart={() => setEditing({ rowId: r.id, field: 'dist_prob' })}
                    onCommit={(v) => commitCell(r.id, 'dist_prob', v)}
                  />
                  <td className="sticky-r c-adj">
                    <button
                      className={'adj-btn' + (popover?.rowId === r.id ? ' on' : '')}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setPopover(popover?.rowId === r.id ? null : { rowId: r.id, anchor: rect })
                      }}
                    >Adjust ▾</button>
                  </td>
                </tr>
              ))
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

      {saveModalOpen && (
        <SaveModal
          activeBlock={activeBlock}
          blockType="distribution"
          onOverwrite={handleOverwrite}
          onSaveNew={handleSaveNew}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </>
  )
}

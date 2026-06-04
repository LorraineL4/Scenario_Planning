import { useState, useMemo, useCallback, Fragment } from 'react'
import Cell from './Cell.jsx'
import ApplyPopover from './ApplyPopover.jsx'

const clampACV = (n) => Math.max(0, Math.min(100, Number(n) || 0))
const fmtACV   = (n) => (Math.round((Number(n) || 0) * 10) / 10).toString()
const fmtVel   = (n) => (Number(n) || 0).toFixed(2)

function toRows(apiData) {
  const cal     = apiData.fiscal_calendar || {}
  const periods = Object.keys(cal)
  return Object.entries(apiData.skus || {}).map(([name, sku], i) => ({
    id:           `sku_${i}`,
    Product_Group: name,
    SKU_name:      name,
    unit_velocity: sku.velocity || 0,
    // current_acv from extractor is decimal (0–1); display as 0–100
    current_ACV:  (sku.current_acv || 0) * 100,
    // acv_pct is decimal per period; convert to 0–100 for display/editing
    acv: Object.fromEntries(periods.map((p) => [p, (sku.acv_pct?.[p] || 0) * 100])),
    // probability is decimal per period; use first period for the summary column
    dist_prob: (sku.probability?.[periods[0]] ?? 1.0) * 100,
  }))
}

export default function DistributionTab({ data }) {
  const { periods, periodLabels } = useMemo(() => {
    const cal = data.fiscal_calendar || {}
    const ps  = Object.keys(cal)
    return {
      periods:      ps,
      periodLabels: Object.fromEntries(ps.map((p) => [p, cal[p].month])),
    }
  }, [data])

  const [rows,      setRows]      = useState(() => toRows(data))
  const [search,    setSearch]    = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [edited,    setEdited]    = useState(() => new Set())
  const [editing,   setEditing]   = useState(null)   // { rowId, field }
  const [popover,   setPopover]   = useState(null)   // { rowId, anchor }

  const markEdited = (rowId, field) =>
    setEdited((s) => { const n = new Set(s); n.add(`${rowId}|${field}`); return n })

  const commitCell = useCallback((rowId, field, raw) => {
    setEditing(null)
    if (raw === null || raw === undefined) return
    setRows((rs) => rs.map((r) => {
      if (r.id !== rowId) return r
      if (field === 'unit_velocity') return { ...r, unit_velocity: Math.max(0, parseFloat(raw) || 0) }
      if (field === 'dist_prob')     return { ...r, dist_prob: Math.max(0, Math.min(100, Math.round(parseFloat(raw) || 0))) }
      if (field.startsWith('acv:')) {
        const p = field.slice(4)
        return { ...r, acv: { ...r.acv, [p]: clampACV(parseFloat(raw)) } }
      }
      return r
    }))
    markEdited(rowId, field)
  }, [])

  const applyRange = useCallback((rowId, startIdx, endIdx, value) => {
    setRows((rs) => rs.map((r) => {
      if (r.id !== rowId) return r
      const acv = { ...r.acv }
      for (let i = startIdx; i <= endIdx; i++) acv[periods[i]] = value
      return { ...r, acv }
    }))
    setEdited((s) => {
      const n = new Set(s)
      for (let i = startIdx; i <= endIdx; i++) n.add(`${rowId}|acv:${periods[i]}`)
      return n
    })
    setPopover(null)
  }, [periods])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) => r.SKU_name.toLowerCase().includes(q) || r.Product_Group.toLowerCase().includes(q))
      : rows
    const order = [], map = new Map()
    for (const r of filtered) {
      if (!map.has(r.Product_Group)) { map.set(r.Product_Group, []); order.push(r.Product_Group) }
      map.get(r.Product_Group).push(r)
    }
    return order.map((g) => ({ name: g, rows: map.get(g) }))
  }, [rows, search])

  const totalShown   = groups.reduce((a, g) => a + g.rows.length, 0)
  const allCollapsed = rows.length > 0 && groups.length > 0 && groups.every((g) => collapsed.has(g.name))
  const toggleGroup  = (g) => setCollapsed((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n })
  const toggleAll    = () => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.name)))

  const popRow = popover ? rows.find((r) => r.id === popover.rowId) : null
  const colSpan = periods.length + 5  // pg + sku + velocity + current_acv + periods + dist_prob + adjust

  return (
    <>
      <div className="bar" style={{ padding: '10px 18px' }}>
        <div className="search">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" d="M10.5 3a7.5 7.5 0 105.3 12.8l5.2 5.2 1.4-1.4-5.2-5.2A7.5 7.5 0 0010.5 3z"/>
          </svg>
          <input
            placeholder="Search SKU or product group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button className="search-x" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{totalShown} of {rows.length} SKUs</span>
          <button className="btn sm" onClick={toggleAll}>{allCollapsed ? 'Expand all' : 'Collapse all'}</button>
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
              {periods.map((p) => (
                <th key={p} className="num c-mon">
                  {periodLabels[p]}<br/>
                  <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 10 }}>{p}</span>
                </th>
              ))}
              <th className="num">Dist<br/>Prob</th>
              <th className="sticky-r c-adj">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCol = collapsed.has(g.name)
              return (
                <Fragment key={g.name}>
                  <tr className="grp">
                    <td className="grp-cell" colSpan={colSpan}>
                      <button className="grp-toggle" onClick={() => toggleGroup(g.name)}>
                        <span className={'caret' + (isCol ? ' col' : '')}>▾</span>
                        <span>{g.name}</span>
                        <span className="grp-count">{g.rows.length}</span>
                      </button>
                    </td>
                  </tr>
                  {!isCol && g.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="sticky-l c-pg pg-cell">{r.Product_Group}</td>
                      <td className="sticky-l c-sku sku-cell">{r.SKU_name}</td>
                      <Cell
                        align="r"
                        value={r.unit_velocity} display={fmtVel(r.unit_velocity)}
                        edited={edited.has(`${r.id}|unit_velocity`)}
                        editing={editing?.rowId === r.id && editing?.field === 'unit_velocity'}
                        onStart={() => setEditing({ rowId: r.id, field: 'unit_velocity' })}
                        onCommit={(v) => commitCell(r.id, 'unit_velocity', v)}
                      />
                      <td className="cell num r ro">
                        <span className="cell-val">{fmtACV(r.current_ACV)}</span>
                      </td>
                      {periods.map((p) => (
                        <Cell
                          key={p} align="r" heat={r.acv[p]}
                          value={r.acv[p]} display={fmtACV(r.acv[p])}
                          edited={edited.has(`${r.id}|acv:${p}`)}
                          editing={editing?.rowId === r.id && editing?.field === `acv:${p}`}
                          onStart={() => setEditing({ rowId: r.id, field: `acv:${p}` })}
                          onCommit={(v) => commitCell(r.id, `acv:${p}`, v)}
                        />
                      ))}
                      <Cell
                        align="r" suffix="%"
                        value={r.dist_prob} display={Math.round(r.dist_prob)}
                        edited={edited.has(`${r.id}|dist_prob`)}
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
                        >
                          Adjust ▾
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {totalShown === 0 && (
              <tr>
                <td className="empty" colSpan={colSpan}>
                  {search ? `No SKUs match "${search}".` : 'No SKUs found in this workbook.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {popover && popRow && (
        <ApplyPopover
          row={popRow}
          anchor={popover.anchor}
          periods={periods}
          periodLabels={periodLabels}
          onApply={(si, ei, v) => applyRange(popover.rowId, si, ei, v)}
          onClose={() => setPopover(null)}
        />
      )}
    </>
  )
}

import { useState, useRef, useEffect, useMemo } from 'react'

// ─── Shared constants & helpers ───────────────────────────────────────────────

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export const clampACV = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))

const lerp = (a, b, t) => a + (b - a) * t
export function heatColor(v) {
  v = Math.max(0, Math.min(100, Number(v) || 0))
  const red = [247, 64, 58], white = [255, 255, 255], navy = [22, 87, 136]
  let c
  if (v <= 50) { const t = v / 50; c = red.map((x, i) => lerp(x, white[i], t)) }
  else { const t = (v - 50) / 50; c = white.map((x, i) => lerp(x, navy[i], t)) }
  return c.map(Math.round)
}
export const isDarkFill = ([r, g, b]) => (r * 299 + g * 587 + b * 114) / 1000 < 150

// ─── Cell ─────────────────────────────────────────────────────────────────────

export function Cell({ value, display, edited, editing, onStart, onCommit, align, heat, readOnly, suffix }) {
  const inputRef = useRef(null)
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])
  const style = {}
  if (heat != null) {
    const rgb = heatColor(heat)
    style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    if (!edited) style.color = isDarkFill(rgb) ? '#ffffff' : 'var(--ink)'
  }
  const cls = 'cell num' + (align ? ' ' + align : '') + (edited ? ' edited' : '') + (readOnly ? ' ro' : '')
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
            if (e.key === 'Enter') { e.preventDefault(); onCommit(e.target.value) }
            else if (e.key === 'Escape') { e.preventDefault(); onCommit(null) }
          }}
        />
      </td>
    )
  }
  return (
    <td className={cls} style={style} onClick={readOnly ? undefined : onStart} title={readOnly ? '' : 'Click to edit'}>
      <span className="cell-val">{display}{suffix || ''}</span>
    </td>
  )
}

// ─── ApplyPopover ─────────────────────────────────────────────────────────────

export function ApplyPopover({ row, anchor, onApply, onClose, months = MONTHS }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState(months[months.length - 1])
  const [val, setVal] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  useEffect(() => {
    if (start && months.indexOf(end) < months.indexOf(start)) setEnd(start)
  }, [start]) // eslint-disable-line

  const valNum = parseFloat(val)
  const valid = start && !isNaN(valNum) && valNum >= 0 && valNum <= 100

  const pos = useMemo(() => {
    if (!anchor) return { top: 80, left: 80 }
    const W = 268, H = 250, m = 8
    let left = anchor.left - W - 10
    if (left < m) left = anchor.right + 10
    let top = anchor.top
    if (top + H > window.innerHeight - m) top = window.innerHeight - H - m
    if (top < m) top = m
    return { top, left }
  }, [anchor])

  const endOptions = months.filter((m) => !start || months.indexOf(m) >= months.indexOf(start))

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
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className={'pop-field' + (start ? '' : ' disabled')}>
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
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onApply(start, end, clampACV(valNum)) }}
        />
      </label>
      <button className="pop-apply" disabled={!valid} onClick={() => onApply(start, end, clampACV(valNum))}>
        Apply {start ? `${start}–${end}` : ''}
      </button>
    </div>
  )
}

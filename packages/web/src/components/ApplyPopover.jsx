import { useState, useRef, useEffect, useMemo } from 'react'

const clampACV = (n) => Math.max(0, Math.min(100, Number(n) || 0))

export default function ApplyPopover({ row, anchor, periods, periodLabels, onApply, onClose }) {
  const [startIdx, setStartIdx] = useState('')
  const [endIdx,   setEndIdx]   = useState(String(periods.length - 1))
  const [val,      setVal]      = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  useEffect(() => {
    if (startIdx !== '' && endIdx !== '' && parseInt(endIdx) < parseInt(startIdx)) {
      setEndIdx(startIdx)
    }
  }, [startIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const valNum = parseFloat(val)
  const valid  = startIdx !== '' && !isNaN(valNum) && valNum >= 0 && valNum <= 100

  const pos = useMemo(() => {
    if (!anchor) return { top: 80, left: 80 }
    const W = 268, H = 270, m = 8
    let left = anchor.left - W - 10
    if (left < m) left = anchor.right + 10
    let top = anchor.top
    if (top + H > window.innerHeight - m) top = window.innerHeight - H - m
    if (top < m) top = m
    return { top, left }
  }, [anchor])

  const startLabel = startIdx !== '' ? `${periodLabels[periods[parseInt(startIdx)]]} (${periods[parseInt(startIdx)]})` : ''
  const endLabel   = endIdx   !== '' ? `${periodLabels[periods[parseInt(endIdx)]]}   (${periods[parseInt(endIdx)]})` : ''

  return (
    <div className="pop" ref={ref} style={{ top: pos.top, left: pos.left }}>
      <div className="pop-head">
        <div className="pop-title">Adjust ACV range</div>
        <button className="pop-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="pop-sku">{row.SKU_name}</div>

      <label className="pop-field">
        <span>Start period</span>
        <select value={startIdx} onChange={(e) => setStartIdx(e.target.value)}>
          <option value="" disabled>Select…</option>
          {periods.map((p, i) => (
            <option key={p} value={String(i)}>{periodLabels[p]} ({p})</option>
          ))}
        </select>
      </label>

      <label className={'pop-field' + (startIdx === '' ? ' disabled' : '')}>
        <span>End period</span>
        <select
          value={endIdx}
          disabled={startIdx === ''}
          onChange={(e) => setEndIdx(e.target.value)}
        >
          {periods.map((p, i) => {
            if (startIdx !== '' && i < parseInt(startIdx)) return null
            return <option key={p} value={String(i)}>{periodLabels[p]} ({p})</option>
          })}
        </select>
      </label>

      <label className="pop-field">
        <span>ACV value (0–100)</span>
        <input
          type="number" min="0" max="100" step="0.1"
          value={val} placeholder="e.g. 45"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid)
              onApply(parseInt(startIdx), parseInt(endIdx), clampACV(valNum))
          }}
        />
      </label>

      <button
        className="pop-apply"
        disabled={!valid}
        onClick={() => onApply(parseInt(startIdx), parseInt(endIdx), clampACV(valNum))}
      >
        Apply {startLabel ? `${startLabel} – ${endLabel}` : ''}
      </button>
    </div>
  )
}

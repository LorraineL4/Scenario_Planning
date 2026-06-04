import { useRef, useEffect } from 'react'

export default function Cell({ value, display, edited, editing, onStart, onCommit, align, heat, readOnly, suffix }) {
  const inputRef = useRef(null)
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const style = {}
  if (heat != null) {
    const pct = Math.max(0, Math.min(100, heat))
    style.backgroundImage = `linear-gradient(to right, var(--heat) ${pct}%, transparent ${pct}%)`
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
            if (e.key === 'Enter')  { e.preventDefault(); onCommit(e.target.value) }
            if (e.key === 'Escape') { e.preventDefault(); onCommit(null) }
          }}
        />
      </td>
    )
  }

  return (
    <td
      className={cls}
      style={style}
      onClick={readOnly ? undefined : onStart}
      title={readOnly ? '' : 'Click to edit'}
    >
      <span className="cell-val">{display}{suffix || ''}</span>
    </td>
  )
}

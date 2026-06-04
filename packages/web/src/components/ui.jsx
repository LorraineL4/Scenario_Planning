export const TAG = {
  navy:  { c: '#165788', soft: '#eaf2f8' },
  teal:  { c: '#1f9c98', soft: '#e3f4f3' },
  coral: { c: '#F7403A', soft: '#fdeceb' },
  rose:  { c: '#c07880', soft: '#f7ebee' },
}
export const tagColor = (t) => (TAG[t] || TAG.navy).c
export const tagSoft  = (t) => (TAG[t] || TAG.navy).soft

export function Icon({ name, size = 18, stroke = 1.8, style }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round',
    strokeLinejoin: 'round', style,
  }
  const paths = {
    compare:  <g><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="11" rx="1.5"/></g>,
    grid:     <g><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></g>,
    table:    <g><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></g>,
    sliders:  <g><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2.2" fill="white"/><circle cx="15" cy="12" r="2.2" fill="white"/><circle cx="8" cy="18" r="2.2" fill="white"/></g>,
    plus:     <g><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></g>,
    arrowUp:  <g><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></g>,
    arrowDn:  <g><line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/></g>,
    pin:      <g><path d="M12 2a4 4 0 0 1 4 4c0 3-4 8-4 8S8 9 8 6a4 4 0 0 1 4-4z"/><circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/></g>,
    box:      <g><path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="21"/></g>,
    star:     <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3z"/>,
    download: <g><path d="M12 4v11"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="20" x2="19" y2="20"/></g>,
    copy:     <g><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></g>,
    x:        <g><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g>,
    trash:    <g><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></g>,
  }
  return <svg {...p}>{paths[name] || null}</svg>
}

export function Dot({ tag, size = 9 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 99,
      background: tagColor(tag), display: 'inline-block', flex: 'none',
    }} />
  )
}

export function Delta({ v, suffix = '%', invert = false }) {
  if (v == null || !isFinite(v)) return null
  const good = invert ? v < 0 : v > 0
  const zero = Math.abs(v) < 0.05
  const color = zero ? 'var(--muted)' : good ? 'var(--pos)' : 'var(--neg)'
  return (
    <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {!zero && <Icon name={v > 0 ? 'arrowUp' : 'arrowDn'} size={11} stroke={2.4} />}
      {v > 0 ? '+' : ''}{Math.abs(v).toFixed(1)}{suffix}
    </span>
  )
}

export function Bar({ value, max, color, height = 7 }) {
  const w = max > 0 ? Math.min(100, Math.max(value > 0 ? 2 : 0, (value / max) * 100)) : 0
  return (
    <div style={{ background: 'var(--line-2)', borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div style={{
        width: w + '%', height: '100%', background: color, borderRadius: 99,
        transition: 'width .5s cubic-bezier(.2,.8,.2,1)',
      }} />
    </div>
  )
}

export function Card({ children, style, pad = 20 }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: pad, ...style,
    }}>
      {children}
    </div>
  )
}

export function Btn({ kind = 'ghost', icon, children, onClick, style, title, small, disabled }) {
  const kinds = {
    primary: { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' },
    ghost:   { background: 'var(--panel)', color: 'var(--ink-2)', borderColor: 'var(--line)' },
    plain:   { background: 'transparent', color: 'var(--muted)', borderColor: 'transparent' },
  }
  const k = kinds[kind] || kinds.ghost
  return (
    <button
      disabled={disabled}
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: `1px solid ${k.borderColor}`,
        borderRadius: 8, padding: small ? '6px 10px' : '8px 14px',
        fontSize: small ? 12.5 : 13.5, fontWeight: 600, lineHeight: 1,
        background: k.background, color: k.color,
        transition: 'all .15s', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, fontFamily: 'inherit', ...style,
      }}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}{children}
    </button>
  )
}

import { useMemo } from 'react'

const FMT_MONEY = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const FMT_UNITS = (v) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return `${v.toFixed(0)}`
}

export default function ColumnChart({ accountPeriods, fiscalCalendar, metric = 'gross_sales' }) {
  const periods = useMemo(() => Object.keys(fiscalCalendar || {}), [fiscalCalendar])

  const values = useMemo(() =>
    periods.map(p => (accountPeriods?.[p]?.[metric] || 0)),
    [periods, accountPeriods, metric]
  )

  const maxVal = useMemo(() => Math.max(...values, 1), [values])
  const fmt = metric === 'gross_sales' ? FMT_MONEY : FMT_UNITS

  const W = 600
  const H = 160
  const PAD_L = 52
  const PAD_B = 28
  const PAD_T = 12
  const PAD_R = 8
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_B - PAD_T
  const barW   = Math.floor(chartW / periods.length * 0.6)
  const gap    = chartW / periods.length

  // Y-axis ticks
  const ticks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(maxVal))) / 2
    const count = Math.ceil(maxVal / step)
    return Array.from({ length: Math.min(count + 1, 6) }, (_, i) => i * step).filter(v => v <= maxVal * 1.1)
  }, [maxVal])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Y-axis ticks + gridlines */}
      {ticks.map((tick, i) => {
        const y = PAD_T + chartH - (tick / maxVal) * chartH
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="IBM Plex Mono, monospace">
              {fmt(tick)}
            </text>
          </g>
        )
      })}

      {/* Bars + X-axis labels */}
      {periods.map((p, i) => {
        const month = fiscalCalendar[p]?.month || p
        const val   = values[i]
        const barH  = Math.max((val / maxVal) * chartH, 1)
        const cx    = PAD_L + i * gap + gap / 2
        const x     = cx - barW / 2
        const y     = PAD_T + chartH - barH
        return (
          <g key={p}>
            <rect
              x={x} y={y} width={barW} height={barH}
              fill="var(--olive)" rx="2"
              style={{ transition: 'height 0.4s ease-out, y 0.4s ease-out' }}
            />
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="IBM Plex Sans, sans-serif">
              {month.slice(0, 3)}
            </text>
          </g>
        )
      })}

      {/* X axis line */}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + chartH} y2={PAD_T + chartH} stroke="var(--line-strong)" strokeWidth="1" />
    </svg>
  )
}

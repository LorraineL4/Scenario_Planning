import { useMemo } from 'react'
import { tagColor } from './ui.jsx'

const FMT_MONEY = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const FMT_UNITS = (v) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return `${Math.round(v)}`
}

// Multi-series interface:
//   series  = [{tag, label, data: [12 numbers]}]
//   months  = ['Jul','Aug', ...] — 12 short month names in fiscal order
//   money   = boolean (true → dollar labels, false → unit labels)
//
// Legacy single-series interface (backward compat):
//   accountPeriods = {P01: {gross_sales, unit_sales}, ...}
//   fiscalCalendar = {P01: {month, ...}, ...}
//   metric         = 'gross_sales' | 'unit_sales'
export default function ColumnChart({
  series,
  months: monthsProp,
  money = true,
  accountPeriods,
  fiscalCalendar,
  metric = 'gross_sales',
}) {
  const resolvedSeries = useMemo(() => {
    if (series) return series
    if (accountPeriods && fiscalCalendar) {
      const periods = Object.keys(fiscalCalendar)
      return [{
        tag: 'navy',
        label: 'Plan',
        data: periods.map(p => accountPeriods?.[p]?.[metric] || 0),
      }]
    }
    return []
  }, [series, accountPeriods, fiscalCalendar, metric])

  const resolvedMonths = useMemo(() => {
    if (monthsProp) return monthsProp
    if (fiscalCalendar) return Object.values(fiscalCalendar).map(p => (p.month || '').slice(0, 3))
    return []
  }, [monthsProp, fiscalCalendar])

  const n = resolvedMonths.length || 12
  const seriesCount = resolvedSeries.length || 1
  const allMax = Math.max(...resolvedSeries.flatMap(s => s.data || []), 1)
  const fmt = money ? FMT_MONEY : FMT_UNITS

  const W = 600, H = 160, PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 8
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_B - PAD_T
  const slot = chartW / n
  const barW = Math.min(14, (slot - 6) / seriesCount)
  const groupW = barW * seriesCount
  const groupOffset = (slot - groupW) / 2

  const ticks = useMemo(() => {
    if (allMax <= 0) return [0]
    const exp = Math.floor(Math.log10(allMax))
    const step = Math.pow(10, exp) / 2
    const count = Math.ceil(allMax / step)
    return Array.from({ length: Math.min(count + 1, 6) }, (_, i) => i * step).filter(v => v <= allMax * 1.1)
  }, [allMax])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((tick, i) => {
        const y = PAD_T + chartH - (tick / allMax) * chartH
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)"
              fontFamily="IBM Plex Mono, monospace">
              {fmt(tick)}
            </text>
          </g>
        )
      })}

      {Array.from({ length: n }).map((_, i) => {
        const month = resolvedMonths[i] || ''
        return (
          <g key={i}>
            {resolvedSeries.map((s, j) => {
              const val = s.data?.[i] || 0
              const barH = Math.max(val > 0 ? 1 : 0, (val / allMax) * chartH)
              const x = PAD_L + i * slot + groupOffset + j * barW
              return (
                <rect key={j}
                  x={x} y={PAD_T + chartH - barH}
                  width={Math.max(barW - 1.5, 1)} height={barH}
                  fill={tagColor(s.tag)} rx="2" opacity={0.9}
                >
                  <title>{`${month} · ${s.label}: ${fmt(val)}`}</title>
                </rect>
              )
            })}
            <text
              x={PAD_L + i * slot + slot / 2} y={H - 6}
              textAnchor="middle" fontSize="10" fill="var(--muted)"
              fontFamily="IBM Plex Sans, sans-serif"
            >
              {month}
            </text>
          </g>
        )
      })}

      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + chartH} y2={PAD_T + chartH}
        stroke="var(--line-strong)" strokeWidth="1" />
    </svg>
  )
}

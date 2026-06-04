import { useState, Fragment } from 'react'
import { tagColor, tagSoft, Icon, Dot, Delta, Bar, Card } from './ui.jsx'
import ColumnChart from './ColumnChart.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`
const fmtX   = (v) => v == null ? '—' : `${Number(v).toFixed(2)}×`

// All stored as: usd/num → raw value; pct → 0–1 decimal; x → multiplier
// kind='pct' delta = (v−base)×100 pp  |  else delta = (v−base)/|base|×100 %
const METRIC_DEFS = [
  { key: 'stores',             label: 'Authorized stores',          group: 'Distribution',     fmt: fmtN,    kind: 'num', higher: true  },
  { key: 'acvPct',             label: 'ACV distribution',           group: 'Distribution',     fmt: fmtPct,  kind: 'pct', higher: true  },
  { key: 'totalUnits',         label: 'Total units',                group: 'Volume',           fmt: fmtN,    kind: 'num', higher: true  },
  { key: 'promoUnits',         label: 'Promoted units',             group: 'Volume',           fmt: fmtN,    kind: 'num', higher: true  },
  { key: 'grossSales',         label: 'Gross sales',                group: 'Revenue',          fmt: fmt$,    kind: 'usd', higher: true  },
  { key: 'netSales',           label: 'Net sales',                  group: 'Revenue',          fmt: fmt$,    kind: 'usd', higher: true  },
  { key: 'totalSpend',         label: 'Total trade spend',          group: 'Trade investment', fmt: fmt$,    kind: 'usd', higher: false },
  { key: 'tradeRate',          label: 'All-in trade rate',          group: 'Trade investment', fmt: fmtPct,  kind: 'pct', higher: false },
  { key: 'profitAfterTotal',   label: 'Profit after total spend',   group: 'Profit',           fmt: fmt$,    kind: 'usd', higher: true  },
  { key: 'profitAfterWorking', label: 'Profit after working spend', group: 'Profit',           fmt: fmt$,    kind: 'usd', higher: true  },
  { key: 'retailMarginPct',    label: 'Retailer margin',            group: 'Retail health',    fmt: fmtPct,  kind: 'pct', higher: true  },
  { key: 'promoROI',           label: 'Promo ROI',                  group: 'Retail health',    fmt: fmtX,    kind: 'x',   higher: true  },
]
const GROUPS = ['Distribution', 'Volume', 'Revenue', 'Trade investment', 'Profit', 'Retail health']

export default function CompareView({ scenarios = [], fiscalCalendar = {} }) {
  const [shown, setShown] = useState(() => scenarios.map(s => s.id))
  const [baselineId, setBaselineId] = useState(() => scenarios[0]?.id)
  const [chartMetric, setChartMetric] = useState('grossSales')

  const shownScenarios = scenarios.filter(s => shown.includes(s.id))
  const baseline = scenarios.find(s => s.id === baselineId)
  const months = Object.values(fiscalCalendar).map(p => (p.month || '').slice(0, 3))

  const winner = shownScenarios.length > 1
    ? shownScenarios.reduce((a, s) =>
        (s.profitAfterTotal ?? -Infinity) > (a.profitAfterTotal ?? -Infinity) ? s : a,
        shownScenarios[0])
    : null

  const toggleShown = (id) => setShown(prev =>
    prev.includes(id)
      ? prev.length > 1 ? prev.filter(x => x !== id) : prev
      : [...prev, id]
  )

  if (!scenarios.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        No engine results — load a DAP file to see the compare view.
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ padding: 'var(--gut)', maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header + scenario pills ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>
            Compare scenarios
          </h1>
          <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            {shownScenarios.length} plan{shownScenarios.length !== 1 ? 's' : ''} · deltas vs{' '}
            <strong style={{ color: 'var(--ink-2)' }}>{baseline?.name || 'baseline'}</strong>
          </p>
        </div>
        {scenarios.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Showing</span>
            {scenarios.map(s => {
              const on = shown.includes(s.id)
              return (
                <button key={s.id} onClick={() => toggleShown(s.id)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px',
                  borderRadius: 99, border: `1px solid ${on ? tagColor(s.tag) : 'var(--line)'}`,
                  background: on ? tagSoft(s.tag) : 'var(--panel)',
                  color: on ? 'var(--ink)' : 'var(--muted)', fontWeight: 600, fontSize: 12.5,
                  transition: 'all .15s', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Dot tag={s.tag} size={8} />{s.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Winner banner (only with multiple scenarios) ── */}
      {winner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
          background: 'linear-gradient(90deg, var(--navy-50), var(--panel))',
          border: '1px solid var(--line)', borderLeft: `3px solid ${tagColor(winner.tag)}`,
          borderRadius: 'var(--radius)',
        }}>
          <Icon name="star" size={18} style={{ color: tagColor(winner.tag), flex: 'none' }} />
          <div style={{ fontSize: 13.5 }}>
            <strong>{winner.name}</strong>{' '}delivers the highest profit after total spend —{' '}
            <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {fmt$(winner.profitAfterTotal)}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              {' '}at a {fmtPct(winner.tradeRate)} all-in trade rate.
            </span>
          </div>
        </div>
      )}

      {/* ── Comparison matrix ── */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{
            minWidth: 230 + shownScenarios.length * 180,
            display: 'grid',
            gridTemplateColumns: `230px repeat(${shownScenarios.length}, minmax(180px, 1fr))`,
          }}>

            {/* Header: blank + scenario columns */}
            <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel-2)', padding: '12px 16px' }} />
            {shownScenarios.map(s => {
              const isBase = s.id === baselineId
              return (
                <div key={s.id} style={{
                  padding: '14px 16px', borderBottom: '1px solid var(--line)',
                  borderLeft: '1px solid var(--line-2)', borderTop: `3px solid ${tagColor(s.tag)}`,
                  background: 'var(--panel-2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <Dot tag={s.tag} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{s.name}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, minHeight: 28 }}>{s.note}</div>
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => setBaselineId(s.id)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
                      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${isBase ? tagColor(s.tag) : 'var(--line)'}`,
                      background: isBase ? tagSoft(s.tag) : 'var(--panel)',
                      color: isBase ? 'var(--ink)' : 'var(--muted)',
                    }}>
                      <Icon name="pin" size={12} />
                      {isBase ? 'Baseline' : 'Set baseline'}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Metric rows, grouped */}
            {GROUPS.map(g => {
              const metrics = METRIC_DEFS.filter(m => m.group === g)
              return (
                <Fragment key={g}>
                  {/* Group label */}
                  <div style={{
                    gridColumn: `1 / -1`, padding: '8px 16px',
                    background: 'var(--panel-2)', borderBottom: '1px solid var(--line-2)',
                    fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                    color: 'var(--slate)',
                  }}>
                    {g}
                  </div>

                  {metrics.map(m => {
                    const vals = shownScenarios.map(s => s[m.key])
                    const validVals = vals.filter(v => v != null && isFinite(v))
                    const best = validVals.length
                      ? m.higher ? Math.max(...validVals) : Math.min(...validVals)
                      : null
                    const maxForBar = validVals.length ? Math.max(...validVals.map(Math.abs), 0) : 0
                    const baseVal = baseline?.[m.key]

                    return (
                      <Fragment key={m.key}>
                        {/* Metric label cell */}
                        <div style={{
                          padding: '11px 16px', borderBottom: '1px solid var(--line-2)',
                          display: 'flex', alignItems: 'center', fontSize: 13,
                          color: 'var(--ink-2)', fontWeight: 500,
                        }}>
                          {m.label}
                        </div>

                        {/* Value + delta + bar per scenario */}
                        {shownScenarios.map(s => {
                          const v = s[m.key]
                          const isBest = shownScenarios.length > 1 && v != null && v === best
                          const isBaseCol = s.id === baselineId

                          let deltaVal = null
                          if (!isBaseCol && baseVal != null && v != null && isFinite(v) && isFinite(baseVal)) {
                            if (m.kind === 'pct') {
                              deltaVal = (v - baseVal) * 100
                            } else {
                              deltaVal = baseVal !== 0 ? (v - baseVal) / Math.abs(baseVal) * 100 : null
                            }
                          }

                          // Bar: for "higher is better" proportional to value; for "lower" invert
                          const rawForBar = v ?? 0
                          const barValue = m.higher
                            ? rawForBar
                            : (maxForBar > 0 ? maxForBar - rawForBar + maxForBar * 0.08 : 0)
                          const barMax = m.higher ? maxForBar : maxForBar * 1.08

                          return (
                            <div key={s.id} style={{
                              padding: '10px 16px', borderBottom: '1px solid var(--line-2)',
                              borderLeft: '1px solid var(--line-2)',
                              background: isBest ? tagSoft(s.tag) : 'transparent',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                <span className="mono" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>
                                  {m.fmt(v)}
                                </span>
                                {deltaVal != null && (
                                  <Delta v={deltaVal} suffix={m.kind === 'pct' ? 'pp' : '%'} invert={!m.higher} />
                                )}
                              </div>
                              <Bar value={barValue} max={barMax} color={tagColor(s.tag)} />
                            </div>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>
        </div>
      </Card>

      {/* ── Monthly chart ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--slate)' }}>
              Monthly · {chartMetric === 'grossSales' ? 'Gross sales' : 'Units'}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
              {shownScenarios.map(s => (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  <Dot tag={s.tag} size={8} />{s.name}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['grossSales', 'Gross Sales'], ['units', 'Units']].map(([key, label]) => (
              <button key={key} onClick={() => setChartMetric(key)} style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 99, border: '1px solid',
                borderColor: chartMetric === key ? 'var(--navy)' : 'var(--line)',
                background: chartMetric === key ? 'var(--navy)' : 'transparent',
                color: chartMetric === key ? '#fff' : 'var(--muted)',
                cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <ColumnChart
          series={shownScenarios.map(s => ({
            tag: s.tag,
            label: s.name,
            data: (s.per || []).map(p => chartMetric === 'grossSales' ? p.grossSales : p.units),
          }))}
          months={months}
          money={chartMetric === 'grossSales'}
        />
      </Card>
    </div>
  )
}

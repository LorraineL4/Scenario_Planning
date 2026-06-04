import { useState, useEffect, Fragment } from 'react'
import { tagColor, tagSoft, Icon, Dot, Delta, Bar, Card } from './ui.jsx'
import ColumnChart from './ColumnChart.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

const METRIC_DEFS = [
  { key: 'totalUnits',       label: 'Total Units',             fmt: fmtN,   kind: 'num', higher: true  },
  { key: 'grossSales',       label: 'Total Gross Sales',       fmt: fmt$,   kind: 'usd', higher: true  },
  { key: 'workingSpend',     label: 'Total Working Spend',     fmt: fmt$,   kind: 'usd', higher: false },
  { key: 'totalSpend',       label: 'Total Trade',             fmt: fmt$,   kind: 'usd', higher: false },
  { key: 'tradeRate',        label: 'T:S',                     fmt: fmtPct, kind: 'pct', higher: false },
  { key: 'profitAfterTotal', label: 'Profits after All Trade', fmt: fmt$,   kind: 'usd', higher: true  },
  { key: 'retailDollars',    label: 'Retail Dollars',          fmt: fmt$,   kind: 'usd', higher: true  },
  { key: 'retailMarginPct',  label: 'Retail Margin',           fmt: fmtPct, kind: 'pct', higher: true  },
]

const BLOCK_TYPES = [
  { label: 'Distribution', key: 'distributionId' },
  { label: 'Pricing',      key: 'pricingId'      },
  { label: 'Promotion',    key: 'promotionId'    },
]

function blockLabel(id, blocks, type) {
  if (!id || id === '__base__') return `Base ${type}`
  const found = (blocks[type.toLowerCase()] || []).find(b => b.id === id)
  return found ? found.name : 'Unknown block'
}

function fetchEnriched(scenario, blocks) {
  const distBlock = scenario.distributionId && scenario.distributionId !== '__base__'
    ? (blocks.distribution || []).find(b => b.id === scenario.distributionId)
    : null
  const rows = distBlock?.inputs || null

  const pricingBlock = scenario.pricingId && scenario.pricingId !== '__base__'
    ? (blocks.pricing || []).find(b => b.id === scenario.pricingId)
    : null
  const pricingRows = pricingBlock?.inputs
    ? Object.entries(pricingBlock.inputs).map(([skuName, skuData]) => ({
        sku_name: skuName,
        periods: skuData.periods || {},
      }))
    : null

  const promoBlock = scenario.promotionId && scenario.promotionId !== '__base__'
    ? (blocks.promotion || []).find(b => b.id === scenario.promotionId)
    : null
  let promoRows = null
  if (promoBlock) {
    const skuPeriodMap = {}
    for (const [cellKey, cellData] of Object.entries(promoBlock.inputs?.grid || {})) {
      const sepIdx = cellKey.indexOf('|||')
      if (sepIdx < 0) continue
      const skuName = cellKey.slice(0, sepIdx)
      const period  = cellKey.slice(sepIdx + 3)
      if (!skuPeriodMap[skuName]) skuPeriodMap[skuName] = {}
      skuPeriodMap[skuName][period] = {
        promo_price: cellData.promo_price,
        weeks: cellData.weeks,
        scan: cellData.scan,
        fixed_fee: cellData.fixed_fee,
        expected_lift: cellData.expected_lift,
      }
    }
    promoRows = Object.entries(skuPeriodMap).map(([skuName, periods]) => ({
      sku_name: skuName,
      periods,
    }))
  }

  return fetch('/api/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      distribution_rows: rows ? rows.map(r => ({
        SKU_name: r.SKU_name,
        unit_velocity: r.unit_velocity,
        months: r.months,
        dist_prob: r.dist_prob,
      })) : null,
      pricing_rows: pricingRows,
      promo_rows: promoRows,
    }),
  }).then(r => r.ok ? r.json() : null)
}

export default function CompareView({ scenarios = [], savedScenarios = [], blocks = {}, fiscalCalendar = {} }) {
  const [enriched, setEnriched] = useState({})

  const scenariosKey = savedScenarios.map(s => `${s.id}/${s.distributionId}/${s.pricingId}/${s.promotionId}`).join('|')
  useEffect(() => {
    savedScenarios.forEach(s => {
      fetchEnriched(s, blocks)
        .then(data => { if (data) setEnriched(prev => ({ ...prev, [s.id]: { ...s, ...data } })) })
        .catch(() => {})
    })
  }, [scenariosKey]) // eslint-disable-line

  const allScenarios = [
    ...scenarios,
    ...savedScenarios.map(s => enriched[s.id] || s),
  ]

  const [shown, setShown] = useState(() => allScenarios.map(s => s.id))
  const [baselineId, setBaselineId] = useState(() => allScenarios[0]?.id)
  const [chartMetric, setChartMetric] = useState('grossSales')

  const shownScenarios = allScenarios.filter(s => shown.includes(s.id))
  const baseline = allScenarios.find(s => s.id === baselineId)
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

  if (!allScenarios.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        No engine results — load a DAP file to see the compare view.
      </div>
    )
  }

  const colStyle = (tag) => ({
    padding: '10px 16px', borderBottom: '1px solid var(--line-2)',
    borderLeft: '1px solid var(--line-2)',
    background: `color-mix(in srgb, ${tagColor(tag)} 4%, transparent)`,
  })

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
        {allScenarios.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Showing</span>
            {allScenarios.map(s => {
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

      {/* ── Winner banner ── */}
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
            <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmt$(winner.profitAfterTotal)}</span>
            <span style={{ color: 'var(--muted)' }}>{' '}at a {fmtPct(winner.tradeRate)} all-in trade rate.</span>
          </div>
        </div>
      )}

      {/* ── Comparison matrix ── */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{
            minWidth: 220 + shownScenarios.length * 200,
            display: 'grid',
            gridTemplateColumns: `220px repeat(${shownScenarios.length}, minmax(200px, 1fr))`,
          }}>

            {/* Column headers */}
            <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel-2)', padding: '12px 16px' }} />
            {shownScenarios.map(s => {
              const isBase = s.id === baselineId
              const isLoading = savedScenarios.some(ss => ss.id === s.id) && !enriched[s.id]
              return (
                <div key={s.id} style={{
                  padding: '14px 16px', borderBottom: '1px solid var(--line)',
                  borderLeft: '1px solid var(--line-2)', borderTop: `3px solid ${tagColor(s.tag)}`,
                  background: 'var(--panel-2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <Dot tag={s.tag} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{s.name}</span>
                    {isLoading && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Computing…</span>}
                  </div>
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
              )
            })}

            {/* Planning Blocks section */}
            <div style={{
              gridColumn: '1 / -1', padding: '8px 16px',
              background: 'var(--panel-2)', borderBottom: '1px solid var(--line-2)',
              fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--slate)',
            }}>
              Planning Blocks
            </div>

            {BLOCK_TYPES.map(({ label, key }) => (
              <Fragment key={key}>
                <div style={{
                  padding: '9px 16px', borderBottom: '1px solid var(--line-2)',
                  fontSize: 13, color: 'var(--ink-2)', fontWeight: 500,
                  display: 'flex', alignItems: 'center',
                }}>
                  {label}
                </div>
                {shownScenarios.map(s => {
                  const name = blockLabel(s[key], blocks, label)
                  const isCustom = s[key] && s[key] !== '__base__'
                  return (
                    <div key={s.id} style={{ ...colStyle(s.tag), display: 'flex', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 13, fontWeight: isCustom ? 600 : 400,
                        color: isCustom ? 'var(--navy)' : 'var(--muted)',
                        fontStyle: isCustom ? 'normal' : 'italic',
                      }}>
                        {name}
                      </span>
                    </div>
                  )
                })}
              </Fragment>
            ))}

            {/* Metric rows */}
            {METRIC_DEFS.map(m => {
              const vals = shownScenarios.map(s => s[m.key])
              const validVals = vals.filter(v => v != null && isFinite(v))
              const best = validVals.length ? (m.higher ? Math.max(...validVals) : Math.min(...validVals)) : null
              const maxForBar = validVals.length ? Math.max(...validVals.map(Math.abs), 0) : 0
              const baseVal = baseline?.[m.key]

              return (
                <Fragment key={m.key}>
                  <div style={{
                    padding: '11px 16px', borderBottom: '1px solid var(--line-2)',
                    fontSize: 13, color: 'var(--ink-2)', fontWeight: 500,
                    display: 'flex', alignItems: 'center',
                  }}>
                    {m.label}
                  </div>

                  {shownScenarios.map(s => {
                    const v = s[m.key]
                    const isBest = shownScenarios.length > 1 && v != null && v === best
                    const isBaseCol = s.id === baselineId

                    let deltaVal = null
                    if (!isBaseCol && baseVal != null && v != null && isFinite(v) && isFinite(baseVal)) {
                      deltaVal = m.kind === 'pct'
                        ? (v - baseVal) * 100
                        : baseVal !== 0 ? (v - baseVal) / Math.abs(baseVal) * 100 : null
                    }

                    const rawForBar = v ?? 0
                    const barValue = m.higher ? rawForBar : (maxForBar > 0 ? maxForBar - rawForBar + maxForBar * 0.08 : 0)
                    const barMax = m.higher ? maxForBar : maxForBar * 1.08

                    return (
                      <div key={s.id} style={{
                        ...colStyle(s.tag),
                        background: isBest ? tagSoft(s.tag) : colStyle(s.tag).background,
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

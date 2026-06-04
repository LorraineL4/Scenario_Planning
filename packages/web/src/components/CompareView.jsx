import { useState, useMemo } from 'react'
import ColumnChart from './ColumnChart.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtPct = (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`
const fmtX   = (v) => v == null ? '—' : `${Number(v).toFixed(2)}×`

const METRIC_GROUPS = [
  {
    label: 'Distribution',
    rows: [
      { label: 'Stores',   key: 'stores',    fmt: fmtN,   source: 'account' },
      { label: 'ACV %',    key: 'avg_acv',   fmt: fmtPct, source: 'computed' },
    ],
  },
  {
    label: 'Volume',
    rows: [
      { label: 'Total units',  key: 'unit_sales',         fmt: fmtN },
      { label: 'Promo units',  key: 'promo_units',        fmt: fmtN },
    ],
  },
  {
    label: 'Revenue',
    rows: [
      { label: 'Gross sales',  key: 'gross_sales',  fmt: fmt$ },
      { label: 'Net sales',    key: 'net_sales',    fmt: fmt$ },
    ],
  },
  {
    label: 'Trade investment',
    rows: [
      { label: 'Total spend',   key: 'total_spend',           fmt: fmt$ },
      { label: 'Trade rate',    key: 'allin_trade_rate_pct',  fmt: fmtPct },
    ],
  },
  {
    label: 'Profit',
    rows: [
      { label: 'Profit after total',   key: 'profit_after_total_spend',   fmt: fmt$ },
      { label: 'Profit after working', key: 'profit_after_working_spend', fmt: fmt$ },
    ],
  },
  {
    label: 'Retail health',
    rows: [
      { label: 'Retailer working %', key: 'retailer_working_pct', fmt: fmtPct, source: 'computed' },
    ],
  },
]

export default function CompareView({ results, account, fiscalCalendar }) {
  const [chartMetric, setChartMetric] = useState('gross_sales')

  const total = results?.account_total || {}
  const accountPeriods = results?.account_periods || {}

  const avgAcv = useMemo(() => {
    if (!results?.skus) return null
    const acvVals = Object.values(results.skus).map(s => {
      const periods = Object.values(s.periods || {})
      if (!periods.length) return null
      const sum = periods.reduce((a, p) => a + (p.acv_pct || 0), 0)
      return sum / periods.length
    }).filter(v => v != null)
    return acvVals.length ? (acvVals.reduce((a, b) => a + b, 0) / acvVals.length) * 100 : null
  }, [results])

  const retailerWorkingPct = total.gross_sales
    ? (total.retailer_working_spend / total.gross_sales) * 100
    : null

  function getValue(row) {
    if (row.source === 'account') return account?.[row.key === 'stores' ? 'number_of_stores' : row.key]
    if (row.key === 'avg_acv')            return avgAcv
    if (row.key === 'retailer_working_pct') return retailerWorkingPct
    return total[row.key]
  }

  if (!results) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
        No results — load a DAP file to see the compare view.
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ padding: '0 24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
          {account?.account_name || 'Current Plan'}
        </h1>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
          Annual account summary · all 37 SKUs
        </div>
      </div>

      {/* Comparison matrix */}
      <div style={{ overflowX: 'auto', padding: '0 24px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 440 }}>
          <thead>
            <tr>
              <th style={{ width: 220, textAlign: 'left', padding: '10px 16px 10px 0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', borderBottom: '2px solid var(--line-strong)' }}>
                Metric
              </th>
              <th style={{ textAlign: 'right', padding: '10px 0 10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', borderBottom: '2px solid var(--olive)', borderTop: '3px solid var(--olive)', background: 'var(--heat)' }}>
                {account?.account_name || 'Current Plan'}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                  {account?.sales_channel || ''}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {METRIC_GROUPS.map((group) => (
              <>
                <tr key={`grp-${group.label}`}>
                  <td colSpan={2} style={{ padding: '14px 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <td style={{ padding: '9px 16px 9px 0', fontSize: 13, color: 'var(--ink-2)' }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '9px 0 9px 16px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                      {row.fmt(getValue(row))}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chart section */}
      <div style={{ padding: '28px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Monthly</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['gross_sales', 'Gross Sales'], ['unit_sales', 'Units']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChartMetric(key)}
                style={{
                  padding: '3px 10px', fontSize: 12, borderRadius: 99, border: '1px solid',
                  borderColor: chartMetric === key ? 'var(--olive)' : 'var(--line)',
                  background: chartMetric === key ? 'var(--olive)' : 'transparent',
                  color: chartMetric === key ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ColumnChart
          accountPeriods={accountPeriods}
          fiscalCalendar={fiscalCalendar}
          metric={chartMetric}
        />
      </div>
    </div>
  )
}

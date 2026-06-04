import { tagColor, tagSoft, Dot, Icon } from './ui.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

function ScenarioCard({ scenario: s }) {
  const per = s.per || []
  const maxM = Math.max(...per.map(p => p.grossSales), 1)

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 4, background: tagColor(s.tag) }} />
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Name + note */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Dot tag={s.tag} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</h3>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
              color: 'var(--navy)', background: 'var(--navy-50)', padding: '2px 7px', borderRadius: 5,
            }}>
              BASELINE
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>{s.note}</p>
        </div>

        {/* Sparkline */}
        {per.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44 }}>
            {per.map((p, i) => (
              <div key={i} style={{
                flex: 1, height: (p.grossSales / maxM * 100) + '%',
                background: tagSoft(s.tag),
                borderTop: `2px solid ${tagColor(s.tag)}`,
                borderRadius: '2px 2px 0 0',
              }} />
            ))}
          </div>
        )}

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            ['Gross',  fmt$(s.grossSales)],
            ['Profit', fmt$(s.profitAfterTotal)],
            ['Trade',  fmtPct(s.tradeRate)],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', fontWeight: 600 }}>
                {label}
              </div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: 'var(--ink)' }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ScenarioListView({ scenarios = [] }) {
  return (
    <div className="fade-in" style={{ padding: 'var(--gut)', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>
          Saved scenarios
        </h1>
        <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          {scenarios.length} plan{scenarios.length !== 1 ? 's' : ''} saved
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gut)' }}>
        {scenarios.map(s => <ScenarioCard key={s.id} scenario={s} />)}

        {/* New scenario placeholder */}
        <div style={{
          border: '1.5px dashed var(--muted-2)', borderRadius: 'var(--radius)',
          background: 'var(--panel-2)', color: 'var(--muted)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 10, minHeight: 220, padding: 24,
          textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 99, background: 'var(--navy-50)',
            display: 'grid', placeItems: 'center', color: 'var(--navy)',
          }}>
            <Icon name="plus" size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-2)', marginBottom: 4 }}>New scenario</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Coming in a future session</div>
          </div>
        </div>
      </div>
    </div>
  )
}

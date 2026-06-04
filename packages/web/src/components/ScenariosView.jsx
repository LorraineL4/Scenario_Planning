import { useState } from 'react'
import { tagColor, tagSoft, Dot, Icon } from './ui.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

function blockLabel(id, blocks, type) {
  if (!id || id === '__base__') return `Base ${type}`
  const found = (blocks[type.toLowerCase()] || []).find(b => b.id === id)
  return found ? found.name : 'Unknown block'
}

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

function ComposedScenarioCard({ scenario: s, blocks, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const d = new Date(s.createdAt)
  const dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 4, background: tagColor(s.tag) }} />
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Dot tag={s.tag} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</h3>
            </div>
            {dateStr && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Created {dateStr}</div>}
          </div>
          {confirming ? (
            <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
              <button onClick={() => onDelete(s.id)} style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, border: 'none',
                background: '#dc2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
              }}>Delete</button>
              <button onClick={() => setConfirming(false)} style={{
                fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
              padding: 2, display: 'flex', alignItems: 'center', flex: 'none',
            }} title="Delete scenario">
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['Distribution', s.distributionId], ['Pricing', s.pricingId], ['Promotion', s.promotionId]].map(([type, id]) => (
            <div key={type} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', minWidth: 80 }}>{type}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{blockLabel(id, blocks, type)}</span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 'auto', padding: '10px 12px', borderRadius: 8,
          background: 'var(--panel-2)', border: '1px solid var(--line)',
          fontSize: 12, color: 'var(--muted)', textAlign: 'center',
        }}>
          Engine run coming in a future session
        </div>
      </div>
    </div>
  )
}

export default function ScenariosView({ scenarios = [], savedScenarios = [], blocks = {}, onNewScenario, onDeleteScenario }) {
  const total = scenarios.length + savedScenarios.length
  return (
    <div className="fade-in" style={{ padding: 'var(--gut)', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>
          Saved scenarios
        </h2>
        <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          {total} plan{total !== 1 ? 's' : ''} saved
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gut)' }}>
        {scenarios.map(s => <ScenarioCard key={s.id} scenario={s} />)}
        {savedScenarios.map(s => (
          <ComposedScenarioCard
            key={s.id}
            scenario={s}
            blocks={blocks}
            onDelete={onDeleteScenario}
          />
        ))}
        <button
          onClick={onNewScenario}
          style={{
            border: '1.5px dashed var(--muted-2)', borderRadius: 'var(--radius)',
            background: 'var(--panel-2)', color: 'var(--muted)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 10, minHeight: 220, padding: 24,
            textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--navy-50)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--muted-2)'; e.currentTarget.style.background = 'var(--panel-2)'; }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 99, background: 'var(--navy-50)',
            display: 'grid', placeItems: 'center', color: 'var(--navy)',
          }}>
            <Icon name="plus" size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-2)', marginBottom: 4 }}>New scenario</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pick blocks and name your plan</div>
          </div>
        </button>
      </div>
    </div>
  )
}

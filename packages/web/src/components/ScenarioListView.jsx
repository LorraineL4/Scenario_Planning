import { useState } from 'react'
import { tagColor, tagSoft, Dot, Icon } from './ui.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
  padding: 2, display: 'flex', alignItems: 'center', flex: 'none',
}

function BasePlanCard({ label, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const hasActions = onEdit || onDelete
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.3 }}>{label}</div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
            color: 'var(--navy)', background: 'var(--navy-50)', padding: '2px 6px', borderRadius: 4,
          }}>BASE</span>
        </div>
        {hasActions && (confirming ? (
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            <button onClick={onDelete} style={{
              fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, border: 'none',
              background: '#dc2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}>Delete</button>
            <button onClick={() => setConfirming(false)} style={{
              fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
              border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            {onEdit && <button onClick={onEdit} style={iconBtn} title="Edit in tab"><Icon name="pencil" size={14} /></button>}
            {onDelete && <button onClick={() => setConfirming(true)} style={iconBtn} title={`Delete ${label}`}><Icon name="trash" size={14} /></button>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Original plan</div>
    </div>
  )
}

function BlockCard({ block, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false)
  const d = new Date(block.created_at)
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.3 }}>{block.name}</div>
        {confirming ? (
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            <button onClick={() => onDelete(block.id)} style={{
              fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, border: 'none',
              background: '#dc2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}>Delete</button>
            <button onClick={() => setConfirming(false)} style={{
              fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
              border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            <button onClick={() => onEdit?.(block)} style={iconBtn} title="Edit in tab">
              <Icon name="pencil" size={14} />
            </button>
            <button onClick={() => setConfirming(true)} style={iconBtn} title="Delete block">
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{block.note} · {dateStr}</div>
    </div>
  )
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

const colHeader = (label) => (
  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-2)', marginBottom: 10, letterSpacing: '.02em' }}>{label}</div>
)
const comingSoon = (
  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', paddingLeft: 2, marginTop: 4 }}>
    Editor coming soon
  </div>
)

export default function ScenarioListView({ scenarios = [], blocks = { distribution: [], pricing: [], promotion: [] }, showBasePlan = true, onDeleteBlock, onEditBlock, onEditBase, onDeleteBase }) {
  return (
    <div className="fade-in" style={{ padding: 'var(--gut)', maxWidth: 1320, margin: '0 auto' }}>

      {/* Building blocks */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>
          Building blocks
        </h2>
        <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
          Named snapshots you can mix into any scenario
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--gut)' }}>
          <div>
            {colHeader('Distribution')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showBasePlan && <BasePlanCard label="Base Distribution" onEdit={onEditBase} onDelete={onDeleteBase} />}
              {blocks.distribution.map(bl => (
                <BlockCard
                  key={bl.id}
                  block={bl}
                  onDelete={(id) => onDeleteBlock?.('distribution', id)}
                  onEdit={(block) => onEditBlock?.(block)}
                />
              ))}
            </div>
          </div>
          <div>
            {colHeader('Pricing')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BasePlanCard label="Base Pricing" />
              {blocks.pricing?.map(bl => (
                <BlockCard key={bl.id} block={bl} onDelete={(id) => onDeleteBlock?.('pricing', id)} />
              ))}
              {comingSoon}
            </div>
          </div>
          <div>
            {colHeader('Promotion')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BasePlanCard label="Base Promotion" />
              {blocks.promotion?.map(bl => (
                <BlockCard key={bl.id} block={bl} onDelete={(id) => onDeleteBlock?.('promotion', id)} />
              ))}
              {comingSoon}
            </div>
          </div>
        </div>
      </div>

      {/* Scenario cards */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>
          Saved scenarios
        </h2>
        <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          {scenarios.length} plan{scenarios.length !== 1 ? 's' : ''} saved
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--gut)' }}>
        {scenarios.map(s => <ScenarioCard key={s.id} scenario={s} />)}
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

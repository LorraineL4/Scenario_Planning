import { useState } from 'react'
import { Icon } from './ui.jsx'

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

const colHeader = (label) => (
  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-2)', marginBottom: 10, letterSpacing: '.02em' }}>{label}</div>
)
const comingSoon = (
  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', paddingLeft: 2, marginTop: 4 }}>
    Editor coming soon
  </div>
)

export default function ScenarioListView({ blocks = { distribution: [], pricing: [], promotion: [] }, showBasePlan = true, onDeleteBlock, onEditBlock, onEditBase, onDeleteBase }) {
  return (
    <div className="fade-in" style={{ padding: 'var(--gut)', maxWidth: 1320, margin: '0 auto' }}>
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
              {blocks.distribution.filter(b => b.id !== '__base__').map(bl => (
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
              {blocks.pricing?.filter(b => b.id !== '__base__').map(bl => (
                <BlockCard key={bl.id} block={bl} onDelete={(id) => onDeleteBlock?.('pricing', id)} />
              ))}
              {comingSoon}
            </div>
          </div>
          <div>
            {colHeader('Promotion')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BasePlanCard label="Base Promotion" />
              {blocks.promotion?.filter(b => b.id !== '__base__').map(bl => (
                <BlockCard key={bl.id} block={bl} onDelete={(id) => onDeleteBlock?.('promotion', id)} />
              ))}
              {comingSoon}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

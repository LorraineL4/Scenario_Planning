import { useState } from 'react'
import { Icon } from './ui.jsx'

function BlockOption({ block, selected, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? 'var(--navy-50)' : 'var(--panel)',
        border: `2px solid ${selected ? 'var(--navy)' : 'var(--line)'}`,
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color .1s, background .1s',
        minWidth: 180,
        maxWidth: 260,
        flex: '0 0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 16, height: 16, borderRadius: 99, flex: 'none',
          border: `2px solid ${selected ? 'var(--navy)' : 'var(--line)'}`,
          background: selected ? 'var(--navy)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .1s',
        }}>
          {selected && <div style={{ width: 6, height: 6, borderRadius: 99, background: '#fff' }} />}
        </div>
        <div style={{
          fontWeight: 700, fontSize: 13,
          color: selected ? 'var(--navy)' : 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {block.name}
        </div>
        {block.isBase && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
            color: 'var(--navy)', background: 'var(--navy-50)', padding: '2px 5px', borderRadius: 3, flex: 'none',
          }}>BASE</span>
        )}
      </div>
      {block.note && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, paddingLeft: 24 }}>
          {block.note}
        </div>
      )}
    </div>
  )
}

function BlockSection({ title, options, selectedId, onSelect, showComingSoon }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-2)', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(bl => (
          <BlockOption
            key={bl.id}
            block={bl}
            selected={selectedId === bl.id}
            onSelect={() => onSelect(bl.id)}
          />
        ))}
        {showComingSoon && (
          <div style={{
            border: '1.5px dashed var(--muted-2)', borderRadius: 'var(--radius)',
            padding: '12px 14px', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic',
            display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
          }}>
            <Icon name="plus" size={13} />
            Editor coming soon
          </div>
        )}
      </div>
    </div>
  )
}

const TAG_CYCLE = ['teal', 'coral', 'rose', 'navy']

export default function ScenarioComposerView({ blocks, existingCount = 0, onSave, onCancel }) {
  const [name, setName] = useState('')
  const [distId, setDistId] = useState('__base__')
  const [pricingId, setPricingId] = useState('__base__')
  const [promoId, setPromoId] = useState('__base__')

  const distOptions = [
    { id: '__base__', name: 'Base Distribution', isBase: true },
    ...blocks.distribution,
  ]
  const pricingOptions = [
    { id: '__base__', name: 'Base Pricing', isBase: true },
    ...(blocks.pricing || []),
  ]
  const promoOptions = [
    { id: '__base__', name: 'Base Promotion', isBase: true },
    ...(blocks.promotion || []),
  ]

  const canSave = name.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const tag = TAG_CYCLE[existingCount % TAG_CYCLE.length]
    onSave({ name: name.trim(), tag, distributionId: distId, pricingId, promotionId: promoId })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--gut)' }}>

        {/* Back */}
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: 'var(--muted)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            padding: '0 0 20px', marginBottom: 4,
          }}
        >
          <Icon name="arrowLeft" size={14} />
          Back to Scenarios
        </button>

        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>
          New Scenario
        </h1>
        <p style={{ margin: '0 0 32px', color: 'var(--muted)', fontSize: 13 }}>
          Pick one block from each category, then name your scenario.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Name */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-2)', marginBottom: 8 }}>
              Scenario name
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g. Conservative, High growth…"
              style={{
                padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)',
                fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
                background: 'var(--panel-2)', width: 340, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ height: 1, background: 'var(--line)' }} />

          <BlockSection
            title="Distribution"
            options={distOptions}
            selectedId={distId}
            onSelect={setDistId}
          />

          <BlockSection
            title="Pricing"
            options={pricingOptions}
            selectedId={pricingId}
            onSelect={setPricingId}
            showComingSoon={(blocks.pricing || []).length === 0}
          />

          <BlockSection
            title="Promotion"
            options={promoOptions}
            selectedId={promoId}
            onSelect={setPromoId}
            showComingSoon={(blocks.promotion || []).length === 0}
          />

          <div style={{ height: 1, background: 'var(--line)' }} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 32 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--line)',
                background: 'var(--panel)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 14,
                cursor: canSave ? 'pointer' : 'not-allowed',
                opacity: canSave ? 1 : 0.45, fontFamily: 'inherit',
              }}
            >Save Scenario</button>
          </div>

        </div>
      </div>
    </div>
  )
}

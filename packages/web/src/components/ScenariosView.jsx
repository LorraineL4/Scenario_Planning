import { useState, useEffect } from 'react'
import { tagColor, Dot, Icon } from './ui.jsx'
import DistributionEditor from './DistributionEditor.jsx'
import PromotionEditor from './PromotionEditor.jsx'
import PricingView from './PricingView.jsx'

const fmt$ = (v) => v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`

function blockLabel(id, blocks, type) {
  if (!id || id === '__base__') return `Base ${type}`
  const found = (blocks[type.toLowerCase()] || []).find(b => b.id === id)
  return found ? found.name : 'Unknown block'
}

// ─── Coming soon placeholder ─────────────────────────────────────────────────

function ComingSoonPanel({ label }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-2)', marginBottom: 6 }}>
          {label} editor
        </div>
        <div style={{ fontSize: 13 }}>In development — coming soon</div>
      </div>
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

const SUB_TABS = ['distribution', 'pricing', 'promotion']

function ScenarioDetail({ scenario, devData, blocks, baseRows, fiscalCalendar, basePromoState, onDelete, onSaveNew, onOverwrite, onCreatePromoBlock, onSavePromotion, onCreatePricingBlock, onSavePricing, onUpdateScenario, months }) {
  const [subTab, setSubTab] = useState('distribution')
  const [confirming, setConfirming] = useState(false)

  const isBase = scenario?._isBase === true
  const savedDistId    = scenario?.distributionId || '__base__'
  const savedPromoId   = scenario?.promotionId    || '__base__'
  const savedPricingId = scenario?.pricingId      || '__base__'
  const [pendingDistId,    setPendingDistId]    = useState(savedDistId)
  const [pendingPromoId,   setPendingPromoId]   = useState(savedPromoId)
  const [pendingPricingId, setPendingPricingId] = useState(savedPricingId)
  const [computedFinancials, setComputedFinancials] = useState(null)
  const [blockRevision, setBlockRevision] = useState(0)

  useEffect(() => {
    if (!scenario) return

    const distBlock = pendingDistId && pendingDistId !== '__base__'
      ? (blocks.distribution || []).find(b => b.id === pendingDistId) || null
      : null
    const rows = distBlock?.inputs || null

    const pricingBlock = pendingPricingId && pendingPricingId !== '__base__'
      ? (blocks.pricing || []).find(b => b.id === pendingPricingId) || null
      : null
    const pricingRows = pricingBlock?.inputs
      ? Object.entries(pricingBlock.inputs).map(([skuName, skuData]) => ({
          sku_name: skuName,
          periods: skuData.periods || {},
        }))
      : null

    const promoBlock = pendingPromoId && pendingPromoId !== '__base__'
      ? (blocks.promotion || []).find(b => b.id === pendingPromoId) || null
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

    fetch('/api/compute', {
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
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setComputedFinancials(data))
      .catch((err) => console.error('[compute]', err))
  }, [pendingDistId, pendingPricingId, pendingPromoId, blockRevision])  // eslint-disable-line

  const isDistDirty    = pendingDistId    !== savedDistId
  const isPromoDirty   = pendingPromoId   !== savedPromoId
  const isPricingDirty = pendingPricingId !== savedPricingId
  const isDirty = isDistDirty || isPromoDirty || isPricingDirty

  const handleSaveScenario = () => {
    const updates = {}
    if (isDistDirty)    updates.distributionId = pendingDistId
    if (isPromoDirty)   updates.promotionId    = pendingPromoId
    if (isPricingDirty) updates.pricingId      = pendingPricingId
    if (Object.keys(updates).length) onUpdateScenario?.(scenario.id, updates)
  }

  // Auto-save the scenario immediately after any block is saved (new or overwrite).
  // Collects all pending changes so the user doesn't need a separate "Save Scenario" click.
  const autoSave = (overrides) => {
    const updates = { ...overrides }
    if (pendingDistId    !== savedDistId)    updates.distributionId = pendingDistId
    if (pendingPromoId   !== savedPromoId)   updates.promotionId    = pendingPromoId
    if (pendingPricingId !== savedPricingId) updates.pricingId      = pendingPricingId
    onUpdateScenario?.(scenario.id, updates)
  }

  const handleCreateDistBlock = (id, name, data) => {
    onSaveNew?.(id, name, data)
    autoSave({ distributionId: id })
  }
  const handleOverwriteDist = (blockId, data) => {
    onOverwrite?.(blockId, data)
    autoSave({ distributionId: blockId })
    setBlockRevision(r => r + 1)
  }
  const handleCreatePromoBlock = (id, name, data) => {
    onCreatePromoBlock?.(id, name, data)
    autoSave({ promotionId: id })
  }
  const handleOverwritePromo = (blockId, data) => {
    onSavePromotion?.(blockId, data)
    autoSave({ promotionId: blockId })
    setBlockRevision(r => r + 1)
  }
  const handleCreatePricingBlock = (id, name, data) => {
    onCreatePricingBlock?.(id, name, data)
    autoSave({ pricingId: id })
  }
  const handleOverwritePricing = (blockId, data) => {
    onSavePricing?.(blockId, data)
    autoSave({ pricingId: blockId })
    setBlockRevision(r => r + 1)
  }

  if (!scenario) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Select a scenario from the list.
      </div>
    )
  }

  // Resolve the distribution block that this scenario uses
  const distBlockId = scenario.distributionId || '__base__'
  const distBlock = (!distBlockId || distBlockId === '__base__')
    ? null
    : (blocks.distribution || []).find(b => b.id === distBlockId) || null

  // Resolve the promotion block
  const promoBlockId = scenario.promotionId || '__base__'
  const promoBlock = (!promoBlockId || promoBlockId === '__base__')
    ? null
    : (blocks.promotion || []).find(b => b.id === promoBlockId) || null

  // Resolve the pricing block
  const pricingBlockId = scenario.pricingId || '__base__'
  const pricingBlock = (!pricingBlockId || pricingBlockId === '__base__')
    ? null
    : (blocks.pricing || []).find(b => b.id === pricingBlockId) || null

  // Rows to seed the editor with
  const initialRows = distBlock ? distBlock.inputs : (baseRows || [])

  const d = scenario.createdAt ? new Date(scenario.createdAt) : null
  const dateStr = d && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Dot tag={scenario.tag} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>
              {scenario.name}
            </h2>
            {/* Financial summary — inline after name */}
            {(() => {
              const fin = computedFinancials || scenario
              return (
                <div style={{ display: 'flex', gap: 16, marginLeft: 6, paddingLeft: 16, borderLeft: '1px solid var(--line)' }}>
                  {[['Gross Sales', fmt$(fin?.grossSales)], ['T:S', fmtPct(fin?.tradeRate)]].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
            {isBase && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                color: 'var(--navy)', background: 'var(--navy-50)', padding: '2px 7px', borderRadius: 5,
              }}>BASELINE</span>
            )}
            {dateStr && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Created {dateStr}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            {confirming ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onDelete(scenario.id)} style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                }}>Delete</button>
                <button onClick={() => setConfirming(false)} style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                padding: 4, display: 'flex', alignItems: 'center',
              }} title="Delete scenario">
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        </div>
        {scenario.note && (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>{scenario.note}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['Distribution', scenario.distributionId], ['Pricing', scenario.pricingId], ['Promotion', scenario.promotionId]].map(([type, id]) => {
              const pendingId = type === 'Distribution' ? pendingDistId : type === 'Promotion' ? pendingPromoId : type === 'Pricing' ? pendingPricingId : null
              const dirty = type === 'Distribution' ? isDistDirty : type === 'Promotion' ? isPromoDirty : type === 'Pricing' ? isPricingDirty : false
              const showPending = pendingId && pendingId !== (id || '__base__')
              return (
                <div key={type} style={{ display: 'flex', gap: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>{type}:</span>
                  <span style={{ fontWeight: 600, color: dirty ? 'var(--navy)' : 'var(--ink-2)' }}>
                    {showPending ? blockLabel(pendingId, blocks, type) : blockLabel(id, blocks, type)}
                  </span>
                </div>
              )
            })}
          </div>
          <button
            onClick={handleSaveScenario}
            disabled={!isDirty}
            style={{
              fontSize: 14, fontWeight: 700, padding: '7px 18px', borderRadius: 7, border: 'none',
              background: isDirty ? '#dc2626' : 'var(--panel-2)',
              color: isDirty ? '#fff' : 'var(--muted)',
              cursor: isDirty ? 'pointer' : 'default',
              fontFamily: 'inherit', transition: 'background .15s, color .15s',
            }}
          >Save Scenario</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', flexShrink: 0, paddingLeft: 20 }}>
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              fontFamily: 'inherit', fontSize: 13, fontWeight: subTab === t ? 700 : 500,
              color: subTab === t ? 'var(--navy)' : 'var(--muted)',
              background: 'none', border: 'none', borderBottom: subTab === t ? '2px solid var(--navy)' : '2px solid transparent',
              padding: '10px 14px', cursor: 'pointer', textTransform: 'capitalize',
              marginBottom: -1,
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'distribution' && (
        // key forces remount (and state reset) when the scenario changes
        <DistributionEditor
          key={scenario.id + '-dist'}
          initialRows={initialRows}
          initialActiveBlock={distBlock}
          blocks={blocks.distribution || []}
          baseRows={baseRows}
          showBasePlan={true}
          onSaveNew={handleCreateDistBlock}
          onOverwrite={handleOverwriteDist}
          onBlockChange={setPendingDistId}
          months={months}
        />
      )}
      {subTab === 'pricing' && (
        <PricingView
          key={scenario.id + '-pricing'}
          devData={devData}
          fiscalCalendar={fiscalCalendar}
          blocks={blocks.pricing || []}
          initialActiveBlock={pricingBlock}
          onSaveNew={handleCreatePricingBlock}
          onOverwrite={handleOverwritePricing}
          onBlockChange={setPendingPricingId}
        />
      )}
      {subTab === 'promotion' && (
        <PromotionEditor
          key={scenario.id + '-promo'}
          initialGrid={promoBlock?.inputs?.grid || basePromoState?.grid || {}}
          initialPromos={promoBlock?.inputs?.promos || basePromoState?.promos || []}
          initialActiveBlock={promoBlock}
          blocks={blocks.promotion || []}
          baseGrid={basePromoState?.grid || {}}
          basePromos={basePromoState?.promos || []}
          rows={baseRows}
          fiscalCalendar={fiscalCalendar}
          onSaveNew={handleCreatePromoBlock}
          onOverwrite={handleOverwritePromo}
          onBlockChange={setPendingPromoId}
        />
      )}
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function SidebarItem({ scenario, selected, onClick }) {
  const isBase = scenario._isBase === true
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', fontFamily: 'inherit',
        background: selected ? 'var(--navy-50)' : 'none',
        border: 'none',
        borderLeft: `3px solid ${selected ? 'var(--navy)' : 'transparent'}`,
        borderRadius: '0 6px 6px 0',
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 9,
        transition: 'background .1s',
      }}
    >
      <Dot tag={scenario.tag} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: selected ? 700 : 600,
          color: selected ? 'var(--navy)' : 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {scenario.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
          {isBase ? 'Baseline' : 'Composed'}
        </div>
      </div>
      {isBase && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
          color: 'var(--navy)', background: 'var(--navy-50)', padding: '2px 5px', borderRadius: 4, flex: 'none',
        }}>BASE</span>
      )}
    </button>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function ScenariosView({
  scenarios = [],
  savedScenarios = [],
  blocks = {},
  devData,
  baseRows,
  fiscalCalendar = {},
  basePromoState,
  onNewScenario,
  onDeleteScenario,
  onUpdateScenario,
  onSaveDistribution,
  onCreateDistributionBlock,
  onSavePromotion,
  onCreatePromotionBlock,
  onSavePricing,
  onCreatePricingBlock,
  months,
}) {
  const allItems = [
    ...scenarios.map(s => ({ ...s, _isBase: true })),
    ...savedScenarios.map(s => ({ ...s, _isBase: false })),
  ]

  const [selectedId, setSelectedId] = useState(() => allItems[0]?.id ?? null)
  const selected = allItems.find(s => s.id === selectedId) ?? allItems[0] ?? null

  const handleDelete = (id) => {
    onDeleteScenario(id)
    const idx = allItems.findIndex(s => s.id === id)
    const next = allItems[idx - 1] ?? allItems[idx + 1] ?? null
    setSelectedId(next?.id ?? null)
  }

  // Determine which blockId the current scenario's distribution maps to
  const distBlockId = selected
    ? (selected._isBase ? null : (selected.distributionId || '__base__'))
    : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '14px 12px 8px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>
            Scenarios
          </div>
        </div>
        <div style={{ flex: 1, paddingRight: 6 }}>
          {allItems.map(s => (
            <SidebarItem
              key={s.id}
              scenario={s}
              selected={s.id === selected?.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
          {allItems.length === 0 && (
            <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              No scenarios yet.
            </div>
          )}
        </div>
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <button
            onClick={onNewScenario}
            style={{
              width: '100%', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
              border: '1.5px dashed var(--muted-2)', background: 'var(--panel-2)',
              color: 'var(--muted)', transition: 'border-color .15s, background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--navy-50)'; e.currentTarget.style.color = 'var(--navy)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--muted-2)'; e.currentTarget.style.background = 'var(--panel-2)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Icon name="plus" size={14} />
            New Scenario
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <ScenarioDetail
        key={selected?.id}
        scenario={selected}
        devData={devData}
        blocks={blocks}
        baseRows={baseRows}
        fiscalCalendar={fiscalCalendar}
        basePromoState={basePromoState}
        onDelete={handleDelete}
        onSaveNew={onCreateDistributionBlock}
        onOverwrite={(blockId, rows) => onSaveDistribution(blockId, rows)}
        onCreatePromoBlock={onCreatePromotionBlock}
        onSavePromotion={onSavePromotion}
        onCreatePricingBlock={onCreatePricingBlock}
        onSavePricing={onSavePricing}
        onUpdateScenario={onUpdateScenario}
        months={months}
      />
    </div>
  )
}

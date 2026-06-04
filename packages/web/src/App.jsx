import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadWorkbook, loadDevData } from './api.js'
import DistributionTab from './components/DistributionTab.jsx'

const TABS = [
  { id: 'distribution', label: 'Distribution' },
  { id: 'pricing',      label: 'Pricing',     disabled: true },
  { id: 'promotions',   label: 'Promotions',  disabled: true },
  { id: 'compare',      label: 'Compare',     disabled: true },
]

export default function App() {
  const [dapData,    setDapData]    = useState(null)
  const [meta,       setMeta]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [activeTab,  setActiveTab]  = useState('distribution')
  const [dragging,   setDragging]   = useState(false)
  const dragDepth = useRef(0)
  const dataKey   = useRef(0)

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await uploadWorkbook(file)
      dataKey.current += 1
      setDapData(data)
      setMeta({ file: file.name, skuCount: Object.keys(data.skus || {}).length })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDevData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadDevData()
      dataKey.current += 1
      setDapData(data)
      setMeta({ file: 'dev_data.json', skuCount: Object.keys(data.skus || {}).length })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const onOver  = (e) => e.preventDefault()
    const onEnter = (e) => { e.preventDefault(); dragDepth.current++; setDragging(true) }
    const onLeave = (e) => {
      e.preventDefault()
      dragDepth.current--
      if (dragDepth.current <= 0) { setDragging(false); dragDepth.current = 0 }
    }
    const onDrop = (e) => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) handleFile(f)
    }
    window.addEventListener('dragover',  onOver)
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop',      onDrop)
    return () => {
      window.removeEventListener('dragover',  onOver)
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop',      onDrop)
    }
  }, [handleFile])

  if (!dapData) {
    return (
      <div className={'landing' + (dragging ? ' drag' : '')}>
        <div className="landing-card">
          <div className="brand-mark">DAP</div>
          <h1>Distribution Acquisition Plan editor</h1>
          <p className="lede">
            Drop your DAP workbook (.xlsx) anywhere on this page to load and
            edit the distribution table.
          </p>
          {loading && <div className="status">Uploading & parsing workbook…</div>}
          {error   && <div className="status err">{error}</div>}
          <div className="landing-actions">
            <label className="btn primary">
              Choose .xlsx file
              <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </label>
            {import.meta.env.DEV && (
              <button className="btn" onClick={handleDevData}>
                Load dev data
              </button>
            )}
          </div>
        </div>
        <div className="drop-hint">Drop .xlsx to load · API must be running on port 8000</div>
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-inner">Drop .xlsx to load</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={'app' + (dragging ? ' drag' : '')}>
      <header className="bar">
        <div className="bar-left">
          <div className="brand-mark sm">DAP</div>
          <div className="bar-titles">
            <div className="bar-title">Scenario Planner</div>
            <div className="bar-sub">
              {meta?.file} · {meta?.skuCount} SKU{meta?.skuCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div className="bar-right">
          <label className="btn sm">
            Load file
            <input type="file" accept=".xlsx" hidden onChange={(e) => handleFile(e.target.files[0])} />
          </label>
        </div>
      </header>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'tab-btn' + (activeTab === t.id ? ' active' : '')}
            disabled={t.disabled}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            title={t.disabled ? 'Coming soon' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="tab-content">
        {activeTab === 'distribution' && (
          <DistributionTab key={dataKey.current} data={dapData} />
        )}
      </div>

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Drop .xlsx to load a new DAP</div>
        </div>
      )}
    </div>
  )
}

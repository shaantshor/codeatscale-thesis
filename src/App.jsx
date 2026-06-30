import { useState, useEffect, useRef } from 'react'
import CodeEditor from './components/CodeEditor'
import { LANGUAGES } from './config/languages'
import { buildIframeSrcdoc } from './utils/iframeRunner'
import './App.css'

// Pyodide has no cancellation API — terminating the Web Worker mid-run would
// corrupt its internal WASM state and is banned by project rules. Instead we
// surface a UI warning after SLOW_RUN_MS and let the worker finish naturally.
const SLOW_RUN_MS = 12000

function App() {
  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState(LANGUAGES['python'].starterCode)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [visual, setVisual] = useState(null)   // { type, data } | null
  const [activeTab, setActiveTab] = useState('console') // 'console' | 'visual'
  const [isRunning, setIsRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [slowWarning, setSlowWarning] = useState(false)
  const [runStats, setRunStats] = useState(null)

  // workersRef: Map<langId, Worker> — workers are instantiated lazily on first use
  // and kept alive so Pyodide/WebR/etc. don't reload on every run.
  const workersRef = useRef(new Map())
  const pendingRef = useRef(new Map())
  const slowTimerRef = useRef(null)
  // iframeRef: ref to the visual iframe element used for iframe-mode execution
  const iframeRef = useRef(null)

  // Wire up postMessage listener for iframe-mode languages (JavaScript, Java, etc.)
  // Messages arrive as { type: 'stdout'|'stderr'|'error'|'done', line }
  useEffect(() => {
    function handleIframeMessage(event) {
      const { type, line } = event.data || {}
      if (!type) return
      if (type === 'stdout') setOutput(prev => prev ? prev + '\n' + line : line)
      if (type === 'stderr') setError(prev => prev ? prev + '\n' + line : line)
      if (type === 'error')  setError(prev => prev ? prev + '\n' + line : line)
      if (type === 'done') {
        clearTimeout(slowTimerRef.current)
        setSlowWarning(false)
        setIsRunning(false)
        setHasRun(true)
      }
    }
    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [])

  // Terminate all workers on unmount
  useEffect(() => {
    const workers = workersRef.current
    return () => {
      for (const w of workers.values()) w.terminate()
    }
  }, [])

  function getOrCreateWorker(langId) {
    const workers = workersRef.current
    if (!workers.has(langId)) {
      const entry = LANGUAGES[langId]
      const worker = entry.workerFactory()
      worker.onmessage = ({ data }) => {
        const resolve = pendingRef.current.get(data.id)
        if (resolve) {
          resolve(data)
          pendingRef.current.delete(data.id)
        }
      }
      workers.set(langId, worker)
    }
    return workers.get(langId)
  }

  async function handleRun() {
    if (isRunning) return
    setIsRunning(true)
    setOutput('')
    setError('')
    setVisual(null)
    setSlowWarning(false)
    setRunStats(null)
    setHasRun(false)

    const entry = LANGUAGES[language]
    slowTimerRef.current = setTimeout(() => setSlowWarning(true), SLOW_RUN_MS)

    if (entry.executionMode === 'worker') {
      const worker = getOrCreateWorker(language)
      const id = crypto.randomUUID()
      const startTime = performance.now()

      const result = await new Promise(resolve => {
        pendingRef.current.set(id, resolve)
        worker.postMessage({ id, code })
      })
      const durationMs = Math.round(performance.now() - startTime)

      clearTimeout(slowTimerRef.current)
      setSlowWarning(false)
      setOutput(result.stdout || '')
      setError([result.stderr, result.error].filter(Boolean).join('\n'))
      if (result.visual) {
        setVisual(result.visual)
        setActiveTab('visual')
      }
      setRunStats({ durationMs })
      setIsRunning(false)
      setHasRun(true)

    } else if (entry.executionMode === 'iframe') {
      // iframe-mode (JavaScript): route execution through the visual iframe so users
      // can see DOM output in the Visual tab. Console stdout/stderr still arrive via
      // postMessage. isRunning / hasRun resolved by the 'done' postMessage.
      const srcdoc = buildIframeSrcdoc(code)
      setVisual({ type: '__iframe__', data: srcdoc })
      setActiveTab('visual')

    } else if (entry.executionMode === 'worker+iframe') {
      // worker+iframe (TypeScript): worker transpiles TS → JS, then we run the JS
      // output in the visual iframe exactly like iframe-mode JavaScript.
      const worker = getOrCreateWorker(language)
      const id = crypto.randomUUID()
      const startTime = performance.now()

      const result = await new Promise(resolve => {
        pendingRef.current.set(id, resolve)
        worker.postMessage({ id, code })
      })
      const durationMs = Math.round(performance.now() - startTime)

      // Show compile-time diagnostics and/or load errors in Console stderr
      const errText = [result.error, result.stderr].filter(Boolean).join('\n')
      if (errText) setError(errText)

      if (!result.jsOutput) {
        // Compiler failed to load or threw — nothing to run
        clearTimeout(slowTimerRef.current)
        setSlowWarning(false)
        setRunStats({ durationMs })
        setIsRunning(false)
        setHasRun(true)
        return
      }

      // Record compile time; iframe execution time is not separately tracked
      setRunStats({ durationMs })
      const srcdoc = buildIframeSrcdoc(result.jsOutput)
      setVisual({ type: '__iframe__', data: srcdoc })
      setActiveTab('visual')
      // isRunning stays true until 'done' postMessage arrives from the visual iframe
    }
  }

  function handleReset() {
    const entry = LANGUAGES[language]
    setCode(entry.starterCode)
    setOutput('')
    setError('')
    setVisual(null)
    setHasRun(false)
    setRunStats(null)
    setSlowWarning(false)
    setActiveTab('console')
  }

  function handleLanguageChange(e) {
    const newLang = e.target.value
    const entry = LANGUAGES[newLang]
    setLanguage(newLang)
    setCode(entry.starterCode)
    setOutput('')
    setError('')
    setVisual(null)
    setHasRun(false)
    setRunStats(null)
    setActiveTab('console')
  }

  // Build the srcdoc for the visual iframe from the visual payload
  function buildVisualSrcdoc(v) {
    if (!v) return ''
    if (v.type === 'svg') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}
svg{max-width:100%;height:auto;}</style></head>
<body>${v.data}</body></html>`
    }
    if (v.type === 'png') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}
img{max-width:100%;height:auto;}</style></head>
<body><img src="data:image/png;base64,${v.data}"></body></html>`
    }
    if (v.type === 'html') {
      return v.data
    }
    // __iframe__: the data IS the srcdoc — used for iframe-mode languages (JS, TS)
    // where the runner iframe is the visual output itself
    if (v.type === '__iframe__') {
      return v.data
    }
    if (v.type === 'table') {
      let rows
      try { rows = JSON.parse(v.data) } catch { rows = [] }
      const tables = rows.map(set => {
        const headers = set.columns.map(c => `<th>${c}</th>`).join('')
        const body = set.values.map(row =>
          `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`
        ).join('')
        return `<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`
      }).join('<br>')
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{margin:16px;font-family:system-ui,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #e2e6ea;padding:6px 10px;text-align:left;}
th{background:#f7f8fa;font-weight:600;}
tr:nth-child(even) td{background:#fafafa;}
</style></head>
<body>${tables}</body></html>`
    }
    return ''
  }

  const currentEntry = LANGUAGES[language]

  return (
    <div className="app-layout">
      <nav className="app-navbar">
        <div className="navbar-left">
          <span className="navbar-logo">CodeAtScale</span>
        </div>
        <div className="navbar-center">
          <select
            className="language-select"
            value={language}
            onChange={handleLanguageChange}
            disabled={isRunning}
          >
            {Object.values(LANGUAGES).map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.emoji} {entry.label}
              </option>
            ))}
          </select>
          <span className="lang-badge">{currentEntry.badge}</span>
        </div>
        <div className="navbar-right">
          {runStats && (
            <span className="run-stats">{runStats.durationMs} ms</span>
          )}
          <button className="btn-reset" onClick={handleReset} disabled={isRunning}>
            Reset
          </button>
          <button className="btn-run" onClick={handleRun} disabled={isRunning}>
            {isRunning
              ? <><span className="spinner" />Running</>
              : '▶ Run'
            }
          </button>
        </div>
      </nav>

      {slowWarning && (
        <div className="slow-warning">
          ⚠ This is taking longer than expected — infinite loop?
        </div>
      )}

      <div className="app-body">
        <div className="editor-pane">
          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
          />
        </div>

        <div className="output-pane">
          <div className="output-header">
            <div className="output-tabs">
              <button
                className={`output-tab${activeTab === 'console' ? ' active' : ''}`}
                onClick={() => setActiveTab('console')}
              >
                Console
              </button>
              <button
                className={`output-tab${activeTab === 'visual' ? ' active' : ''}${visual ? ' has-visual' : ''}`}
                onClick={() => setActiveTab('visual')}
              >
                Visual
              </button>
            </div>
            {hasRun && (
              <button
                className="btn-clear-output"
                onClick={() => {
                  setOutput('')
                  setError('')
                  setVisual(null)
                  setHasRun(false)
                  setRunStats(null)
                  setActiveTab('console')
                }}
              >
                Clear
              </button>
            )}
          </div>

          {activeTab === 'console' && (
            <div className="output-body">
              {!hasRun && !isRunning && (
                <p className="output-placeholder">Click ▶ Run to execute your code</p>
              )}
              {isRunning && !hasRun && (
                <p className="output-placeholder">Running…</p>
              )}
              {hasRun && !output && !error && (
                <p className="output-placeholder">No output</p>
              )}
              {output && <pre className="output-stdout">{output}</pre>}
              {error && <pre className="output-error">{error}</pre>}
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="visual-body">
              {!visual && !isRunning && (
                <p className="output-placeholder">No visual output — use plt.show() or return a visual payload</p>
              )}
              {isRunning && !visual && (
                <p className="output-placeholder">Running…</p>
              )}
              {visual && (
                <iframe
                  className="visual-iframe"
                  sandbox="allow-scripts"
                  srcDoc={buildVisualSrcdoc(visual)}
                  title="Visual output"
                />
              )}
            </div>
          )}

          {/* Hidden iframe used for iframe-mode language execution (JS, Java, etc.)
              It is always mounted so the postMessage listener can receive messages.
              srcdoc is set programmatically in handleRun. */}
          <iframe
            ref={iframeRef}
            className="runner-iframe"
            sandbox="allow-scripts"
            title="Code runner"
            srcDoc=""
          />
        </div>
      </div>
    </div>
  )
}

export default App

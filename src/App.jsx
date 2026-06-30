import { useState, useEffect, useRef } from 'react'
import CodeEditor from './components/CodeEditor'
import { LANGUAGES } from './config/languages'
import { buildIframeSrcdoc } from './utils/iframeRunner'
import { buildTraceSrcdoc } from './utils/traceVisualizer'
import './App.css'

const SLOW_RUN_MS = 12000

// Resizable pane bounds (percentages) and localStorage keys for persisting user-dragged sizes.
const EDITOR_PCT_MIN = 22
const EDITOR_PCT_MAX = 80
const CONSOLE_PCT_MIN = 12
const CONSOLE_PCT_MAX = 85
const LS_EDITOR_PCT = 'cas_editorWidthPct'
const LS_CONSOLE_PCT = 'cas_consoleHeightPct'

function readStoredPct(key, fallback, min, max) {
  try {
    const raw = localStorage.getItem(key)
    const n = raw !== null ? parseFloat(raw) : NaN
    if (!isNaN(n) && n >= min && n <= max) return n
  } catch (_) {}
  return fallback
}

function App() {
  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState(LANGUAGES['python'].starterCode)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [visual, setVisual] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [slowWarning, setSlowWarning] = useState(false)
  const [runStats, setRunStats] = useState(null)
  const [editorWidthPct, setEditorWidthPct] = useState(
    () => readStoredPct(LS_EDITOR_PCT, 60, EDITOR_PCT_MIN, EDITOR_PCT_MAX)
  )
  const [consoleHeightPct, setConsoleHeightPct] = useState(
    () => readStoredPct(LS_CONSOLE_PCT, 44, CONSOLE_PCT_MIN, CONSOLE_PCT_MAX)
  )
  const [draggingAxis, setDraggingAxis] = useState(null) // 'col' | 'row' | null

  const workersRef = useRef(new Map())
  const pendingRef = useRef(new Map())
  const slowTimerRef = useRef(null)
  const codeRef = useRef(LANGUAGES['python'].starterCode)
  const handleRunRef = useRef(null)
  const appBodyRef = useRef(null)
  const outputPaneRef = useRef(null)

  codeRef.current = code

  function startColResize(e) {
    e.preventDefault()
    setDraggingAxis('col')
    const body = appBodyRef.current
    function onMove(ev) {
      if (!body) return
      const rect = body.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(EDITOR_PCT_MAX, Math.max(EDITOR_PCT_MIN, pct))
      setEditorWidthPct(clamped)
    }
    function onUp() {
      setDraggingAxis(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setEditorWidthPct(current => {
        try { localStorage.setItem(LS_EDITOR_PCT, String(current)) } catch (_) {}
        return current
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startRowResize(e) {
    e.preventDefault()
    setDraggingAxis('row')
    const pane = outputPaneRef.current
    function onMove(ev) {
      if (!pane) return
      const rect = pane.getBoundingClientRect()
      const pct = ((ev.clientY - rect.top) / rect.height) * 100
      const clamped = Math.min(CONSOLE_PCT_MAX, Math.max(CONSOLE_PCT_MIN, pct))
      setConsoleHeightPct(clamped)
    }
    function onUp() {
      setDraggingAxis(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setConsoleHeightPct(current => {
        try { localStorage.setItem(LS_CONSOLE_PCT, String(current)) } catch (_) {}
        return current
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    function handleIframeMessage(event) {
      const { type } = event.data || {}
      if (!type) return
      const { line } = event.data
      if (type === 'stdout') setOutput(prev => prev ? prev + '\n' + line : line)
      if (type === 'stderr') setError(prev => prev ? prev + '\n' + line : line)
      if (type === 'error')  setError(prev => prev ? prev + '\n' + line : line)
      if (type === 'done') {
        clearTimeout(slowTimerRef.current)
        setSlowWarning(false)
        setIsRunning(false)
        setHasRun(true)
      }
      if (type === 'code_patch') {
        const { from, to } = event.data
        if (!from || to === undefined || from === to) return
        const newCode = codeRef.current.replace(from, to)
        if (newCode === codeRef.current) return
        codeRef.current = newCode
        setCode(newCode)
        handleRunRef.current?.(newCode)
      }
    }
    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [])

  useEffect(() => {
    const workers = workersRef.current
    return () => { for (const w of workers.values()) w.terminate() }
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleRunRef.current?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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

  async function handleRun(codeOverride) {
    if (isRunning) return
    const codeToRun = codeOverride !== undefined ? codeOverride : codeRef.current
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
        worker.postMessage({ id, code: codeToRun })
      })
      const durationMs = Math.round(performance.now() - startTime)

      clearTimeout(slowTimerRef.current)
      setSlowWarning(false)
      setOutput(result.stdout || '')
      setError([result.stderr, result.error].filter(Boolean).join('\n'))
      if (result.visual) setVisual(result.visual)
      setRunStats({ durationMs })
      setIsRunning(false)
      setHasRun(true)

    } else if (entry.executionMode === 'iframe') {
      const srcdoc = buildIframeSrcdoc(codeToRun)
      setVisual({ type: '__iframe__', data: srcdoc })

    } else if (entry.executionMode === 'worker+iframe') {
      const worker = getOrCreateWorker(language)
      const id = crypto.randomUUID()
      const startTime = performance.now()

      const result = await new Promise(resolve => {
        pendingRef.current.set(id, resolve)
        worker.postMessage({ id, code: codeToRun })
      })
      const durationMs = Math.round(performance.now() - startTime)

      const errText = [result.error, result.stderr].filter(Boolean).join('\n')
      if (errText) setError(errText)

      if (!result.jsOutput) {
        clearTimeout(slowTimerRef.current)
        setSlowWarning(false)
        setRunStats({ durationMs })
        setIsRunning(false)
        setHasRun(true)
        return
      }

      setRunStats({ durationMs })
      const srcdoc = buildIframeSrcdoc(result.jsOutput)
      setVisual({ type: '__iframe__', data: srcdoc })
    }
  }

  handleRunRef.current = handleRun

  function handleReset() {
    const entry = LANGUAGES[language]
    setCode(entry.starterCode)
    codeRef.current = entry.starterCode
    setOutput('')
    setError('')
    setVisual(null)
    setHasRun(false)
    setRunStats(null)
    setSlowWarning(false)
  }

  function handleClear() {
    setOutput('')
    setError('')
    setVisual(null)
    setHasRun(false)
    setRunStats(null)
  }

  function handleLanguageChange(e) {
    const newLang = e.target.value
    const entry = LANGUAGES[newLang]
    setLanguage(newLang)
    setCode(entry.starterCode)
    codeRef.current = entry.starterCode
    setOutput('')
    setError('')
    setVisual(null)
    setHasRun(false)
    setRunStats(null)
  }

  function buildVisualSrcdoc(v) {
    if (!v) return ''
    if (v.type === 'trace') return buildTraceSrcdoc(v.data, v.code)
    if (v.type === 'svg') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1e1e2e;}
svg{max-width:100%;height:auto;}</style></head>
<body>${v.data}</body></html>`
    }
    if (v.type === 'png') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1e1e2e;}
img{max-width:100%;height:auto;}</style></head>
<body><img src="data:image/png;base64,${v.data}"></body></html>`
    }
    if (v.type === 'html') return v.data
    if (v.type === '__iframe__') return v.data
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
body{margin:16px;font-family:system-ui,sans-serif;font-size:13px;color:#cdd6f4;background:#1e1e2e;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid rgba(255,255,255,0.1);padding:6px 10px;text-align:left;}
th{background:rgba(255,255,255,0.06);font-weight:600;}
tr:nth-child(even) td{background:rgba(255,255,255,0.03);}
</style></head>
<body>${tables}</body></html>`
    }
    return ''
  }

  function buildDefaultVisualSrcdoc(stdout, stderr, stats) {
    const hasError = !!stderr
    const statusColor = hasError ? '#f38ba8' : '#a6e3a1'
    const statusLabel = hasError ? 'Error' : 'Execution complete'
    const timeLabel = stats ? `${stats.durationMs} ms` : ''

    const escape = s => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const stdoutBlock = stdout
      ? `<pre class="out stdout">${escape(stdout)}</pre>` : ''
    const stderrBlock = stderr
      ? `<pre class="out stderr">${escape(stderr)}</pre>` : ''
    const emptyBlock = !stdout && !stderr
      ? `<p class="empty">No output produced</p>` : ''

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{
  background:#1e1e2e;
  color:#cdd6f4;
  font-family:system-ui,-apple-system,sans-serif;
  font-size:13px;
  padding:12px;
  height:100vh;
  overflow-y:auto;
}
.card{
  border:1px solid rgba(255,255,255,0.08);
  border-radius:8px;
  overflow:hidden;
}
.card-header{
  background:rgba(255,255,255,0.04);
  padding:8px 12px;
  display:flex;
  align-items:center;
  gap:8px;
  border-bottom:1px solid rgba(255,255,255,0.07);
}
.dot{
  width:8px;height:8px;border-radius:50%;
  background:${statusColor};flex-shrink:0;
}
.label{
  font-size:11px;font-weight:600;
  text-transform:uppercase;letter-spacing:0.5px;
  color:${statusColor};
}
.time{
  margin-left:auto;font-size:11px;
  color:rgba(255,255,255,0.28);
  font-variant-numeric:tabular-nums;
}
.card-body{
  padding:12px;
  font-family:'Fira Code','Cascadia Code',Menlo,monospace;
  font-size:13px;line-height:1.65;
}
.out{white-space:pre-wrap;word-break:break-word;}
.stdout{color:#a6e3a1;}
.stderr{color:#f38ba8;margin-top:8px;}
.empty{color:rgba(255,255,255,0.2);font-style:italic;font-family:system-ui;}
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <div class="dot"></div>
    <span class="label">${statusLabel}</span>
    ${timeLabel ? `<span class="time">${timeLabel}</span>` : ''}
  </div>
  <div class="card-body">
    ${stdoutBlock}${stderrBlock}${emptyBlock}
  </div>
</div>
</body>
</html>`
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
          <button className="btn-run" onClick={() => handleRun()} disabled={isRunning}>
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

      <div className={`app-body${draggingAxis ? ' is-dragging' : ''}`} ref={appBodyRef}>
        <div className="editor-pane" style={{ width: `${editorWidthPct}%` }}>
          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
          />
        </div>

        <div
          className={`pane-resizer pane-resizer-col${draggingAxis === 'col' ? ' dragging' : ''}`}
          onMouseDown={startColResize}
          title="Drag to resize"
        />

        <div className="output-pane" ref={outputPaneRef}>
          <div className="console-section" style={{ height: `${consoleHeightPct}%` }}>
            <div className="section-header">
              <span className="section-label">Console</span>
              {hasRun && (
                <button className="btn-clear-output" onClick={handleClear}>Clear</button>
              )}
            </div>
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
          </div>

          <div
            className={`pane-resizer pane-resizer-row${draggingAxis === 'row' ? ' dragging' : ''}`}
            onMouseDown={startRowResize}
            title="Drag to resize"
          />

          <div className="visual-section">
            <div className="section-header">
              <span className="section-label">Visual</span>
            </div>
            <div className="visual-body">
              {!hasRun && !isRunning && !visual && (
                <p className="output-placeholder">Run code to see visual output</p>
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
              {!visual && hasRun && !isRunning && (
                <iframe
                  className="visual-iframe"
                  sandbox="allow-scripts"
                  srcDoc={buildDefaultVisualSrcdoc(output, error, runStats)}
                  title="Execution summary"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

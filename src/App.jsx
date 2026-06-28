import { useState, useEffect, useRef } from 'react'
import PythonWorker from './workers/python.worker.js?worker'
import CodeEditor from './components/CodeEditor'
import './App.css'

const STARTER_CODE = `# CodeAtScale — Python playground
# Code runs entirely in your browser via Pyodide (WebAssembly)

print("Hello from the browser!")
`

// Pyodide has no cancellation API — terminating the Web Worker mid-run would
// corrupt its internal WASM state and is banned by project rules. Instead we
// surface a UI warning after SLOW_RUN_MS and let the worker finish naturally.
const SLOW_RUN_MS = 12000

function App() {
  const [code, setCode] = useState(STARTER_CODE)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [slowWarning, setSlowWarning] = useState(false)
  const [runStats, setRunStats] = useState(null)
  const workerRef = useRef(null)
  const pendingRef = useRef(new Map())
  const slowTimerRef = useRef(null)

  useEffect(() => {
    const worker = new PythonWorker()
    workerRef.current = worker

    worker.onmessage = ({ data }) => {
      const resolve = pendingRef.current.get(data.id)
      if (resolve) {
        resolve(data)
        pendingRef.current.delete(data.id)
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  async function handleRun() {
    if (!workerRef.current || isRunning) return
    setIsRunning(true)
    setOutput('')
    setError('')
    setSlowWarning(false)
    setRunStats(null)

    slowTimerRef.current = setTimeout(() => setSlowWarning(true), SLOW_RUN_MS)

    const id = crypto.randomUUID()
    const startTime = performance.now()
    const result = await new Promise(resolve => {
      pendingRef.current.set(id, resolve)
      workerRef.current.postMessage({ id, code })
    })
    const durationMs = Math.round(performance.now() - startTime)

    clearTimeout(slowTimerRef.current)
    setSlowWarning(false)
    setOutput(result.stdout || '')
    setError([result.stderr, result.error].filter(Boolean).join('\n'))
    setRunStats({ durationMs })
    setIsRunning(false)
    setHasRun(true)
  }

  function handleReset() {
    setCode(STARTER_CODE)
    setOutput('')
    setError('')
    setHasRun(false)
    setRunStats(null)
    setSlowWarning(false)
  }

  return (
    <div className="app-layout">
      <nav className="app-navbar">
        <div className="navbar-left">
          <span className="navbar-logo">CodeAtScale</span>
        </div>
        <div className="navbar-center">
          <div className="language-selector">
            <span>🐍</span>
            <span>Python 3</span>
            <span className="lang-badge">Pyodide</span>
          </div>
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
          <CodeEditor value={code} onChange={setCode} />
        </div>

        <div className="output-pane">
          <div className="output-header">
            <span>Console</span>
            {hasRun && (
              <button
                className="btn-clear-output"
                onClick={() => { setOutput(''); setError(''); setHasRun(false); setRunStats(null) }}
              >
                Clear
              </button>
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
      </div>
    </div>
  )
}

export default App

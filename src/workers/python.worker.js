let stdoutLines = []
let stderrLines = []

const pyodideReady = (async () => {
  const { loadPyodide } = await import(
    'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs'
  )
  const pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  })
  pyodide.setStdout({ batched: (line) => stdoutLines.push(line) })
  pyodide.setStderr({ batched: (line) => stderrLines.push(line) })
  return pyodide
})()

// Tracer runs in the SAME runPythonAsync call as user code so sys.settrace persists.
// No filename filter: Pyodide's co_filename for exec'd code is NOT '<exec>' or '<string>',
// so the filename check was silently dropping all frames. We rely on name-based filters only:
// skip functions whose name starts with '_' (internal) or '<' (module, lambda, listcomp).
// _LINE_OFF is injected at runtime so frame.f_lineno values are user-code-relative.
const TRACER_SETUP = `
import sys as _sys
import json as _json

_trace_log = []

def _tracer(frame, event, arg):
    if len(_trace_log) >= 150:
        return None
    fname = frame.f_code.co_name
    if fname.startswith('_') or fname.startswith('<'):
        return None
    if event in ('call', 'return'):
        loc = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('_'):
                try:
                    r = repr(v)
                    loc[k] = r[:120] if len(r) > 120 else r
                except Exception:
                    loc[k] = '?'
        _trace_log.append({
            'event': event,
            'func': fname,
            'line': max(1, frame.f_lineno - _LINE_OFF),
            'locals': loc,
            'ret': (repr(arg)[:80] if arg is not None else None) if event == 'return' else None
        })
    return _tracer

_sys.settrace(_tracer)
`

const TRACER_CLEANUP = `
_sys.settrace(None)
`

self.onmessage = async ({ data: { id, code } }) => {
  let pyodide
  try {
    pyodide = await pyodideReady
  } catch (err) {
    self.postMessage({
      id,
      stdout: '',
      stderr: '',
      error: `Pyodide failed to initialise: ${err.message}`,
      visual: null,
    })
    return
  }

  stdoutLines = []
  stderrLines = []

  try {
    // Compute line offset: count lines before user code in the combined script.
    // Using a placeholder value keeps the line count stable regardless of the actual number.
    const beforeUser = `_LINE_OFF = 0\n` + TRACER_SETUP + '\n'
    const lineOff = beforeUser.split('\n').length - 1
    const fullCode = `_LINE_OFF = ${lineOff}\n` + TRACER_SETUP + '\n' + code + '\n' + TRACER_CLEANUP

    await pyodide.runPythonAsync(fullCode)
    const traceJson = await pyodide.runPythonAsync('_json.dumps(_trace_log)')
    const hasTrace = traceJson !== '[]'

    self.postMessage({
      id,
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
      error: null,
      visual: hasTrace ? { type: 'trace', data: traceJson, code } : null,
    })
  } catch (runErr) {
    try { await pyodide.runPythonAsync('_sys.settrace(None)') } catch (_) {}
    self.postMessage({
      id,
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
      error: runErr.message,
      visual: null,
    })
  }
}

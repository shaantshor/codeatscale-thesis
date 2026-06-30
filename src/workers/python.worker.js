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
//
// Line-level tracing: in addition to 'call'/'return', we now trace 'line' events so every
// statement (loop iterations, assignments, comparisons) becomes its own step, matching DAP-style
// step debuggers. This produces far more steps than the old call/return-only tracer, so the cap
// is raised from 150 to 2000 and a 'truncated' flag is reported if the cap is hit.
//
// Locals are no longer flattened to bare repr strings. Each local is classified into a kind
// (int/float/str/bool/none/list/tuple/dict/fn/obj) and list/tuple values additionally carry an
// 'items' array of per-element reprs, captured directly in Python. This lets the frontend render
// arrays as connected boxes and diff them step-to-step without regex-parsing a repr string.
const TRACER_SETUP = `
import sys as _sys
import json as _json

_trace_log = []
_truncated = [False]

def _classify(v):
    try:
        if v is None:
            return ('none', 'None', None)
        if isinstance(v, bool):
            return ('bool', repr(v), None)
        if isinstance(v, int):
            return ('int', repr(v), None)
        if isinstance(v, float):
            return ('float', repr(v), None)
        if isinstance(v, str):
            r = repr(v)
            return ('str', r[:120] if len(r) > 120 else r, None)
        if isinstance(v, (list, tuple)):
            items = []
            for el in list(v)[:50]:
                try:
                    ir = repr(el)
                except Exception:
                    ir = '?'
                items.append(ir[:60] if len(ir) > 60 else ir)
            kind = 'list' if isinstance(v, list) else 'tuple'
            r = repr(v)
            return (kind, r[:120] if len(r) > 120 else r, items)
        if isinstance(v, dict):
            r = repr(v)
            return ('dict', r[:120] if len(r) > 120 else r, None)
        if callable(v):
            return ('fn', repr(v)[:80], None)
        r = repr(v)
        return ('obj', r[:120] if len(r) > 120 else r, None)
    except Exception:
        return ('obj', '?', None)

def _tracer(frame, event, arg):
    if len(_trace_log) >= 2000:
        _truncated[0] = True
        return None
    fname = frame.f_code.co_name
    if fname.startswith('_') or fname.startswith('<'):
        return None
    if event in ('call', 'line', 'return'):
        loc = {}
        for k, v in frame.f_locals.items():
            if k.startswith('_'):
                continue
            kind, r, items = _classify(v)
            entry = {'r': r, 'k': kind}
            if items is not None:
                entry['items'] = items
            loc[k] = entry
        ret_entry = None
        if event == 'return' and arg is not None:
            rk, rr, ritems = _classify(arg)
            ret_entry = {'r': rr, 'k': rk}
            if ritems is not None:
                ret_entry['items'] = ritems
        _trace_log.append({
            'event': event,
            'func': fname,
            'line': max(1, frame.f_lineno - _LINE_OFF),
            'locals': loc,
            'ret': ret_entry
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
    const traceJson = await pyodide.runPythonAsync(
      '_json.dumps({"frames": _trace_log, "truncated": _truncated[0]})'
    )
    const parsedTrace = JSON.parse(traceJson)
    const hasTrace = parsedTrace.frames.length > 0

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

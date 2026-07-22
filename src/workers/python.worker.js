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
// No filename filter: Pyodide v0.26.4 co_filename for exec'd code is not '<exec>'/'<string>',
// so we rely on name-based filters only (skip '_' and '<' prefixed names).
// _LINE_OFF is injected at runtime so frame.f_lineno values are user-code-relative.
//
// Object graph extension (Session 1, 2026-07-18):
// _classify_local() replaces the old _classify() tuple-returning function.
// For user-defined class instances it captures:
//   oid   — stable integer object ID (via _get_oid, backed by _OBJ_ID_MAP)
//   cls   — class name (type(v).__name__)
//   fields — { field_name: classified_entry } from v.__dict__, depth-capped at 5
// Circular refs are represented as kind='ref' with oid pointing back to the already-seen object.
// _walk_heap() collects all reachable object entries from locals into a flat heap snapshot:
//   { str(oid): { cls, r, fields } }
// The heap snapshot is appended to each trace frame as `heap` (omitted when empty).
// traceVisualizer.js ignores unknown frame keys for now; Session 2 adds the graph renderer.
const TRACER_SETUP = `
import sys as _sys
import json as _json

_trace_log = []
_truncated = [False]

_OBJ_ID_MAP = {}
_OBJ_ID_CTR = [0]

def _get_oid(v):
    pid = id(v)
    if pid not in _OBJ_ID_MAP:
        _OBJ_ID_MAP[pid] = _OBJ_ID_CTR[0]
        _OBJ_ID_CTR[0] += 1
    return _OBJ_ID_MAP[pid]

def _is_obj(v):
    if v is None or isinstance(v, (bool, int, float, str, bytes,
                                    list, tuple, dict, set, frozenset, type)):
        return False
    if callable(v):
        return False
    try:
        return hasattr(v, '__dict__') and isinstance(v.__dict__, dict)
    except Exception:
        return False

def _classify_local(v, depth=0, _seen=None):
    if _seen is None:
        _seen = set()
    try:
        if v is None:
            return {'k': 'none', 'r': 'None'}
        if isinstance(v, bool):
            return {'k': 'bool', 'r': repr(v)}
        if isinstance(v, int):
            return {'k': 'int', 'r': repr(v)}
        if isinstance(v, float):
            return {'k': 'float', 'r': repr(v)}
        if isinstance(v, str):
            r = repr(v)
            return {'k': 'str', 'r': r[:120] if len(r) > 120 else r}
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
            return {'k': kind, 'r': r[:120] if len(r) > 120 else r, 'items': items}
        if isinstance(v, dict):
            r = repr(v)
            return {'k': 'dict', 'r': r[:120] if len(r) > 120 else r}
        if _is_obj(v):
            oid = _get_oid(v)
            vid = id(v)
            if vid in _seen:
                return {'k': 'ref', 'r': '<' + type(v).__name__ + ' #' + str(oid) + '>', 'oid': oid}
            cls = type(v).__name__
            try:
                r = repr(v)
                r = r[:120] if len(r) > 120 else r
            except Exception:
                r = '<' + cls + ' #' + str(oid) + '>'
            entry = {'k': 'obj', 'r': r, 'oid': oid, 'cls': cls}
            if depth < 5:
                new_seen = _seen | {vid}
                fields = {}
                try:
                    for fn2, fv in list(v.__dict__.items())[:20]:
                        if not fn2.startswith('_'):
                            fields[fn2] = _classify_local(fv, depth + 1, new_seen)
                except Exception:
                    pass
                if fields:
                    entry['fields'] = fields
            return entry
        if callable(v):
            return {'k': 'fn', 'r': repr(v)[:80]}
        r = repr(v)
        return {'k': 'obj', 'r': r[:120] if len(r) > 120 else r}
    except Exception:
        return {'k': 'obj', 'r': '?'}

def _collect_heap(entry, heap, visited):
    if not isinstance(entry, dict) or entry.get('k') != 'obj':
        return
    oid = entry.get('oid')
    if oid is None or oid in visited:
        return
    visited.add(oid)
    heap[str(oid)] = {
        'cls': entry.get('cls', '?'),
        'r': entry.get('r', '?'),
        'fields': entry.get('fields', {})
    }
    for fval in entry.get('fields', {}).values():
        _collect_heap(fval, heap, visited)

def _walk_heap(loc):
    heap = {}
    visited = set()
    for entry in loc.values():
        _collect_heap(entry, heap, visited)
    return heap

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
            loc[k] = _classify_local(v)
        ret_entry = None
        if event == 'return' and arg is not None:
            ret_entry = _classify_local(arg)
        heap = _walk_heap(loc)
        frame_data = {
            'event': event,
            'func': fname,
            'line': max(1, frame.f_lineno - _LINE_OFF),
            'locals': loc,
            'ret': ret_entry,
        }
        if heap:
            frame_data['heap'] = heap
        _trace_log.append(frame_data)
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

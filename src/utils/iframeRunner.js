// iframeRunner.js — generates a self-contained HTML document used as the srcdoc
// of a sandboxed <iframe> for iframe-mode languages (JavaScript, TypeScript output,
// Java via CheerpJ, etc.).
//
// The generated document:
//   1. Intercepts console.log / console.warn / console.error
//   2. Wraps user code execution in try/catch
//   3. Posts { type: 'stdout'|'stderr'|'error'|'done', line } messages to the parent
//      via window.postMessage so App.jsx can collect stdout/stderr without any server
//
// App.jsx listens for these messages on window, matches them to the active run by
// a shared runId, and routes them to the output pane.
//
// Parameters:
//   code          — user's source code string (JS or already-transpiled JS)
//   extraHeadHtml — optional HTML injected into <head> before the script block
//                   (used to load CDN libraries like CheerpJ for Java)

export function buildIframeSrcdoc(code, extraHeadHtml = '') {
  // Escape backticks and backslashes in user code so it can be embedded in a
  // template literal inside the generated script. We use JSON.stringify which
  // produces a quoted JS string literal that is always safe to eval.
  const escapedCode = JSON.stringify(code)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${extraHeadHtml}
<script>
(function () {
  function post(type, line) {
    window.parent.postMessage({ type, line }, '*')
  }

  // Intercept console methods before user code runs
  var _log   = console.log.bind(console)
  var _warn  = console.warn.bind(console)
  var _error = console.error.bind(console)

  console.log = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stdout', line)
    _log.apply(console, arguments)
  }
  console.warn = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stderr', line)
    _warn.apply(console, arguments)
  }
  console.error = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stderr', line)
    _error.apply(console, arguments)
  }

  // Run user code
  window.addEventListener('load', function () {
    try {
      var fn = new Function(${escapedCode})
      fn()
    } catch (err) {
      post('error', err.message || String(err))
    } finally {
      // The Visual pane IS this iframe's body for iframe-mode languages, so code that never
      // touches the DOM (console.log-only scripts, algorithms with no rendering) left it blank
      // white with no signal that anything ran. Reporting whether the body ended up empty lets
      // App.jsx fall back to the same "execution complete" summary card Python already shows
      // when it has no visual payload, instead of leaving a blank pane.
      window.parent.postMessage({ type: 'done', line: '', bodyEmpty: !document.body.innerHTML.trim() }, '*')
    }
  })
})()
<\/script>
</head>
<body></body>
</html>`
}

// buildTraceableIframeSrcdoc — same console interception + execution contract as
// buildIframeSrcdoc, plus a small runtime tracer library used by code that jsInstrumenter.js
// has already spliced __trace()/__traceReturn() calls into. Produces the exact frame shape
// python.worker.js's sys.settrace tracer produces ({ event, func, line, locals, ret }), so the
// SAME buildTraceSrcdoc step-debugger UI can render either language's trace unmodified.
//
// The tracer runtime is deliberately dumb: __trace/__traceReturn only ever read values the
// instrumented code already has in scope and push a classified snapshot into a frame array —
// they never alter control flow (__traceReturn hands back the value it was given unchanged), so
// a bug here can't change what the user's program actually does, only what gets recorded about it.
//
// Posts an extra { type: 'js_trace', frames, truncated } message right before 'done', in
// addition to the existing stdout/stderr/error/done messages — App.jsx upgrades the Visual pane
// from the raw iframe view to the trace debugger once this arrives, or leaves the raw iframe
// view in place if frames come back empty (e.g. functions were defined but never called).
export function buildTraceableIframeSrcdoc(instrumentedCode) {
  const escapedCode = JSON.stringify(instrumentedCode)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
(function () {
  function post(type, line) {
    window.parent.postMessage({ type, line }, '*')
  }

  var _log   = console.log.bind(console)
  var _warn  = console.warn.bind(console)
  var _error = console.error.bind(console)

  console.log = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stdout', line)
    _log.apply(console, arguments)
  }
  console.warn = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stderr', line)
    _warn.apply(console, arguments)
  }
  console.error = function () {
    var line = Array.from(arguments).map(String).join(' ')
    post('stderr', line)
    _error.apply(console, arguments)
  }

  // --- trace runtime, mirrors python.worker.js's _classify_local / _tracer in JS terms ---
  // Session 3 (2026-07-18): added class instance detection and heap collection so the same
  // object-graph renderer added to traceVisualizer.js in Session 2 works for JS/TS traces.
  // __classify returns a dict {k, r, items?, oid?, cls?, fields?} — identical shape to the
  // Python tracer. Class instances (non-builtin constructors, depth<=5, max 20 fields) are
  // classified as k='obj'; circular refs become k='ref'. Plain {} stays k='dict'.
  // __buildFrame computes both the locals snapshot and the heap dict in one pass.
  var __traceFrames = []
  var __traceTruncated = false
  var __objIdMap = new WeakMap()
  var __objIdCtr = 0
  function __getObjId(v) {
    if (!__objIdMap.has(v)) __objIdMap.set(v, __objIdCtr++)
    return __objIdMap.get(v)
  }

  var __BUILTIN = new Set(['Object','Array','Function','RegExp','Date','Map','Set','WeakMap','WeakSet','Promise','Error','TypeError','RangeError','SyntaxError','ReferenceError','EvalError','URIError','ArrayBuffer','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','Number','String','Boolean','Symbol','BigInt'])

  function __classify(v, depth, seen) {
    if (depth === undefined) depth = 0
    try {
      if (v === null || v === undefined) return { k: 'none', r: 'None' }
      if (typeof v === 'boolean') return { k: 'bool', r: String(v) }
      if (typeof v === 'number') return { k: Number.isInteger(v) ? 'int' : 'float', r: String(v) }
      if (typeof v === 'string') {
        var rs = JSON.stringify(v)
        return { k: 'str', r: rs.length > 120 ? rs.slice(0, 120) + '...' : rs }
      }
      if (Array.isArray(v)) {
        var items = v.slice(0, 50).map(function(el) {
          var s; try { s = JSON.stringify(el) } catch(e) { s = String(el) }
          if (s === undefined) s = String(el)
          return s.length > 60 ? s.slice(0, 60) + '...' : s
        })
        var ra = '[' + items.join(', ') + (v.length > 50 ? ', ...' : '') + ']'
        return { k: 'list', r: ra.length > 120 ? ra.slice(0, 120) + '...' : ra, items: items }
      }
      if (typeof v === 'function') return { k: 'fn', r: 'function ' + (v.name || 'anonymous') + '()' }
      if (typeof v === 'object') {
        var cls = v.constructor && typeof v.constructor.name === 'string' && v.constructor.name && !__BUILTIN.has(v.constructor.name) ? v.constructor.name : null
        if (cls) {
          if (seen && seen.has(v)) return { k: 'ref', r: '<' + cls + ' #' + __getObjId(v) + '>', oid: __getObjId(v) }
          var oid = __getObjId(v)
          var objEntry = { k: 'obj', r: cls + '#' + oid, oid: oid, cls: cls }
          if (depth < 5) {
            if (!seen) seen = new WeakSet()
            seen.add(v)
            var fields = {}
            try {
              var keys = Object.keys(v).slice(0, 20)
              for (var ki = 0; ki < keys.length; ki++) {
                var fk = keys[ki]
                if (fk.charAt(0) !== '_') {
                  try { fields[fk] = __classify(v[fk], depth + 1, seen) } catch(e) {}
                }
              }
            } catch(e) {}
            if (Object.keys(fields).length) objEntry.fields = fields
          }
          return objEntry
        }
        var ro; try { ro = JSON.stringify(v) } catch(e) { ro = String(v) }
        return { k: 'dict', r: ro && ro.length > 120 ? ro.slice(0, 120) + '...' : (ro || '{}') }
      }
      return { k: 'obj', r: String(v) }
    } catch(e) {
      return { k: 'obj', r: '?' }
    }
  }

  function __collectHeap(entry, heap, visited) {
    if (!entry || entry.k !== 'obj' || entry.oid == null) return
    var key = String(entry.oid)
    if (visited.has(key)) return
    visited.add(key)
    heap[key] = { cls: entry.cls, r: entry.r, fields: entry.fields || {} }
    var flds = entry.fields || {}
    Object.keys(flds).forEach(function(fn) { __collectHeap(flds[fn], heap, visited) })
  }

  function __buildFrame(pairs) {
    var loc = {}, heap = {}, heapVisited = new Set(), seen = new WeakSet()
    for (var i = 0; i < pairs.length; i++) {
      var name = pairs[i][0], val = pairs[i][1]
      var entry = __classify(val, 0, seen)
      var locEntry = { k: entry.k, r: entry.r }
      if (entry.items) locEntry.items = entry.items
      if (entry.oid != null) locEntry.oid = entry.oid
      loc[name] = locEntry
      __collectHeap(entry, heap, heapVisited)
    }
    return { loc: loc, heap: Object.keys(heap).length ? heap : null }
  }

  window.__trace = function(line, event, func, pairs) {
    if (__traceFrames.length >= 2000) { __traceTruncated = true; return }
    var frame = __buildFrame(pairs)
    var f = { event: event, func: func, line: line, locals: frame.loc, ret: null }
    if (frame.heap) f.heap = frame.heap
    __traceFrames.push(f)
  }

  window.__traceReturn = function(line, func, pairs, value) {
    if (__traceFrames.length < 2000) {
      var retRaw = __classify(value, 0, new WeakSet())
      var retEntry = { k: retRaw.k, r: retRaw.r }
      if (retRaw.items) retEntry.items = retRaw.items
      var frame = __buildFrame(pairs)
      var f = { event: 'return', func: func, line: line, locals: frame.loc, ret: retEntry }
      if (frame.heap) f.heap = frame.heap
      __traceFrames.push(f)
    } else {
      __traceTruncated = true
    }
    return value
  }

  window.addEventListener('load', function () {
    try {
      var fn = new Function(${escapedCode})
      fn()
    } catch (err) {
      post('error', err.message || String(err))
    } finally {
      window.parent.postMessage({ type: 'js_trace', frames: __traceFrames, truncated: __traceTruncated }, '*')
      // See buildIframeSrcdoc's matching comment: reports whether the body ended up empty so
      // App.jsx can fall back to the default summary card instead of a blank pane when there's
      // no trace AND no DOM output either.
      window.parent.postMessage({ type: 'done', line: '', bodyEmpty: !document.body.innerHTML.trim() }, '*')
    }
  })
})()
<\/script>
</head>
<body></body>
</html>`
}

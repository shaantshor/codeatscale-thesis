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
      post('done', '')
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

  // --- trace runtime, mirrors python.worker.js's _classify / _tracer in JS terms ---
  var __traceFrames = []
  var __traceTruncated = false

  function __classify(v) {
    try {
      if (v === null || v === undefined) return ['none', 'None', null]
      if (typeof v === 'boolean') return ['bool', String(v), null]
      if (typeof v === 'number') return [Number.isInteger(v) ? 'int' : 'float', String(v), null]
      if (typeof v === 'string') {
        var r = JSON.stringify(v)
        return ['str', r.length > 120 ? r.slice(0, 120) + '...' : r, null]
      }
      if (Array.isArray(v)) {
        var items = v.slice(0, 50).map(function (el) {
          var s
          try { s = JSON.stringify(el) } catch (e) { s = String(el) }
          if (s === undefined) s = String(el)
          return s.length > 60 ? s.slice(0, 60) + '...' : s
        })
        var r2 = '[' + items.join(', ') + (v.length > 50 ? ', ...' : '') + ']'
        return ['list', r2.length > 120 ? r2.slice(0, 120) + '...' : r2, items]
      }
      if (typeof v === 'function') return ['fn', 'function ' + (v.name || 'anonymous') + '()', null]
      if (typeof v === 'object') {
        var r3
        try { r3 = JSON.stringify(v) } catch (e) { r3 = String(v) }
        return ['dict', r3.length > 120 ? r3.slice(0, 120) + '...' : r3, null]
      }
      return ['obj', String(v), null]
    } catch (e) {
      return ['obj', '?', null]
    }
  }

  function __pairsToLocals(pairs) {
    var loc = {}
    for (var i = 0; i < pairs.length; i++) {
      var name = pairs[i][0], val = pairs[i][1]
      var c = __classify(val)
      var entry = { r: c[1], k: c[0] }
      if (c[2] !== null) entry.items = c[2]
      loc[name] = entry
    }
    return loc
  }

  window.__trace = function (line, event, func, pairs) {
    if (__traceFrames.length >= 2000) { __traceTruncated = true; return }
    __traceFrames.push({ event: event, func: func, line: line, locals: __pairsToLocals(pairs), ret: null })
  }

  window.__traceReturn = function (line, func, pairs, value) {
    if (__traceFrames.length < 2000) {
      var c = __classify(value)
      var retEntry = { r: c[1], k: c[0] }
      if (c[2] !== null) retEntry.items = c[2]
      __traceFrames.push({ event: 'return', func: func, line: line, locals: __pairsToLocals(pairs), ret: retEntry })
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
      post('done', '')
    }
  })
})()
<\/script>
</head>
<body></body>
</html>`
}

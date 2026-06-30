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

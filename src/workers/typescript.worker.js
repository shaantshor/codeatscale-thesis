// TypeScript compiler loaded from CDN at runtime — transpile only, no execution.
// Transpiled JavaScript is returned as `jsOutput`; App.jsx passes it to iframeRunner
// for execution in a sandboxed iframe. Keeps the ~3 MB tsc bundle out of the main
// Vite bundle and out of the JS worker chunk entirely.
//
// Loading strategy: fetch the TypeScript UMD bundle and initialise it with a fake
// module/exports context. importScripts() is not available in module-type workers
// (Vite uses { type: 'module' } for all workers). A simple dynamic import() of the
// CDN URL would leave `ts` undefined because UMD only sets self.ts as a fallback when
// neither CommonJS nor AMD is detected — and self.ts is unreliable. The fake-module
// pattern forces the UMD wrapper to assign TypeScript to module.exports.
//
// Worker protocol (App.jsx → Worker):
//   { id: string, code: string }
//
// Worker protocol (Worker → App.jsx):
//   { id, stdout: '', stderr: string, error: string|null, visual: null, jsOutput: string|null }
//
//   stderr    — TS diagnostic messages (parse errors; transpileModule does NOT perform
//               full type-checking, so type errors are not reported here — this is a
//               known limitation of the transpileModule API)
//   jsOutput  — transpiled JavaScript string; null only if the compiler failed to load
//               or threw unexpectedly; transpileModule always emits JS even with errors

const compilerReady = (async () => {
  const res = await fetch('https://cdn.jsdelivr.net/npm/typescript/lib/typescript.js')
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching TypeScript compiler`)
  const src = await res.text()

  // Inject into a fake CommonJS context so the UMD wrapper assigns module.exports
  const fakeModule = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', src)(fakeModule, fakeModule.exports)

  const ts = fakeModule.exports
  if (!ts || typeof ts.transpileModule !== 'function') {
    throw new Error('TypeScript UMD bundle did not export transpileModule')
  }
  return ts
})()

self.onmessage = async ({ data: { id, code } }) => {
  let ts
  try {
    ts = await compilerReady
  } catch (err) {
    self.postMessage({
      id,
      stdout: '',
      stderr: '',
      error: `TypeScript compiler failed to load: ${err.message}`,
      visual: null,
      jsOutput: null,
    })
    return
  }

  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        // ModuleKind.None: emit plain script (no require/import wrappers) so the
        // output can be embedded in an IIFE inside iframeRunner's srcdoc
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
        // strict: false — type errors are not the goal of transpileModule; we want
        // to strip types and emit runnable JS regardless of type correctness
        strict: false,
        noEmitOnError: false,
      },
      reportDiagnostics: true,
    })

    // transpileModule diagnostics are parse-level only (syntax errors, not type errors)
    const stderr = (result.diagnostics || [])
      .map(d => {
        const msg =
          typeof d.messageText === 'string'
            ? d.messageText
            : d.messageText.messageText
        return `TS${d.code}: ${msg}`
      })
      .join('\n')

    self.postMessage({
      id,
      stdout: '',
      stderr,
      error: null,
      visual: null,
      jsOutput: result.outputText,
    })
  } catch (err) {
    // Unexpected compiler throw — still send back the error as stderr so App.jsx
    // can display it; jsOutput is null so App.jsx will not attempt iframe execution
    self.postMessage({
      id,
      stdout: '',
      stderr: err.message,
      error: null,
      visual: null,
      jsOutput: null,
    })
  }
}

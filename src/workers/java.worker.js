// Session 6 note: java.worker.js now calls instrumentForTrace() (Path B regex instrumenter)
// before compiling. On success, the instrumented source includes the __CasTrace helper class,
// which writes /files/cas_trace.json after main() exits. After execution the worker reads that
// file via cjFileBlob and returns it as visual: { type:'trace', data, code }. On any
// instrumentation failure the worker falls back to a plain run with no trace (same as before).

// CheerpJ 4.3 — WASM-based OpenJDK running entirely in the browser.
//
// Architecture:
//   - CheerpJ loader is fetched from CDN and evaluated in the worker's global scope
//     (importScripts is unavailable in module workers; indirect eval sets cheerpjInit etc.
//     on self, exactly as the TypeScript worker does for the tsc UMD bundle).
//   - Source code is written to /str/Main.java via cheerpOSAddStringFile (JS → Java read).
//   - ECJ (Eclipse Compiler for Java) compiles the source to /files/cas_classes/.
//     ECJ is a ~2.5 MB pure-Java JAR; it is fetched once, written to /str/ecj.jar
//     (Uint8Array write), and reused for the lifetime of the worker.
//   - Compiled classes are run via cheerpjRunMain from /files/cas_classes/.
//   - stdout (System.out) is captured by overriding self.console.log before execution and
//     restoring it after — CheerpJ routes Java System.out to console.log; with
//     status:'none', CheerpJ's own messages go to console.debug, not console.log.
//   - stderr (System.err) is captured via self.console.error override.
//
// Prerequisites (both are dissertation findings about WASM toolchain maturity):
//   1. ECJ JAR — download ecj-<version>.jar from
//      https://download.eclipse.org/eclipse/downloads/ (section "Eclipse SDK" → find
//      standalone ECJ .jar) and place it at code/public/ecj.jar.
//      Any release >= 3.31 supports Java 17. Recommended: latest stable.
//   2. COOP / COEP headers — CheerpJ requires SharedArrayBuffer. The Vite dev server
//      is configured with these headers in vite.config.js. For GitHub Pages production
//      deployment, add a _headers file (Netlify) or GitHub Pages COOP plugin.
//      Without these headers cheerpjInit will throw; this worker returns a clear error.
//
// CheerpJ Community License: free for personal / educational / non-commercial use.
// No licence key required for evaluation. A watermark-free key can be requested at
// https://leaningtech.com/contact/ for dissertation public deployment.
// Confirmed: Community Licence covers personal and educational use.
// See https://cheerpj.com/docs/licensing.

import { instrumentForTrace } from '../utils/javaInstrumenter.js'

const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js'
const ECJ_MAIN = 'org.eclipse.jdt.internal.compiler.batch.Main'

// ECJ URL resolved via Vite's import.meta.env.BASE_URL so it works in both
// dev (base '/') and GitHub Pages production (base '/codeatscale-thesis/').
const ECJ_URL = import.meta.env.BASE_URL + 'ecj.jar'

// Singleton init — runs once per worker lifetime regardless of how many runs arrive.
let _ready = null

function ensureCheerpJ() {
  if (_ready) return _ready
  _ready = (async () => {
    if (!self.crossOriginIsolated) {
      throw new Error(
        'CheerpJ requires SharedArrayBuffer, which needs cross-origin isolation.\n' +
        'Dev server: add COOP/COEP headers in vite.config.js server.headers (already done).\n' +
        'GitHub Pages: add a _headers file with the COOP/COEP directives, or use a Netlify deploy.\n' +
        'See README Known limitations.'
      )
    }

    const ecjCheck = await fetch(ECJ_URL, { method: 'HEAD' })
    if (!ecjCheck.ok) {
      throw new Error(
        'Java worker requires a self-hosted ECJ JAR at ' + ECJ_URL + '.\n' +
        'Download ecj-<version>.jar from https://download.eclipse.org/eclipse/downloads/ ' +
        '(Eclipse SDK release page → find standalone ecj jar, any version >= 3.31 for Java 17).\n' +
        'Place the file at code/public/ecj.jar (~2.5 MB).\n' +
        'Dissertation finding: in-browser Java compilation requires self-hosting the compiler ' +
        'because no public CDN distributes a runnable ECJ JAR in a format CheerpJ can load directly.'
      )
    }

    const loaderSrc = await fetch(CHEERPJ_LOADER_URL).then(r => {
      if (!r.ok) throw new Error(`CheerpJ loader fetch failed: ${r.status} ${r.statusText}`)
      return r.text()
    });
    // Indirect eval: runs in global (self) scope so cheerpjInit/cheerpjRunMain/
    // cheerpOSAddStringFile etc. land on self as expected.
    ;(0, eval)(loaderSrc)

    // status:'none' suppresses all CheerpJ UI and routes its own messages to
    // console.debug (not console.log), keeping our console.log capture clean.
    // version:17 — Java 17. CheerpJ 4.3 supports Java 8, 11, and 17.
    await cheerpjInit({ status: 'none', version: 17 })

    // Fetch ECJ bytes once and write to /str/ecj.jar.
    // /str/ accepts Uint8Array binary data; Java can load JARs from /str/ via cheerpjRunMain.
    // This avoids the /app/ base-path mismatch issue on non-root deployments.
    const ecjBytes = new Uint8Array(await (await fetch(ECJ_URL)).arrayBuffer())
    cheerpOSAddStringFile('/str/ecj.jar', ecjBytes)
  })()
  return _ready
}

// Extract the public class name from Java source (used as cheerpjRunMain class arg).
// Falls back to 'Main' if not found — the starter code always uses public class Main.
function detectClassName(code) {
  const m = code.match(/\bpublic\s+class\s+(\w+)/)
  return m ? m[1] : 'Main'
}

self.onmessage = async ({ data: { id, code } }) => {
  try {
    await ensureCheerpJ()
  } catch (initErr) {
    self.postMessage({ id, stdout: '', stderr: '', error: initErr.message, visual: null })
    return
  }

  const className = detectClassName(code)

  // Attempt to instrument the source before compilation (Session 6, Path B).
  // On failure (no methods / parse error) falls back to the original code — the rest
  // of the worker runs identically either way.
  const instrResult = instrumentForTrace(code)
  const sourceToCompile = instrResult.ok ? instrResult.instrumented : code

  // Write source to /str/ (JS-writable; Java-readable).
  cheerpOSAddStringFile('/str/Main.java', sourceToCompile)

  // ── Phase 1: Compile ──────────────────────────────────────────────────────
  // ECJ writes compiler diagnostics to System.err → console.error.
  // ECJ writes nothing to System.out on a clean compile.
  const ecjOut = [], ecjErr = []
  const origLog1   = self.console.log
  const origError1 = self.console.error
  self.console.log   = (...a) => ecjOut.push(a.map(String).join(' '))
  self.console.error = (...a) => ecjErr.push(a.map(String).join(' '))

  let ecjExit
  try {
    // ECJ arguments mirror javac: -source 17 -target 17 -d <outputDir> <sourceFile>
    // /files/ is Java-writable (IndexedDB-backed); ECJ creates cas_classes/ if needed.
    ecjExit = await cheerpjRunMain(
      ECJ_MAIN, '/str/ecj.jar',
      '-source', '17', '-target', '17',
      '-d', '/files/cas_classes',
      '/str/Main.java'
    )
  } finally {
    self.console.log   = origLog1
    self.console.error = origError1
  }

  if (ecjExit !== 0) {
    const compileErr = ecjErr.join('\n') || ecjOut.join('\n') || `ECJ exited with code ${ecjExit}`
    self.postMessage({ id, stdout: '', stderr: compileErr, error: null, visual: null })
    return
  }

  // ── Phase 2: Run ──────────────────────────────────────────────────────────
  // CheerpJ routes System.out → console.log, System.err → console.error.
  // We capture both and restore after the run.
  const stdoutLines = [], stderrLines = []
  const origLog2   = self.console.log
  const origError2 = self.console.error
  self.console.log   = (...a) => stdoutLines.push(a.map(String).join(' '))
  self.console.error = (...a) => stderrLines.push(a.map(String).join(' '))

  let runErr = null
  try {
    await cheerpjRunMain(className, '/files/cas_classes')
  } catch (err) {
    runErr = err.message || String(err)
  } finally {
    self.console.log   = origLog2
    self.console.error = origError2
  }

  // ── Read trace file (Session 6) ───────────────────────────────────────────
  // __CasTrace.__flush() (injected by javaInstrumenter) writes /files/cas_trace.json
  // after main() exits. cjFileBlob reads it back as a Blob from CheerpJ's /files/ mount.
  let visual = null
  if (instrResult.ok && !runErr) {
    try {
      const blob = await cjFileBlob('/files/cas_trace.json')
      const traceText = await blob.text()
      const parsed = JSON.parse(traceText)
      if (Array.isArray(parsed.frames) && parsed.frames.length > 0) {
        visual = { type: 'trace', data: traceText, code }
      }
    } catch (_) {
      // Trace file absent or unreadable — fall back to no visual (not an error).
    }
  }

  self.postMessage({
    id,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    error: runErr,
    visual,
  })
}

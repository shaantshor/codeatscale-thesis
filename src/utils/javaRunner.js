// Java execution — runs directly on the MAIN THREAD, not in a Web Worker (unlike every
// other language in this project). This is a deliberate exception to the project's usual
// "everything in a Worker" pattern, made after a research session (2026-07-27, see prd.md's
// Risk Register) live-verified that CheerpJ crashes deterministically within ~1 second when
// its whole JVM is hosted inside a dedicated Worker (`Cannot read properties of null
// (reading 'n1')`, reproducible on any program, with or without our own instrumentation,
// with the crash unattributable to any literal string in CheerpJ's own loader.js/cj3.js
// source). The identical init+compile sequence run directly on the main thread — CheerpJ's
// own documented, primary usage pattern (`<script src="loader.js">`) — ran for over two
// minutes making real progress with no crash and a still-responsive page. Moving Java here
// trades away a non-blocking UI during compile/run for Java actually working at all — the
// same class of trade-off already accepted for Python's uncancelable infinite-loop case.
//
// Architecture:
//   - CheerpJ loader is loaded via a real <script src="..."> tag injected into the page,
//     CheerpJ's documented primary usage pattern — no eval, no importScripts, no synthetic
//     base-path workaround needed, since a real `document` exists here.
//   - Source code is written to /str/Main.java via cheerpOSAddStringFile (JS → Java read).
//   - Compilation uses com.sun.tools.javac.Main (the real javac, running as a Java program
//     inside CheerpJ's own JVM) rather than a self-hosted ECJ jar. This mirrors Leaning
//     Technologies' own official demo, JavaFiddle (github.com/leaningtech/javafiddle,
//     src/lib/CheerpJ.svelte): `cheerpjRunMain('com.sun.tools.javac.Main', classPath,
//     ...sourceFiles, '-d', '/files/', '-Xlint')`. ECJ was abandoned after two live-verified
//     dead ends: it always tries to resolve "system libraries" from the running JVM's
//     java.home, which under CheerpJ resolves to an internal virtual mount (/lt/17) that
//     ECJ's location-validator rejects — reproduced identically with --release 17, with
//     -source/-target, and with no level flag at all, so it wasn't a flag-choice problem, it
//     was that ECJ is a foreign compiler jar that has to probe for boot-classpath info CheerpJ
//     can't give it in a form ECJ trusts. javac, being the compiler that ships as part of the
//     exact JDK CheerpJ emulates, doesn't do that probing.
//   - A first attempt tried com.sun.tools.javac.Main under version:17 with no self-hosted
//     compiler jar at all, hoping CheerpJ's Java 17 image bundles jdk.compiler by default.
//     Live-verified failure: `ClassNotFoundException: com.sun.tools.javac.Main`. Dropped to
//     JavaFiddle's exact proven setup instead: CheerpJ's Java 8 mode (version:8) plus a
//     self-hosted real JDK 8 tools.jar on the classpath (JDK 9+ folded the compiler into the
//     module system, so there's no standalone tools.jar for later versions — this is why
//     JavaFiddle itself targets Java 8, not because CheerpJ can't do newer language levels).
//   - Compiled classes are written and run straight from /files/ (not a subdirectory) —
//     unlike ECJ, javac requires its -d output directory to already exist and won't create
//     it, and /files/ is guaranteed to exist as a CheerpJ mount.
//   - stdout/stderr (System.out/System.err) are captured by temporarily overriding
//     window.console.log/error around each phase, then restoring them — same pattern the
//     old worker used, just against the real page console instead of a worker's.
//
// Prerequisite: a real JDK 8 tools.jar self-hosted at code/public/tools.jar (~15-20MB
// depending on build — e.g. extract lib/tools.jar from any Eclipse Temurin 8 distribution,
// https://adoptium.net/temurin/releases/?version=8 — OpenJDK/Temurin builds are GPL-licensed
// and freely redistributable). This is a dissertation finding of the same shape as the
// earlier ecj.jar requirement: no public CDN distributes tools.jar in a form CheerpJ can load
// directly, so it must be sourced from a real JDK 8 install and hosted alongside the app.
// Targeting Java 8 language level means javaInstrumenter.js's return-value capture must avoid
// `var` (Java 10+) — it uses a generic passthrough helper instead, see that file.
//
// CheerpJ Community License: free for personal / educational / non-commercial use. See
// https://cheerpj.com/docs/licensing.

const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js'
const JAVAC_MAIN = 'com.sun.tools.javac.Main'
const TOOLS_JAR_URL = import.meta.env.BASE_URL + 'tools.jar'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(s)
  })
}

// Singleton init — runs once per page session regardless of how many runs arrive.
let _ready = null

function ensureCheerpJ() {
  if (_ready) return _ready
  _ready = (async () => {
    const toolsCheck = await fetch(TOOLS_JAR_URL, { method: 'HEAD' })
    if (!toolsCheck.ok) {
      throw new Error(
        'Java requires a self-hosted JDK 8 tools.jar at ' + TOOLS_JAR_URL + '.\n' +
        'Download a Java 8 build from https://adoptium.net/temurin/releases/?version=8 ' +
        '(Eclipse Temurin, GPL-licensed OpenJDK build), extract it, and copy lib/tools.jar.\n' +
        'Place the file at code/public/tools.jar.\n' +
        'Dissertation finding: in-browser Java compilation works via com.sun.tools.javac.Main ' +
        '(the real javac) running inside CheerpJ, but only in CheerpJ\'s Java 8 mode, since ' +
        'tools.jar is a JDK 8-era artifact — JDK 9+ folded the compiler into the module system ' +
        'and dropped a standalone tools.jar, and CheerpJ\'s Java 17 image does not bundle ' +
        'jdk.compiler by default (confirmed live: ClassNotFoundException).'
      )
    }

    // Real <script src="..."> load — CheerpJ's documented primary usage pattern. Sets
    // cheerpjInit/cheerpjRunMain/cheerpOSAddStringFile etc. on window.
    await loadScript(CHEERPJ_LOADER_URL)

    // status:'none' suppresses all CheerpJ UI and routes its own messages to console.debug
    // (not console.log), keeping our console.log capture clean. version:8 — required for
    // com.sun.tools.javac.Main + tools.jar, see top-of-file comment.
    await cheerpjInit({ status: 'none', version: 8 })

    // Fetch tools.jar bytes once and write to /str/tools.jar. /str/ accepts Uint8Array binary
    // data; Java can load jars from /str/ via cheerpjRunMain's classpath argument. This avoids
    // the /app/ base-path mismatch issue on non-root deployments (same reasoning as the old
    // ecj.jar handling).
    const toolsBytes = new Uint8Array(await (await fetch(TOOLS_JAR_URL)).arrayBuffer())
    cheerpOSAddStringFile('/str/tools.jar', toolsBytes)
  })()
  return _ready
}

// Extract the public class name from Java source (used as cheerpjRunMain class arg).
// Falls back to 'Main' if not found — the starter code always uses public class Main.
function detectClassName(code) {
  const m = code.match(/\bpublic\s+class\s+(\w+)/)
  return m ? m[1] : 'Main'
}

// code: the source to compile (already instrumented, if traced is true).
// origCode: the pre-instrumentation source (used for class-name detection and the visual
//   payload's `code` field, matching what the trace debugger expects).
// traced: whether `code` includes the __CasTrace helper injected by javaInstrumenter.js.
export async function runJava(code, origCode, traced) {
  try {
    await ensureCheerpJ()
  } catch (initErr) {
    return { stdout: '', stderr: '', error: initErr.message, visual: null }
  }

  const sourceForClassName = origCode ?? code
  const className = detectClassName(sourceForClassName)

  // Write source to /str/ (JS-writable; Java-readable).
  cheerpOSAddStringFile('/str/Main.java', code)

  // ── Phase 1: Compile ──────────────────────────────────────────────────────
  // javac writes compiler diagnostics to System.err → console.error.
  // javac writes nothing to System.out on a clean compile.
  const javacOut = [], javacErr = []
  const origLog1 = window.console.log
  const origError1 = window.console.error
  window.console.log = (...a) => javacOut.push(a.map(String).join(' '))
  window.console.error = (...a) => javacErr.push(a.map(String).join(' '))

  let javacExit
  try {
    // Matches JavaFiddle's own call shape: classpath is where cheerpjRunMain looks to find
    // com.sun.tools.javac.Main itself (tools.jar), not the classpath javac compiles against.
    // No --release/-source/-target flags — javac resolves its own bootclasspath since it's
    // running as part of the exact JDK CheerpJ emulates.
    // -d /files/ (not a subdirectory) — unlike ECJ, javac requires its -d output directory to
    // already exist and won't create it; /files/ is guaranteed to exist as a CheerpJ mount.
    javacExit = await cheerpjRunMain(
      JAVAC_MAIN, '/str/tools.jar:/files/',
      '/str/Main.java',
      '-d', '/files/'
    )
  } finally {
    window.console.log = origLog1
    window.console.error = origError1
  }

  if (javacExit !== 0) {
    const compileErr = javacErr.join('\n') || javacOut.join('\n') || `javac exited with code ${javacExit}`
    return { stdout: '', stderr: compileErr, error: null, visual: null }
  }

  // ── Phase 2: Run ──────────────────────────────────────────────────────────
  // CheerpJ routes System.out → console.log, System.err → console.error.
  // We capture both and restore after the run.
  const stdoutLines = [], stderrLines = []
  const origLog2 = window.console.log
  const origError2 = window.console.error
  window.console.log = (...a) => stdoutLines.push(a.map(String).join(' '))
  window.console.error = (...a) => stderrLines.push(a.map(String).join(' '))

  let runErr = null
  try {
    await cheerpjRunMain(className, '/files/')
  } catch (err) {
    runErr = err.message || String(err)
  } finally {
    window.console.log = origLog2
    window.console.error = origError2
  }

  // ── Read trace file (Session 6) ───────────────────────────────────────────
  // __CasTrace.__flush() (injected by javaInstrumenter) writes /files/cas_trace.json
  // after main() exits. cjFileBlob reads it back as a Blob from CheerpJ's /files/ mount.
  let visual = null
  if (traced && !runErr) {
    try {
      const blob = await cjFileBlob('/files/cas_trace.json')
      const traceText = await blob.text()
      const parsed = JSON.parse(traceText)
      if (Array.isArray(parsed.frames) && parsed.frames.length > 0) {
        visual = { type: 'trace', data: traceText, code: sourceForClassName }
      }
    } catch (_) {
      // Trace file absent or unreadable — fall back to no visual (not an error).
    }
  }

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    error: runErr,
    visual,
  }
}

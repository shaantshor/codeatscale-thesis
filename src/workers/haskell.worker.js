// Haskell execution worker — GHC WebAssembly backend (Layer A)
//
// Architecture: @bjorn3/browser_wasi_shim + a self-hosted GHC WASM runner binary.
//
// How it works:
//   1. Load @bjorn3/browser_wasi_shim from CDN (tiny ~30 KB WASI polyfill).
//   2. Fetch and compile /ghci-runner.wasm (the GHC WASM runner binary).
//   3. Instantiate the WASM module with a WASI environment that includes:
//      - virtual stdout/stderr (captured to strings)
//      - a virtual filesystem with the user's source at /src/Main.hs
//   4. Run the binary; it reads /src/Main.hs, compiles+runs via GHCi bytecode,
//      and writes output to stdout/stderr.
//
// BINARY REQUIREMENT (dissertation finding: Layer A needs self-hosted binary):
//   The GHC WASM runner is NOT on any public CDN. Build it once:
//
//   Option A — Nix (recommended, reproducible):
//     nix shell 'gitlab:haskell-wasm/ghc-wasm-meta?host=gitlab.haskell.org'
//     cd code/haskell-runner && wasm32-wasi-ghc -O2 runner.hs -o ../public/ghci-runner.wasm
//
//   Option B — bootstrap script (Linux/macOS):
//     curl https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta/-/raw/master/bootstrap.sh | sh
//     source ~/.ghc-wasm/env
//     cd code/haskell-runner && wasm32-wasi-ghc -O2 runner.hs -o ../public/ghci-runner.wasm
//
//   Expected binary size: 30–220 MB (depends on static-linking depth).
//   Cold-start time is dissertation data — record it in prd.md Section 8.
//
// Layer B (lazy reduction visualizer) lives in src/utils/haskellStepper.js.
// It is pure TypeScript, needs no WASM binary, and runs any time Layer A runs.
//
// References:
//   https://www.tweag.io/blog/2024-11-21-ghc-wasm-th-ghci/
//   https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta
//   https://vaibhavsagar.com/blog/2024/07/03/ghci-in-the-browser/

const WASI_SHIM_URL = 'https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.3.0/+esm'
const GHC_WASM_URL  = '/ghci-runner.wasm'
const RUN_TIMEOUT_MS = 30_000

let wasmModule  = null   // cached compiled WebAssembly.Module (expensive; reuse)
let coldStartMs = null   // first-load wall-clock time (dissertation data)
let initError   = null   // non-null if binary missing; persists for all subsequent runs
let WasiShim    = null   // cached shim module exports

const runtimeReady = (async () => {
  try {
    WasiShim = await import(WASI_SHIM_URL)
  } catch (err) {
    initError = `WASI shim failed to load: ${err.message}`
    return
  }

  const t0 = performance.now()
  try {
    const res = await fetch(GHC_WASM_URL)
    if (!res.ok) {
      initError =
        `GHC WASM binary not found at ${GHC_WASM_URL}. ` +
        `Build it from ghc-wasm-meta and place at code/public/ghci-runner.wasm. ` +
        `See haskell.worker.js comments for full setup. ` +
        `[Dissertation finding: Layer A requires self-hosting a large GHC WASM binary.]`
      return
    }
    wasmModule = await WebAssembly.compileStreaming(res)
  } catch (err) {
    initError = `GHC WASM binary compile failed: ${err.message}`
    return
  }

  coldStartMs = Math.round(performance.now() - t0)
  console.log(`[haskell.worker] GHC WASM cold-start: ${coldStartMs} ms`)
})()

self.onmessage = async ({ data: { id, code } }) => {
  await runtimeReady

  if (initError || !wasmModule || !WasiShim) {
    self.postMessage({
      id,
      stdout: '',
      stderr: initError ?? 'GHC WASM runtime not available.',
      error: null,
      visual: null,
      coldStartMs,
    })
    return
  }

  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = WasiShim
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const stdoutBufs = []
  const stderrBufs = []

  // Virtual filesystem: user code lives at /src/Main.hs.
  // The runner binary is invoked with argv = ['ghci-runner', '/src/Main.hs'].
  const srcDir = new Map([['Main.hs', new File(enc.encode(code))]])

  const fds = [
    new OpenFile(new File([])),                                // fd 0 — stdin (empty)
    new ConsoleStdout(buf => stdoutBufs.push(buf.slice())),   // fd 1 — stdout
    new ConsoleStdout(buf => stderrBufs.push(buf.slice())),   // fd 2 — stderr
    new PreopenDirectory('/src', srcDir),                      // fd 3 — /src preopened
    new PreopenDirectory('/tmp', new Map()),                    // fd 4 — /tmp scratch
  ]

  const wasi = new WASI(
    ['ghci-runner', '/src/Main.hs'],
    ['HOME=/tmp', 'TMPDIR=/tmp', 'TERM=dumb'],
    fds,
  )

  let exitCode = 0
  let timedOut = false

  const runPromise = (async () => {
    try {
      const instance = await WebAssembly.instantiate(wasmModule, {
        ...wasi.wasiImport ? { wasi_snapshot_preview1: wasi.wasiImport } : wasi.getImportObject(),
      })
      wasi.start(instance)
    } catch (err) {
      if (err?.name === 'WASIProcExit' || err?.constructor?.name === 'WASIProcExit') {
        exitCode = err.code ?? 0
      } else if (!timedOut) {
        stderrBufs.push(enc.encode(String(err)))
        exitCode = 1
      }
    }
  })()

  const timeoutHandle = setTimeout(() => {
    timedOut = true
    stderrBufs.push(enc.encode(
      `\n[Timeout] Run exceeded ${RUN_TIMEOUT_MS / 1000}s. ` +
      `Unlike Python/Pyodide, Haskell WASM instances can be hard-killed — ` +
      `terminate this worker from App.jsx if needed.`
    ))
  }, RUN_TIMEOUT_MS)

  await runPromise
  clearTimeout(timeoutHandle)

  const mergeChunks = bufs => {
    const total = bufs.reduce((n, b) => n + b.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const b of bufs) { out.set(b, offset); offset += b.byteLength }
    return dec.decode(out)
  }

  const stdout = mergeChunks(stdoutBufs)
  const stderr = mergeChunks(stderrBufs)

  self.postMessage({
    id,
    stdout,
    stderr,
    error: (exitCode !== 0 && !stdout && !stderr)
      ? `GHC runner exited with code ${exitCode}`
      : null,
    visual: null,   // Layer A: text output only — no step trace
    coldStartMs: coldStartMs ?? null,
  })
}

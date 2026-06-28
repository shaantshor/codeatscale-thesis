// Pyodide loaded from CDN — keeps the app bundle small.
// The WASM runtime (~10 MB compressed) is fetched once and browser-cached.
// setStdout/setStderr are wired once at init so no per-run teardown is needed.
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
    })
    return
  }

  stdoutLines = []
  stderrLines = []

  try {
    await pyodide.runPythonAsync(code)
    self.postMessage({
      id,
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
      error: null,
    })
  } catch (runErr) {
    self.postMessage({
      id,
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
      error: runErr.message,
    })
  }
}

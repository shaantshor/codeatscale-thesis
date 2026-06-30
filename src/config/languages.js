// Language registry — the single extension point for adding new languages.
// Each entry describes everything App.jsx needs to support a language:
//   id            — unique string key (used in state, worker Map, URL)
//   label         — display name in the language selector
//   emoji         — decorative icon shown alongside label
//   badge         — runtime label shown in the selector (e.g. "Pyodide", "Native")
//   executionMode — 'worker' | 'iframe' | 'worker+iframe'
//                   worker       : code runs in a Web Worker, returns { stdout, stderr, error, visual }
//                   iframe       : code runs in a sandboxed <iframe srcdoc>, stdout captured via postMessage
//                   worker+iframe: worker transpiles (e.g. TS→JS), output JS runs in iframe
//   cmLang        — async factory returning a CM6 language extension, or null for plain text
//   workerFactory — factory that returns a new Worker instance (only for worker / worker+iframe modes)
//   starterCode   — default code shown when the language is first selected

export const LANGUAGES = {
  python: {
    id: 'python',
    label: 'Python 3',
    emoji: '🐍',
    badge: 'Pyodide',
    executionMode: 'worker',
    cmLang: () => import('@codemirror/lang-python').then(m => m.python()),
    workerFactory: () => new Worker(
      new URL('../workers/python.worker.js', import.meta.url),
      { type: 'module' }
    ),
    starterCode: `# CodeAtScale — Python playground
# Code runs entirely in your browser via Pyodide (WebAssembly)

print("Hello from the browser!")
`,
  },

  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    emoji: '🟨',
    badge: 'Native',
    // iframe mode: code runs directly in a sandboxed <iframe srcdoc> with full DOM
    // access. No WASM runtime — cold-start is effectively zero. Stdout is captured
    // by intercepting console.log and posting messages to the parent via postMessage.
    executionMode: 'iframe',
    cmLang: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
    starterCode: `// JavaScript — runs natively in your browser (no WASM, zero cold-start)

console.log("Hello from JavaScript!")

// Full DOM access — render anything in the Visual tab:
document.body.style.margin = '24px'
document.body.style.fontFamily = 'system-ui, sans-serif'
document.body.innerHTML = \`
  <h2 style="color:#2d6a4f">Hello from the Visual tab!</h2>
  <p>JavaScript runs directly in a sandboxed iframe — no server, no WASM.</p>
\`
`,
  },

  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    emoji: '🔷',
    badge: 'tsc',
    // worker+iframe mode: a Web Worker loads the TypeScript compiler from CDN and
    // transpiles TS → JS (strip types, emit ES2020). The resulting JS then runs in a
    // sandboxed iframe via iframeRunner, identical to the JavaScript path.
    // Dissertation data point: compile-step overhead vs zero-overhead native JS.
    executionMode: 'worker+iframe',
    cmLang: () =>
      import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
    workerFactory: () => new Worker(
      new URL('../workers/typescript.worker.js', import.meta.url),
      { type: 'module' }
    ),
    starterCode: `// TypeScript — transpiled client-side by the TypeScript compiler (no server)

const greet = (name: string): string => \`Hello, \${name}!\`
console.log(greet("browser"))

const add = (a: number, b: number): number => a + b
console.log("2 + 3 =", add(2, 3))

// Types are stripped at runtime — the transpiled JS runs in a sandboxed iframe
interface Point { x: number; y: number }
const origin: Point = { x: 0, y: 0 }
console.log("Origin:", JSON.stringify(origin))
`,
  },
}

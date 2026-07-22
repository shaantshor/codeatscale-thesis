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
# Try dragging the num_times slider or editing the name in the Visual pane!

def repeat(num_times):
    def decorator_repeat(func):
        def wrapper(*args, **kwargs):
            result = None
            for _ in range(num_times):
                result = func(*args, **kwargs)
            return result
        return wrapper
    return decorator_repeat

@repeat(num_times=3)
def greet(name):
    print(f"Hello, {name}!")

greet("Alice")
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
    // Function-wrapped so the step-debugger trace (same DAP-style animation as Python) has
    // something to show — an AST instrumenter (src/utils/jsInstrumenter.js) statically injects
    // trace calls into code inside functions before it runs. Top-level code without a function
    // still runs natively with full DOM access, it just won't produce a step trace.
    starterCode: `// JavaScript — runs natively in your browser (no WASM, zero cold-start)
// Wrapped in a function so the Visual pane can step through it, just like Python.

function bubbleSort(arr) {
  const n = arr.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const temp = arr[j]
        arr[j] = arr[j + 1]
        arr[j + 1] = temp
      }
    }
  }
  return arr
}

console.log(bubbleSort([5, 2, 1, 4, 3]))
`,
  },

  haskell: {
    id: 'haskell',
    label: 'Haskell',
    emoji: 'λ',
    badge: 'GHC WASM',
    // Layer A: arbitrary GHC Haskell compiled to WASM32-WASI, runs in browser
    // via @bjorn3/browser_wasi_shim. Requires self-hosted binary (no public CDN).
    // Layer B (lazy-step visualizer) is handled in App.jsx via haskellStepper.js
    // and does not need a WASM binary.
    // Cold-start is dissertation data — first load downloads the binary.
    executionMode: 'worker',
    cmLang: () => Promise.resolve(null), // no CM6 Haskell package available
    workerFactory: () => new Worker(
      new URL('../workers/haskell.worker.js', import.meta.url),
      { type: 'module' }
    ),
    // Layer B (mini-interpreter) triggers automatically for pure expressions.
    // Switch to IO code (main = ...) to use Layer A / GHC WASM instead.
    starterCode: `-- Layer B: pure expression -- runs in the browser lazy stepper (no binary needed)
-- Supported: take, map, filter, foldr, foldl, zip, zipWith, iterate, repeat,
--            arithmetic ranges [n..] / [n..m], let/in, lambda (\\x -> e), if/then/else

take 10 (map (*2) [1..])
`,
  },

  java: {
    id: 'java',
    label: 'Java',
    emoji: '☕',
    badge: 'CheerpJ',
    // worker mode: CheerpJ 4.3 (WASM-based OpenJDK) compiles and runs Java source
    // entirely in the browser. Requires:
    //   - self-hosted ecj.jar at code/public/ecj.jar (Eclipse Compiler for Java)
    //   - COOP/COEP headers (for SharedArrayBuffer; configured in vite.config.js)
    // Dissertation data point: cold-start and compile time vs Python/JS baselines.
    executionMode: 'worker',
    cmLang: () => import('@codemirror/lang-java').then(m => m.java()),
    workerFactory: () => new Worker(
      new URL('../workers/java.worker.js', import.meta.url),
      { type: 'module' }
    ),
    starterCode: `// Java — compiled and run client-side via CheerpJ (WASM-based OpenJDK)
// Requires ecj.jar at code/public/ecj.jar — see README Known limitations.

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");

        // Simple linked list to demonstrate OOP (object graph in Session 7)
        Node head = new Node(1, new Node(2, new Node(3, null)));
        Node curr = head;
        while (curr != null) {
            System.out.print(curr.val + " ");
            curr = curr.next;
        }
        System.out.println();
    }
}

class Node {
    int val;
    Node next;
    Node(int val, Node next) { this.val = val; this.next = next; }
}
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
    // The trace debugger instruments the TRANSPILED JS (Acorn doesn't understand TS syntax),
    // so it's function-wrapped like the JS starter to give it something to step through.
    starterCode: `// TypeScript — transpiled client-side by the TypeScript compiler (no server)
// Wrapped in a function so the Visual pane can step through it after types are stripped.

function bubbleSort(arr: number[]): number[] {
  const n: number = arr.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const temp: number = arr[j]
        arr[j] = arr[j + 1]
        arr[j + 1] = temp
      }
    }
  }
  return arr
}

console.log(bubbleSort([5, 2, 1, 4, 3]))
`,
  },
}

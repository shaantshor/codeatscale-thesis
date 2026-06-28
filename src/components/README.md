# src/components

Reusable React components for CodeAtScale.

## CodeEditor

**File:** `CodeEditor.jsx` + `CodeEditor.css`

A controlled CodeMirror 6 editor component.

### Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `value` | `string` | Yes | — | Current code content |
| `onChange` | `(code: string) => void` | Yes | — | Called on every keystroke with the full new code string |
| `readOnly` | `boolean` | No | `false` | Locks the editor (for example code or completed exercises) |

### Why CM6 (not Monaco)

Monaco bundles the entire VS Code language service and ships ~4 MB of JS. CodeMirror 6 is tree-shakeable — the cherry-picked packages used here are a fraction of that size, which matters for a client-side-only app where every byte the user downloads competes with the Pyodide WASM payload (~10 MB compressed).

### CM6 packages used

- `@codemirror/state` — `EditorState` (core, required by all other packages)
- `@codemirror/view` — `EditorView`, `keymap`, `lineNumbers`
- `@codemirror/commands` — `history`, `defaultKeymap`, `historyKeymap` (undo/redo, indent)
- `@codemirror/language` — language support infrastructure
- `@codemirror/lang-python` — Python syntax highlighting (aligned with Pyodide)
- `@codemirror/theme-one-dark` — dark theme, matches project's dark-mode default

### Connection to the rest of the app

`App.jsx` owns the `code` state string. When Pyodide is wired in, App will pass `code` to `pyodide.runPythonAsync(code)`. The `CodeEditor` component is unaware of execution — it only manages the editing surface.

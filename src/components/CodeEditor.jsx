import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { LANGUAGES } from '../config/languages'
import './CodeEditor.css'

// Two Compartments:
//   editableCompartment  — toggles EditorView.editable (readOnly prop)
//   languageCompartment  — swaps the CM6 language extension when language prop changes
// Both are module-level because they must be stable references across renders.
const editableCompartment = new Compartment()
const languageCompartment = new Compartment()

export default function CodeEditor({ value, onChange, readOnly = false, language = 'python' }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)

  // Create the editor once on mount. Language extension starts as [] (plain text)
  // and is swapped asynchronously by the language-swap effect below.
  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          oneDark,
          editableCompartment.of(EditorView.editable.of(!readOnly)),
          languageCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view
    return () => view.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes (e.g. language switch loads new starter code)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  // Sync readOnly changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    })
  }, [readOnly])

  // Swap language extension when the language prop changes.
  // Calls the cmLang factory from the registry; if it returns null (e.g. R, Haskell)
  // the Compartment is reconfigured with [] — plain text mode, no error thrown.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const entry = LANGUAGES[language]
    if (!entry || !entry.cmLang) {
      view.dispatch({ effects: languageCompartment.reconfigure([]) })
      return
    }
    entry.cmLang().then(ext => {
      if (!viewRef.current) return // editor may have unmounted during async load
      viewRef.current.dispatch({
        effects: languageCompartment.reconfigure(ext ? [ext] : []),
      })
    }).catch(() => {
      if (!viewRef.current) return
      viewRef.current.dispatch({ effects: languageCompartment.reconfigure([]) })
    })
  }, [language])

  return <div ref={containerRef} className="cm-editor-wrap" />
}

import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, Decoration } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { LANGUAGES } from '../config/languages'
import './CodeEditor.css'

const editableCompartment = new Compartment()
const languageCompartment = new Compartment()
const highlightCompartment = new Compartment()
const themeCompartment = new Compartment()

// Builds the line-highlight decoration extension for a given 1-based line number. Returns
// [] (no decoration) when lineNum is null/out of range — used to clear the highlight, e.g.
// when the trace visualizer isn't active.
function buildHighlightExtension(lineNum, doc) {
  if (!lineNum || lineNum < 1 || lineNum > doc.lines) return []
  const line = doc.line(lineNum)
  return EditorView.decorations.of(
    Decoration.set([Decoration.line({ class: 'cm-traceActiveLine' }).range(line.from)])
  )
}

export default function CodeEditor({ value, onChange, readOnly = false, language = 'python', highlightLine = null, darkMode = false }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)

  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          themeCompartment.of(darkMode ? oneDark : []),
          editableCompartment.of(EditorView.editable.of(!readOnly)),
          languageCompartment.of([]),
          highlightCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
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

  // Sync the trace visualizer's active line: reconfigure the highlight decoration and, when
  // a line is set, scroll it into view so the user always sees what's currently executing
  // without needing to manually scroll the real editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const ext = buildHighlightExtension(highlightLine, view.state.doc)
    const effects = [highlightCompartment.reconfigure(ext)]
    if (highlightLine && highlightLine >= 1 && highlightLine <= view.state.doc.lines) {
      const pos = view.state.doc.line(highlightLine).from
      effects.push(EditorView.scrollIntoView(pos, { y: 'center' }))
    }
    view.dispatch({ effects })
  }, [highlightLine, value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    })
  }, [readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(darkMode ? oneDark : []),
    })
  }, [darkMode])

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
    let cancelled = false // guards against a slow load landing after another language switch
    entry.cmLang().then(ext => {
      if (cancelled || !viewRef.current) return
      viewRef.current.dispatch({
        effects: languageCompartment.reconfigure(ext ? [ext] : []),
      })
    }).catch(() => {
      if (cancelled || !viewRef.current) return
      viewRef.current.dispatch({ effects: languageCompartment.reconfigure([]) })
    })
    return () => { cancelled = true }
  }, [language])

  return <div ref={containerRef} className="cm-editor-wrap" />
}

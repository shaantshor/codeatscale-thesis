import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import './CodeEditor.css'

const editableCompartment = new Compartment()

export default function CodeEditor({ value, onChange, readOnly = false }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          python(),
          oneDark,
          editableCompartment.of(EditorView.editable.of(!readOnly)),
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

  // Sync external value changes (e.g. loading a new snippet from outside)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  // Sync readOnly changes via Compartment reconfiguration
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    })
  }, [readOnly])

  return <div ref={containerRef} className="cm-editor-wrap" />
}

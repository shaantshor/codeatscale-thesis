// jsInstrumenter.js — source-to-source instrumenter that injects trace calls into JS so the
// SAME step-debugger UI used for Python (traceVisualizer.js / buildTraceSrcdoc) can render a
// JavaScript or TypeScript (post-transpile) run. Produces the identical frame shape Python's
// python.worker.js tracer produces: { event, func, line, locals: {name:{r,k,items?}}, ret }.
//
// Design choices, mirrored from the Python tracer's own documented limitations:
//   - Only functions are traced (matches Python: "wrap code in a function to see the step
//     animation" — top-level script statements outside any function are not instrumented).
//   - Insertion is purely textual: we never regenerate code from the AST, only splice trace
//     calls in at exact character offsets taken from Acorn's node.start/end. This means real
//     JS lexical scoping handles all the hard cases (shadowing, closures) correctly at runtime
//     — our own "which names are in scope" bookkeeping only decides what to list, never
//     fabricates a value.
//   - Scope is tracked as a proper chain of block frames, not one flat set: let/const declared
//     inside an if/for/while/block are pushed onto a frame scoped to that block and popped when
//     the block ends, matching real JS block scoping; var always lands on the function-level
//     (bottom) frame, matching real hoisting. An earlier version used one flat per-function set,
//     which produced trace calls referencing loop variables (let i, let j) after their block had
//     closed - a real ReferenceError at runtime, caught only by actually executing the
//     instrumented output rather than reasoning about it statically.
//   - Loop headers (for/while/do-while/for-of/for-in) get their trace call placed at the START
//     OF THE BODY rather than before the loop statement itself. Python's sys.settrace fires a
//     'line' event for a for-loop's condition line on EVERY iteration (CPython jumps back to
//     that bytecode each pass); a naive textual trace call placed before the JS `for (...)` text
//     only fires ONCE, since loop iteration is native JS engine behavior invisible to static
//     instrumentation. Moving the trace call inside the body reproduces the same "once per
//     iteration" granularity by riding on the body's natural re-execution. Caught by actually
//     running a real trace end-to-end and diffing narration output against the Python version of
//     the same algorithm, not by reasoning about the AST alone — the two produced different
//     comparison counts for an identical bubble sort until this was fixed.
//   - Statement kinds we don't specifically understand (try/catch, switch, classes, destructuring
//     declarators) are left un-recursed: they still get a single trace call before them, but
//     nothing inside is traced at line granularity. Documented limitation, not a hard failure.
//   - A parse failure, or a source with no traceable function, returns { ok: false } so the
//     caller can fall back to plain iframe execution unchanged.

import { parse } from 'acorn'

const MAX_FUNCS = 40 // safety cap so a pathological file can't blow up instrumentation time
const LOOP_TYPES = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement'])

export function instrumentForTrace(code) {
  let ast
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  } catch (err) {
    return { ok: false, reason: 'parse error: ' + err.message }
  }

  const insertions = []
  let funcCount = 0

  function paramNames(params) {
    const names = []
    for (const p of params) {
      if (p.type === 'Identifier') names.push(p.name)
      else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') names.push(p.left.name)
      // destructuring / rest params are skipped (not added to scope); the function is still
      // traced, just without that parameter listed
    }
    return names
  }

  // Merges every frame in the scope chain (outer to inner) into one ordered name list.
  function currentNames(scopeChain) {
    const seen = new Set()
    for (const frame of scopeChain) for (const n of frame) seen.add(n)
    return Array.from(seen)
  }

  function pairsLiteral(scopeChain) {
    const names = currentNames(scopeChain)
    return '[' + names.map(n => '[' + JSON.stringify(n) + ',' + n + ']').join(',') + ']'
  }

  function traceCall(line, kind, funcName, scopeChain) {
    return `__trace(${line},${JSON.stringify(kind)},${JSON.stringify(funcName)},${pairsLiteral(scopeChain)});`
  }

  // var lands on the function-level (bottom) frame; let/const land on the innermost (top)
  // frame, so they fall out of currentNames() once that block's frame is popped.
  function declareFromVariableDeclaration(stmt, scopeChain) {
    const target = stmt.kind === 'var' ? scopeChain[0] : scopeChain[scopeChain.length - 1]
    for (const d of stmt.declarations) {
      if (d.id.type === 'Identifier') target.add(d.id.name)
    }
  }

  function walkBlockBody(stmts, scopeChain, funcName) {
    scopeChain.push(new Set())
    walkStatements(stmts, scopeChain, funcName)
    scopeChain.pop()
  }

  // Inserts the loop's own trace call at the start of its body instead of before the loop
  // statement, so it fires once per iteration (see module doc comment above).
  function insertLoopBodyTrace(loopStmt, scopeChain, funcName) {
    const body = loopStmt.body
    const pos = body.type === 'BlockStatement' ? body.start + 1 : body.start
    insertions.push({ pos, text: traceCall(loopStmt.loc.start.line, 'line', funcName, scopeChain) })
  }

  function walkStatements(stmts, scopeChain, funcName) {
    for (const stmt of stmts) {
      if (stmt.type === 'EmptyStatement') continue

      if (stmt.type === 'ReturnStatement') {
        insertions.push({ pos: stmt.start, text: traceCall(stmt.loc.start.line, 'line', funcName, scopeChain) })
        if (stmt.argument) {
          insertions.push({
            pos: stmt.argument.start,
            text: `__traceReturn(${stmt.loc.start.line},${JSON.stringify(funcName)},${pairsLiteral(scopeChain)},(`,
          })
          insertions.push({ pos: stmt.argument.end, text: `))` })
        }
        continue
      }

      if (!LOOP_TYPES.has(stmt.type)) {
        insertions.push({ pos: stmt.start, text: traceCall(stmt.loc.start.line, 'line', funcName, scopeChain) })
      }

      if (stmt.type === 'VariableDeclaration') {
        declareFromVariableDeclaration(stmt, scopeChain)
      } else if (stmt.type === 'IfStatement') {
        if (stmt.consequent.type === 'BlockStatement') walkBlockBody(stmt.consequent.body, scopeChain, funcName)
        else walkBlockBody([stmt.consequent], scopeChain, funcName)
        if (stmt.alternate) {
          if (stmt.alternate.type === 'BlockStatement') walkBlockBody(stmt.alternate.body, scopeChain, funcName)
          else walkBlockBody([stmt.alternate], scopeChain, funcName)
        }
      } else if (stmt.type === 'ForStatement') {
        scopeChain.push(new Set())
        if (stmt.init && stmt.init.type === 'VariableDeclaration') declareFromVariableDeclaration(stmt.init, scopeChain)
        insertLoopBodyTrace(stmt, scopeChain, funcName)
        if (stmt.body.type === 'BlockStatement') walkStatements(stmt.body.body, scopeChain, funcName)
        else walkStatements([stmt.body], scopeChain, funcName)
        scopeChain.pop()
      } else if (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement') {
        scopeChain.push(new Set())
        insertLoopBodyTrace(stmt, scopeChain, funcName)
        if (stmt.body.type === 'BlockStatement') walkStatements(stmt.body.body, scopeChain, funcName)
        else walkStatements([stmt.body], scopeChain, funcName)
        scopeChain.pop()
      } else if (stmt.type === 'ForOfStatement' || stmt.type === 'ForInStatement') {
        scopeChain.push(new Set())
        if (stmt.left.type === 'VariableDeclaration') declareFromVariableDeclaration(stmt.left, scopeChain)
        insertLoopBodyTrace(stmt, scopeChain, funcName)
        if (stmt.body.type === 'BlockStatement') walkStatements(stmt.body.body, scopeChain, funcName)
        else walkStatements([stmt.body], scopeChain, funcName)
        scopeChain.pop()
      } else if (stmt.type === 'BlockStatement') {
        walkBlockBody(stmt.body, scopeChain, funcName)
      } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
        instrumentFunction(stmt, stmt.id.name)
      }
      // TryStatement / SwitchStatement / ClassDeclaration / etc: left as an opaque traced
      // statement — no recursion inside, documented limitation.
    }
  }

  function instrumentFunction(funcNode, name) {
    if (funcCount >= MAX_FUNCS) return
    funcCount++
    const scopeChain = [new Set(paramNames(funcNode.params))]
    const bodyLine = funcNode.id ? funcNode.id.loc.start.line : funcNode.loc.start.line
    insertions.push({ pos: funcNode.body.start + 1, text: traceCall(bodyLine, 'call', name, scopeChain) })
    if (funcNode.body.type === 'BlockStatement') walkStatements(funcNode.body.body, scopeChain, name)
  }

  // Discover top-level traceable functions: function declarations, and `const f = function(){}`
  // / `const f = (...) => {}` with a block body. Nested/recursive helper functions are picked
  // up by instrumentFunction's own recursion (the FunctionDeclaration branch in walkStatements).
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id) {
      instrumentFunction(node, node.id.name)
    } else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (
          d.id.type === 'Identifier' &&
          d.init &&
          (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression') &&
          d.init.body.type === 'BlockStatement'
        ) {
          instrumentFunction(d.init, d.id.name)
        }
      }
    }
  }

  if (funcCount === 0) {
    return { ok: false, reason: 'no function definitions found' }
  }

  insertions.sort((a, b) => b.pos - a.pos)
  let out = code
  for (const ins of insertions) {
    out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos)
  }

  return { ok: true, instrumented: out }
}

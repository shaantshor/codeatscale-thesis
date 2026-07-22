// src/utils/haskellStepper.js
// Session 8 — Layer B: mini-Haskell lazy evaluator with step recording.
//
// Purpose: demonstrate lazy/call-by-need evaluation interactively when the user writes a
// pure mini-Haskell expression or a set of simple function definitions. The step trace
// is rendered by buildHaskellSrcdoc (in traceVisualizer.js) as a reduction-step view.
//
// Supported subset (deliberately narrow; document anything that falls outside):
//   Expressions : numeric/boolean literals, variables, function application (left-assoc),
//                 lambda (\x -> e), let/in, if/then/else, binary ops (+,-,*,/,div,mod,==,
//                 /=,<,>,<=,>=,&&,||,++), unary negation (-x), infix sections ((+1) / (*2)),
//                 list literals [1,2,3], arithmetic ranges [n..], [n..m], [n,m..] [n,m..p]
//   Definitions : name = expr  OR  name x y = expr  (one per line, no guards, no where)
//   Built-ins   : take, drop, head, tail, length, null, reverse,
//                 map, filter, foldr, foldl, scanl,
//                 zip, zipWith, iterate, repeat, cycle,
//                 sum, product, maximum, minimum,
//                 even, odd, abs, negate, signum,
//                 show, concat, concatMap, id, const, flip, (.)
//
// Not supported (Layer B gracefully returns canHandle:false):
//   IO, do-notation, type annotations, type classes, data declarations, where-clauses (top-level),
//   pattern matching in function definitions, string interpolation, modules.
//
// Step format: { step:number, redex:string, result:string, annotation:string }
// The "redex" is the sub-expression being reduced; "result" is what it reduced to.
// "annotation" gives the rule: "take n (x:xs) = x : take (n-1) xs", etc.
//
// canHandle(src): returns true if src parses in the mini-grammar with no IO / do / main with IO.
// step(src, max=200): evaluates src and returns { steps, resultStr, truncated }.

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(src) {
  const toks = []
  let i = 0
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue }
    // Line comment
    if (src[i] === '-' && src[i + 1] === '-') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    // Block comment
    if (src[i] === '{' && src[i + 1] === '-') {
      i += 2
      while (i < src.length - 1 && !(src[i] === '-' && src[i + 1] === '}')) i++
      i += 2
      continue
    }
    // Number
    if (/\d/.test(src[i])) {
      let j = i
      while (j < src.length && /\d/.test(src[j])) j++
      if (src[j] === '.' && /\d/.test(src[j + 1])) {
        j++; while (j < src.length && /\d/.test(src[j])) j++
      }
      toks.push({ t: 'NUM', v: Number(src.slice(i, j)), raw: src.slice(i, j) })
      i = j; continue
    }
    // Identifier / keyword / constructor
    if (/[a-zA-Z_]/.test(src[i])) {
      let j = i
      while (j < src.length && /[\w']/.test(src[j])) j++
      const w = src.slice(i, j)
      const kws = { let: 1, in: 1, if: 1, then: 1, else: 1, where: 1, do: 1, of: 1, case: 1 }
      const t = kws[w] ? w.toUpperCase() : /^[A-Z]/.test(w) ? 'CON' : 'ID'
      toks.push({ t, v: w })
      i = j; continue
    }
    // String
    if (src[i] === '"') {
      let j = i + 1, s = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') { j++; s += ({n:'\n',t:'\t',r:'\r','"':'"','\\':'\\'}[src[j]] || src[j]) }
        else s += src[j]
        j++
      }
      toks.push({ t: 'STR', v: s })
      i = j + 1; continue
    }
    // Char literal
    if (src[i] === "'") {
      let j = i + 1, c = src[j]
      if (src[j] === '\\') { j++; c = src[j] }
      toks.push({ t: 'NUM', v: c.charCodeAt(0) }) // treat Char as Int for simplicity
      i = j + 2; continue
    }
    // Two-char operators (order matters: .. before .)
    const twos = ['..', '->', '==', '/=', '<=', '>=', '&&', '||', '++', '::', '<-', '**']
    let hit = false
    for (const op of twos) {
      if (src[i] === op[0] && src[i + 1] === op[1]) {
        toks.push({ t: op === '..' ? 'DOTDOT' : op === '->' ? 'ARROW' :
          op === '::' ? 'DCOLON' : op === '<-' ? 'LARR' : 'OP', v: op })
        i += 2; hit = true; break
      }
    }
    if (hit) continue
    // Single-char
    const ch = src[i]
    const single = { '(': 'LP', ')': 'RP', '[': 'LB', ']': 'RB', ',': 'CM',
      '\\': 'LAM', '_': 'WILD', '|': 'PIPE', ';': 'SEMI', '@': 'AT',
      '=': 'EQ', ':': 'COLON', '.': 'DOT' }
    if (single[ch]) { toks.push({ t: single[ch], v: ch }); i++; continue }
    if ('+-*/!<>%^&'.includes(ch)) { toks.push({ t: 'OP', v: ch }); i++; continue }
    i++
  }
  toks.push({ t: 'EOF', v: '' })
  return toks
}

// ─── Parser ───────────────────────────────────────────────────────────────────
// Returns top-level parsed form: { defs: [{name, params, body}], expr: AST|null }
// All nodes have a .T field for type discriminator.

function parse(src) {
  const toks = tokenize(src)
  let pos = 0
  const peek = () => toks[pos]
  const eat = () => toks[pos++]
  const expect = (t) => {
    if (peek().t !== t) throw new Error(`Expected ${t} got ${peek().t} (${peek().v})`)
    return eat()
  }
  const check = (...ts) => ts.includes(peek().t)

  // Skip type annotations (::) anywhere on a top-level line
  function skipTypeSig() {
    // eat until newline-equivalent (SEMI or we see a known start token)
    while (!check('EOF', 'ID', 'CON', 'LET', 'IF', 'LAM')) eat()
  }

  function parseAtom() {
    const tok = peek()
    // Number
    if (tok.t === 'NUM') { eat(); return { T: 'N', v: tok.v } }
    // String
    if (tok.t === 'STR') { eat(); return { T: 'S', v: tok.v } }
    // True / False / constructors
    if (tok.t === 'CON') {
      eat()
      if (tok.v === 'True') return { T: 'B', v: true }
      if (tok.v === 'False') return { T: 'B', v: false }
      if (tok.v === 'Nothing') return { T: 'V', n: 'nothing' }
      return { T: 'V', n: tok.v }
    }
    // Identifier
    if (tok.t === 'ID') { eat(); return { T: 'V', n: tok.v } }
    // Wildcard
    if (tok.t === 'WILD') { eat(); return { T: 'V', n: '_' } }
    // Lambda
    if (tok.t === 'LAM') {
      eat()
      const params = []
      while (!check('ARROW', 'EOF')) {
        if (check('ID', 'WILD')) params.push(eat().v)
        else break
      }
      expect('ARROW')
      const body = parseExpr()
      return params.reduceRight((b, p) => ({ T: 'L', p, b }), body)
    }
    // Let
    if (tok.t === 'LET') {
      eat()
      const ds = []
      while (!check('IN', 'EOF')) {
        if (check('SEMI')) { eat(); continue }
        const name = expect('ID').v
        const params = []
        while (check('ID', 'WILD', 'LP', 'NUM')) {
          if (check('ID', 'WILD')) params.push(eat().v)
          else break
        }
        expect('EQ')
        const e = parseExpr()
        let rhs = e
        if (params.length) rhs = params.reduceRight((b, p) => ({ T: 'L', p, b }), e)
        ds.push({ n: name, e: rhs })
        if (check('SEMI')) eat()
      }
      expect('IN')
      const body = parseExpr()
      return { T: 'Lt', ds, b: body }
    }
    // if/then/else
    if (tok.t === 'IF') {
      eat()
      const cond = parseExpr()
      expect('THEN')
      const yes = parseExpr()
      expect('ELSE')
      const no = parseExpr()
      return { T: 'If', c: cond, y: yes, n: no }
    }
    // Parenthesised expression or tuple or operator section
    if (tok.t === 'LP') {
      eat()
      if (check('RP')) { eat(); return { T: 'Nil' } } // ()
      // Operator section: (op) or (op expr) or (expr op)
      if (check('OP', 'COLON')) {
        const op = eat().v
        if (check('RP')) { eat(); return { T: 'V', n: '(' + op + ')' } } // (op) as func ref
        // (-n) where n is a number literal = negative literal, not a section
        if (op === '-' && check('NUM')) {
          const n = eat().v
          expect('RP')
          return { T: 'N', v: -n }
        }
        const r = parseExpr()
        expect('RP')
        return { T: 'Sec', op, l: null, r }  // (op r) — left section: (\x -> x op r)
      }
      const e = parseExpr()
      if (check('CM')) {
        // Tuple
        const elems = [e]
        while (check('CM')) { eat(); elems.push(parseExpr()) }
        expect('RP')
        return { T: 'Tu', es: elems }
      }
      if (check('OP', 'COLON')) {
        // Right section: (e op) — (\x -> e op x)
        const op = eat().v
        expect('RP')
        return { T: 'Sec', op, l: e, r: null }
      }
      expect('RP')
      return e
    }
    // List literal or range [n..] [n..m] [n,m..] [n,m..p] [a,b,c]
    if (tok.t === 'LB') {
      eat()
      if (check('RB')) { eat(); return { T: 'Nil' } } // []
      const first = parseExpr()
      if (check('DOTDOT')) {
        // [n..] or [n..m]
        eat()
        if (check('RB')) { eat(); return { T: 'Rng', from: first, to: null, step: null } }
        const to = parseExpr()
        expect('RB')
        return { T: 'Rng', from: first, to, step: null }
      }
      if (check('CM')) {
        eat()
        const second = parseExpr()
        if (check('DOTDOT')) {
          // [n,m..] or [n,m..p]
          eat()
          if (check('RB')) { eat(); return { T: 'Rng', from: first, to: null, step: second } }
          const to = parseExpr()
          expect('RB')
          return { T: 'Rng', from: first, to, step: second }
        }
        // Ordinary list
        const items = [first, second]
        while (check('CM')) { eat(); items.push(parseExpr()) }
        expect('RB')
        return items.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
      }
      // Single-element list
      expect('RB')
      return { T: 'C', h: first, t: { T: 'Nil' } }
    }
    // Negative number (special case: - is an operator but -1 is a literal)
    if (tok.t === 'OP' && tok.v === '-' && toks[pos + 1]?.t === 'NUM') {
      eat()
      const n = eat()
      return { T: 'N', v: -n.v }
    }
    throw new Error(`Unexpected token: ${tok.t} (${tok.v})`)
  }

  // Function application (left-associative, highest precedence after atoms)
  function parseApp() {
    let f = parseAtom()
    const appStarters = ['NUM', 'STR', 'ID', 'CON', 'LP', 'LB', 'LAM', 'LET', 'IF', 'WILD']
    while (appStarters.includes(peek().t)) {
      const x = parseAtom()
      f = { T: 'A', f, x }
    }
    return f
  }

  // Infix cons (:) — right-associative, just above arithmetic
  function parseCons() {
    const l = parseOps()
    if (check('COLON')) { eat(); return { T: 'C', h: l, t: parseCons() } }
    return l
  }

  // Arithmetic and comparison operators with simplified precedence
  // (we don't implement full Haskell precedence — good enough for teaching demos)
  function parseOps() {
    return parseBinary(parseUnary, [
      ['||'], ['&&'],
      ['==', '/='],
      ['<', '>', '<=', '>='],
      ['++'],
      ['+', '-'],
      ['*', '/', 'div', 'mod', '**'],
      ['^'],
    ], 0)
  }

  function parseBinary(sub, levels, level) {
    if (level >= levels.length) return sub()
    let l = parseBinary(sub, levels, level + 1)
    while (check('OP', 'ID') && levels[level].includes(peek().v)) {
      if (toks[pos + 1] && toks[pos + 1].t === 'RP') break
      const op = eat().v
      const r = parseBinary(sub, levels, level + 1)
      l = { T: 'O', op, l, r }
    }
    return l
  }

  function parseUnary() {
    if (peek().t === 'OP' && peek().v === '-') {
      eat()
      return { T: 'O', op: 'negate', l: null, r: parseApp() }
    }
    return parseApp()
  }

  function parseExpr() { return parseCons() }

  // Top-level: one or more definitions or a bare expression
  function parseTop() {
    const defs = []
    let expr = null
    while (!check('EOF')) {
      if (check('SEMI')) { eat(); continue }
      // Type annotation line: id :: ... — skip entire line
      if (check('ID') && toks[pos + 1]?.t === 'DCOLON') {
        while (!check('EOF', 'SEMI') && !(check('ID') && toks[pos + 1]?.v !== ':')) {
          if (check('ID') || check('CON')) {
            // peek ahead: if next meaningful token is DCOLON, skip to next newline-ish
            if (toks[pos + 1]?.t === 'DCOLON') {
              while (!check('EOF') && toks[pos - 1]?.v !== '\n' &&
                     !(check('ID') && toks[pos + 1]?.t === 'EQ') &&
                     !check('LET')) { eat() }
              break
            }
          }
          eat()
        }
        continue
      }
      // Definition: name [params] = expr
      if (check('ID') && (toks[pos + 1]?.t === 'EQ' || toks[pos + 1]?.t === 'ID' || toks[pos + 1]?.t === 'WILD')) {
        // Lookahead: is there an = at the top level (before any '(')?
        let j = pos, depth = 0, hasEq = false
        while (j < toks.length && toks[j].t !== 'EOF') {
          if (toks[j].t === 'LP' || toks[j].t === 'LB') depth++
          else if (toks[j].t === 'RP' || toks[j].t === 'RB') depth--
          else if (toks[j].t === 'EQ' && depth === 0) { hasEq = true; break }
          else if (toks[j].t === 'SEMI') break
          j++
        }
        if (hasEq) {
          const name = eat().v
          const params = []
          while (!check('EQ', 'EOF')) {
            if (check('ID', 'WILD')) params.push(eat().v)
            else if (check('LP', 'LB', 'NUM', 'STR', 'CON')) {
              // Pattern argument — only handle simple variable patterns for now
              params.push(eat().v)
            }
            else break
          }
          expect('EQ')
          const rhs = parseExpr()
          let body = rhs
          if (params.length) body = params.reduceRight((b, p) => ({ T: 'L', p, b }), rhs)
          defs.push({ n: name, e: body })
          if (check('SEMI')) eat()
          continue
        }
      }
      // Bare expression (the thing to evaluate)
      expr = parseExpr()
      if (check('SEMI')) eat()
    }
    return { defs, expr }
  }

  return parseTop()
}

// ─── Pretty printer ───────────────────────────────────────────────────────────

function pretty(val, depth = 0) {
  if (val === null || val === undefined) return '?'
  switch (val.T) {
    case 'N': return String(val.v)
    case 'B': return val.v ? 'True' : 'False'
    case 'S': return '"' + val.v + '"'
    case 'V': return val.n
    case 'Nil': return '[]'
    case 'C': {
      // Collect spine (don't force Lazy/Thunk tails — show as ...)
      const items = []
      let node = val
      while (node.T === 'C' && items.length < 20) { items.push(node.h); node = node.t }
      if (node.T === 'Nil') return '[' + items.map(x => pretty(x, depth + 1)).join(', ') + ']'
      if (node.T === 'Lazy' || node.T === 'Thunk')
        return '[' + items.map(x => pretty(x, depth + 1)).join(', ') + ', ...]'
      if (depth > 2) return pretty(items[0], depth + 1) + ' : ...'
      return pretty(items[0], depth + 1) + ' : ' + pretty({ T: 'C', h: items[1] ?? node, t: node }, depth + 1)
    }
    case 'Rng': {
      const f = pretty(val.from, depth + 1)
      if (val.step !== null) {
        const s = pretty(val.step, depth + 1)
        if (val.to) return `[${f}, ${s}..${pretty(val.to, depth+1)}]`
        return `[${f}, ${s}..]`
      }
      if (val.to) return `[${f}..${pretty(val.to, depth+1)}]`
      return `[${f}..]`
    }
    case 'Tu': return '(' + val.es.map(e => pretty(e, depth+1)).join(', ') + ')'
    case 'L': return '(\\' + val.p + ' -> ...)'
    case 'Cl': return '(\\' + val.p + ' -> ...)'  // closure
    case 'Prim': {
      if (!val.args || val.args.length === 0) return val.n
      return '(' + val.n + ' ' + val.args.map(a => pretty(a, depth+1)).join(' ') + ')'
    }
    case 'A': return '(' + pretty(val.f, depth+1) + ' ' + pretty(val.x, depth+1) + ')'
    case 'O': {
      if (val.l === null) return '(-' + pretty(val.r, depth+1) + ')'
      return '(' + pretty(val.l, depth+1) + ' ' + val.op + ' ' + pretty(val.r, depth+1) + ')'
    }
    case 'Sec': {
      if (val.l === null) return '(' + val.op + pretty(val.r, depth+1) + ')'
      return '(' + pretty(val.l, depth+1) + val.op + ')'
    }
    case 'If': return '(if ' + pretty(val.c) + ' then ... else ...)'
    case 'Lt': return '(let ... in ...)'
    default: return JSON.stringify(val)
  }
}

function prettyList(val) {
  if (val.T === 'Nil') return '[]'
  if (val.T === 'Rng') return pretty(val)
  const items = []
  let node = val
  while (node.T === 'C' && items.length < 5) { items.push(pretty(node.h)); node = node.t }
  if (node.T === 'Nil') return '[' + items.join(', ') + ']'
  return '[' + items.join(', ') + ', ...]'
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

const BUILTINS = new Map([
  ['take', { n: 'take', arity: 2 }],
  ['drop', { n: 'drop', arity: 2 }],
  ['head', { n: 'head', arity: 1 }],
  ['tail', { n: 'tail', arity: 1 }],
  ['last', { n: 'last', arity: 1 }],
  ['init', { n: 'init', arity: 1 }],
  ['length', { n: 'length', arity: 1 }],
  ['null', { n: 'null', arity: 1 }],
  ['reverse', { n: 'reverse', arity: 1 }],
  ['map', { n: 'map', arity: 2 }],
  ['filter', { n: 'filter', arity: 2 }],
  ['foldr', { n: 'foldr', arity: 3 }],
  ['foldl', { n: 'foldl', arity: 3 }],
  ['scanl', { n: 'scanl', arity: 3 }],
  ['zip', { n: 'zip', arity: 2 }],
  ['zipWith', { n: 'zipWith', arity: 3 }],
  ['iterate', { n: 'iterate', arity: 2 }],
  ['repeat', { n: 'repeat', arity: 1 }],
  ['cycle', { n: 'cycle', arity: 1 }],
  ['sum', { n: 'sum', arity: 1 }],
  ['product', { n: 'product', arity: 1 }],
  ['maximum', { n: 'maximum', arity: 1 }],
  ['minimum', { n: 'minimum', arity: 1 }],
  ['even', { n: 'even', arity: 1 }],
  ['odd', { n: 'odd', arity: 1 }],
  ['abs', { n: 'abs', arity: 1 }],
  ['negate', { n: 'negate', arity: 1 }],
  ['signum', { n: 'signum', arity: 1 }],
  ['show', { n: 'show', arity: 1 }],
  ['concat', { n: 'concat', arity: 1 }],
  ['concatMap', { n: 'concatMap', arity: 2 }],
  ['id', { n: 'id', arity: 1 }],
  ['const', { n: 'const', arity: 2 }],
  ['flip', { n: 'flip', arity: 3 }],
  ['not', { n: 'not', arity: 1 }],
  ['div', { n: 'div', arity: 2 }],
  ['mod', { n: 'mod', arity: 2 }],
  ['quot', { n: 'quot', arity: 2 }],
  ['rem', { n: 'rem', arity: 2 }],
  ['gcd', { n: 'gcd', arity: 2 }],
  ['lcm', { n: 'lcm', arity: 2 }],
  ['max', { n: 'max', arity: 2 }],
  ['min', { n: 'min', arity: 2 }],
  ['succ', { n: 'succ', arity: 1 }],
  ['pred', { n: 'pred', arity: 1 }],
  ['floor', { n: 'floor', arity: 1 }],
  ['ceiling', { n: 'ceiling', arity: 1 }],
  ['round', { n: 'round', arity: 1 }],
  ['truncate', { n: 'truncate', arity: 1 }],
  ['fromIntegral', { n: 'fromIntegral', arity: 1 }],
  ['toInteger', { n: 'toInteger', arity: 1 }],
  ['sqrt', { n: 'sqrt', arity: 1 }],
  ['elem', { n: 'elem', arity: 2 }],
  ['notElem', { n: 'notElem', arity: 2 }],
  ['words', { n: 'words', arity: 1 }],
  ['unwords', { n: 'unwords', arity: 1 }],
  ['lines', { n: 'lines', arity: 1 }],
  ['unlines', { n: 'unlines', arity: 1 }],
  ['lookup', { n: 'lookup', arity: 2 }],
  ['and', { n: 'and', arity: 1 }],
  ['or', { n: 'or', arity: 1 }],
  ['all', { n: 'all', arity: 2 }],
  ['any', { n: 'any', arity: 2 }],
])

// Range helper: get head value as a number
function rngHead(rng) {
  return typeof rng.from === 'number' ? rng.from : rng.from.v
}

// Range helper: advance range by one step, returning a new Range or Nil.
// rng.step is the SECOND element of the Haskell literal [from, step, ..to],
// so the common difference is (step.v - from).
function rngTail(rng) {
  const from = typeof rng.from === 'number' ? rng.from : rng.from.v
  const delta = rng.step !== null
    ? (typeof rng.step === 'number' ? rng.step : rng.step.v) - from
    : 1
  const next = from + delta
  if (rng.to !== null) {
    const toVal = typeof rng.to === 'number' ? rng.to : rng.to.v
    if (delta > 0 && next > toVal) return { T: 'Nil' }
    if (delta < 0 && next < toVal) return { T: 'Nil' }
  }
  // Preserve the delta in the tail range so subsequent tails use the same step size.
  const nextStep = delta !== 1 ? { T: 'N', v: next + delta } : null
  return { T: 'Rng', from: { T: 'N', v: next }, to: rng.to, step: nextStep }
}

// Convert an AST value to a JS number (throws if not numeric)
function toNum(v) {
  if (v.T === 'N') return v.v
  throw new Error(`Expected number, got ${v.T}`)
}

// Convert an AST value to a JS boolean
function toBool(v) {
  if (v.T === 'B') return v.v
  if (v.T === 'N') return v.v !== 0
  throw new Error(`Expected boolean, got ${v.T}`)
}

// Evaluate expr in env, recording steps
function evalE(expr, env, ctx) {
  if (ctx.steps.length >= ctx.max) { ctx.truncated = true; return { T: 'N', v: 0 } }
  switch (expr.T) {
    case 'N': case 'B': case 'S': case 'Nil': return expr
    case 'Tu': return { T: 'Tu', es: expr.es.map(e => evalE(e, env, ctx)) }
    case 'Rng': {
      // Evaluate from/to/step to numbers if they're expressions
      const from = evalE(expr.from, env, ctx)
      const to = expr.to ? evalE(expr.to, env, ctx) : null
      const step = expr.step ? evalE(expr.step, env, ctx) : null
      return { T: 'Rng', from, to, step }
    }
    case 'C': {
      // Lazy cons: don't evaluate tail yet
      const h = evalE(expr.h, env, ctx)
      return { T: 'C', h, t: expr.t, env }
    }
    case 'V': {
      const name = expr.n
      if (BUILTINS.has(name)) {
        const b = BUILTINS.get(name)
        return { T: 'Prim', n: b.n, arity: b.arity, args: [] }
      }
      // Operator section reference like (+)
      if (name.startsWith('(') && name.endsWith(')')) {
        const op = name.slice(1, -1)
        return { T: 'Prim', n: '(' + op + ')', arity: 2, args: [] }
      }
      if (env.has(name)) {
        const val = env.get(name)
        // Support recursive: wrap in thunk to avoid infinite loop
        return typeof val === 'function' ? val() : evalE(val, env, ctx)
      }
      throw new Error(`Undefined variable: ${name}`)
    }
    case 'Sec': {
      // Operator section (\x -> x op r) or (\x -> l op x)
      return { T: 'Cl', p: '__x', b: {
        T: 'O', op: expr.op,
        l: expr.l ?? { T: 'V', n: '__x' },
        r: expr.r ?? { T: 'V', n: '__x' },
      }, env }
    }
    case 'L': {
      return { T: 'Cl', p: expr.p, b: expr.b, env }
    }
    case 'A': {
      const fn = evalE(expr.f, env, ctx)
      // For App nodes, don't eagerly evaluate x — pass it to applyFn as an AST node with env
      // (lazy: only force x when the function actually needs it)
      return applyFn(fn, { T: 'Thunk', e: expr.x, env }, env, ctx)
    }
    case 'Thunk': {
      return evalE(expr.e, expr.env, ctx)
    }
    case 'O': {
      if (expr.op === 'negate') return { T: 'N', v: -toNum(evalE(expr.r, env, ctx)) }
      const l = evalE(expr.l, env, ctx)
      const r = evalE(expr.r, env, ctx)
      return applyOp(expr.op, l, r, ctx)
    }
    case 'If': {
      const cond = evalE(expr.c, env, ctx)
      return evalE(toBool(cond) ? expr.y : expr.n, env, ctx)
    }
    case 'Lt': {
      // Letrec: allow mutually recursive definitions
      const newEnv = new Map(env)
      for (const d of expr.ds) {
        // Use a thunk factory for recursive support
        newEnv.set(d.n, { T: 'Thunk', e: d.e, env: newEnv })
      }
      return evalE(expr.b, newEnv, ctx)
    }
    // Already-evaluated forms
    case 'Cl': case 'Prim': return expr
    default: throw new Error(`Cannot eval: ${expr.T}`)
  }
}

function forceThunk(val, env, ctx) {
  if (val.T === 'Thunk') return evalE(val.e, val.env, ctx)
  return val
}

function applyOp(op, l, r, ctx) {
  if (op === '&&') return { T: 'B', v: toBool(l) && toBool(r) }
  if (op === '||') return { T: 'B', v: toBool(l) || toBool(r) }
  if (op === '++') return concatLists(l, r, ctx)
  const a = toNum(l), b = toNum(r)
  switch (op) {
    case '+': return { T: 'N', v: a + b }
    case '-': return { T: 'N', v: a - b }
    case '*': return { T: 'N', v: a * b }
    case '/': return { T: 'N', v: a / b }
    case '^': return { T: 'N', v: Math.pow(a, b) }
    case '**': return { T: 'N', v: Math.pow(a, b) }
    case 'div': return { T: 'N', v: Math.trunc(a / b) }
    case 'mod': return { T: 'N', v: ((a % b) + b) % b }
    case 'quot': return { T: 'N', v: Math.trunc(a / b) }
    case 'rem': return { T: 'N', v: a % b }
    case '==': return { T: 'B', v: a === b }
    case '/=': return { T: 'B', v: a !== b }
    case '<':  return { T: 'B', v: a < b }
    case '>':  return { T: 'B', v: a > b }
    case '<=': return { T: 'B', v: a <= b }
    case '>=': return { T: 'B', v: a >= b }
    default: throw new Error(`Unknown op: ${op}`)
  }
}

function concatLists(a, b, ctx) {
  if (a.T === 'Nil') return b
  const h = a.T === 'C' ? a.h : { T: 'N', v: rngHead(a) }
  const t = a.T === 'C' ? forceConsTail(a, ctx) : rngTail(a)
  return { T: 'C', h, t: concatLists(t, b, ctx) }
}

function forceConsTail(cons, ctx) {
  const t = cons.t
  if (t.T === 'Thunk') return evalE(t.e, t.env ?? new Map(), ctx)
  if (t.T === 'Lazy') return t._f(ctx)  // lazy list continuation
  return t
}

// Apply a function value to an (unevaluated) argument
function applyFn(fn, arg, env, ctx) {
  if (fn.T === 'Cl') {
    // Lambda / closure: substitute arg into body
    const newEnv = new Map(fn.env)
    newEnv.set(fn.p, arg)
    return evalE(fn.b, newEnv, ctx)
  }
  if (fn.T === 'L') {
    const newEnv = new Map(env)
    newEnv.set(fn.p, arg)
    return evalE(fn.b, newEnv, ctx)
  }
  if (fn.T === 'Prim') {
    const newArgs = [...fn.args, arg]
    if (newArgs.length >= fn.arity) {
      return applyBuiltin(fn.n, newArgs, env, ctx)
    }
    return { T: 'Prim', n: fn.n, arity: fn.arity, args: newArgs }
  }
  throw new Error(`Cannot apply: ${fn.T}`)
}

// Force an argument (evaluate the thunk if needed)
function force(arg, env, ctx) {
  if (arg.T === 'Thunk') return evalE(arg.e, arg.env ?? env, ctx)
  if (arg.T === 'Lazy') return arg._f(ctx)   // lazy list continuation
  return arg
}

// Force the entire spine of a list, recording steps into ctx as they happen.
// Used after the main evaluation to materialize lazy cons cells into the step trace.
function forceSteps(val, env, ctx, depth = 0) {
  if (depth > 2000 || ctx.truncated) return { T: 'Nil' }
  const v = force(val, env, ctx)
  if (v.T === 'C') {
    const h = forceSteps(v.h, env, ctx, depth + 1)
    const t = forceSteps(v.t, env, ctx, depth + 1)
    return { T: 'C', h, t }
  }
  if (v.T === 'Rng') {
    if (v.to === null && depth > 100) return { T: 'Nil' }
    const head = rngHead(v)
    const tail = rngTail(v)
    return { T: 'C', h: { T: 'N', v: head }, t: forceSteps(tail, env, ctx, depth + 1) }
  }
  return v
}

// Apply a fully-saturated built-in
function applyBuiltin(name, args, env, ctx) {
  const record = (redex, result, annotation) => {
    if (ctx.steps.length < ctx.max) {
      ctx.steps.push({ step: ctx.steps.length, redex, result, annotation })
    } else {
      ctx.truncated = true
    }
  }

  // Helper: force list argument
  const forceList = (a) => force(a, env, ctx)

  // Helper: pretty-print a lazy value (don't fully eval it)
  const pv = (v) => pretty(force(v, env, ctx))

  switch (name) {
    case 'take': {
      const n = toNum(force(args[0], env, ctx))
      let list = forceList(args[1])
      const result = []
      let rem = n
      while (rem > 0) {
        if (list.T === 'Nil') break
        if (list.T === 'Rng') {
          const h = { T: 'N', v: rngHead(list) }
          const nextList = rngTail(list)
          const hStr = pretty(h)
          const listStr = pretty(list)
          const afterStr = rem > 1
            ? `${hStr} : take ${rem - 1} ${pretty(nextList)}`
            : `[${hStr}]`
          record(`take ${rem} ${listStr}`, afterStr, 'take n (x:xs) = x : take (n-1) xs')
          result.push(h); list = nextList; rem--
        } else if (list.T === 'C') {
          const h = force(list.h, env, ctx)
          const nextList = forceConsTail(list, ctx)
          const hStr = pretty(h)
          const listStr = prettyList(list)
          const afterStr = rem > 1
            ? `${hStr} : take ${rem - 1} ${prettyList(nextList)}`
            : `[${hStr}]`
          record(`take ${rem} ${listStr}`, afterStr, 'take n (x:xs) = x : take (n-1) xs')
          result.push(h); list = nextList; rem--
        } else {
          break
        }
      }
      if (rem === 0 && list.T !== 'Nil') {
        record(`take 0 ${pretty(list)}`, '[]', 'take 0 _ = []')
      }
      return result.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }

    case 'drop': {
      const n = toNum(force(args[0], env, ctx))
      let list = forceList(args[1])
      let rem = n
      while (rem > 0) {
        if (list.T === 'Nil') break
        if (list.T === 'Rng') {
          const h = rngHead(list)
          record(`drop ${rem} ${pretty(list)}`, `drop ${rem - 1} ${pretty(rngTail(list))}`,
            'drop n (x:xs) = drop (n-1) xs')
          list = rngTail(list); rem--
        } else if (list.T === 'C') {
          const h = force(list.h, env, ctx)
          const nextList = forceConsTail(list, ctx)
          record(`drop ${rem} ${prettyList(list)}`, `drop ${rem - 1} ${prettyList(nextList)}`,
            'drop n (x:xs) = drop (n-1) xs')
          list = nextList; rem--
        } else break
      }
      return list
    }

    case 'head': {
      const list = forceList(args[0])
      if (list.T === 'Rng') {
        const h = { T: 'N', v: rngHead(list) }
        record(`head ${pretty(list)}`, pretty(h), 'head (x:_) = x')
        return h
      }
      if (list.T === 'C') {
        const h = force(list.h, env, ctx)
        record(`head ${prettyList(list)}`, pretty(h), 'head (x:_) = x')
        return h
      }
      throw new Error('head: empty list')
    }

    case 'tail': {
      const list = forceList(args[0])
      if (list.T === 'Rng') {
        const t = rngTail(list)
        record(`tail ${pretty(list)}`, pretty(t), 'tail (_:xs) = xs')
        return t
      }
      if (list.T === 'C') {
        const t = forceConsTail(list, ctx)
        record(`tail ${prettyList(list)}`, prettyList(t), 'tail (_:xs) = xs')
        return t
      }
      throw new Error('tail: empty list')
    }

    case 'null': {
      const list = forceList(args[0])
      const val = list.T === 'Nil'
      record(`null ${prettyList(list)}`, val ? 'True' : 'False',
        val ? 'null [] = True' : 'null (x:xs) = False')
      return { T: 'B', v: val }
    }

    case 'length': {
      const v0 = force(args[0], env, ctx)
      if (v0.T === 'S') {
        record(`length "${v0.v}"`, String(v0.v.length), 'length string')
        return { T: 'N', v: v0.v.length }
      }
      let node = v0, count = 0
      while (node.T !== 'Nil') {
        if (node.T === 'Rng') {
          const from = rngHead(node)
          const to = node.to ? (typeof node.to === 'number' ? node.to : node.to.v) : null
          if (to === null) throw new Error('length: infinite list')
          count += Math.max(0, Math.floor(to - from) + 1)
          break
        }
        count++; node = forceConsTail(node, ctx)
      }
      record(`length ${prettyList(v0)}`, String(count), 'length xs = ...')
      return { T: 'N', v: count }
    }

    case 'reverse': {
      const v0 = force(args[0], env, ctx)
      if (v0.T === 'S') {
        const rev = v0.v.split('').reverse().join('')
        record(`reverse "${v0.v}"`, `"${rev}"`, 'reverse string')
        return { T: 'S', v: rev }
      }
      let list = v0
      const items = []
      while (list.T !== 'Nil') {
        if (list.T === 'Rng') {
          const from = rngHead(list)
          const to = list.to ? (typeof list.to === 'number' ? list.to : list.to.v) : null
          if (to === null) throw new Error('reverse: infinite list')
          for (let i = from; i <= to; i++) items.push({ T: 'N', v: i })
          break
        }
        items.push(force(list.h, env, ctx))
        list = forceConsTail(list, ctx)
      }
      const rev = items.reverse().reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
      record(`reverse ${prettyList(v0)}`, prettyList(rev), 'reverse xs = ...')
      return rev
    }

    case 'map': {
      // Lazy cons: compute head, return cons with lazy tail so take/filter can limit evaluation.
      const fn = force(args[0], env, ctx)
      const list = force(args[1], env, ctx)
      if (list.T === 'Nil') {
        record(`map ${pretty(fn)} []`, '[]', 'map f [] = []')
        return { T: 'Nil' }
      }
      let h, tail
      if (list.T === 'Rng') {
        h = { T: 'N', v: rngHead(list) }; tail = rngTail(list)
      } else if (list.T === 'C') {
        h = force(list.h, env, ctx); tail = forceConsTail(list, ctx)
      } else {
        throw new Error('map: not a list')
      }
      const mVal = force(applyFn(fn, h, env, ctx), env, ctx)
      const tailStr = tail.T === 'Nil' ? '[]' : `map ${pretty(fn)} ...`
      record(`map ${pretty(fn)} ${list.T === 'Rng' ? pretty(list) : prettyList(list)}`,
        `${pretty(mVal)} : ${tailStr}`,
        'map f (x:xs) = f x : map f xs')
      // Lazy tail: calling this evaluates one more map element on demand
      const _fn = fn, _tail = tail, _env = env
      return { T: 'C', h: mVal, t: { T: 'Lazy', _f: (c) => applyBuiltin('map', [_fn, _tail], _env, c) } }
    }

    case 'filter': {
      // Lazy: find the first element that passes, return lazy cons for the rest.
      const fn = force(args[0], env, ctx)
      let list = force(args[1], env, ctx)
      // Scan forward until we find a passing element or exhaust the list
      while (list.T !== 'Nil' && !ctx.truncated) {
        let h, nextList
        if (list.T === 'Rng') {
          h = { T: 'N', v: rngHead(list) }; nextList = rngTail(list)
        } else if (list.T === 'C') {
          h = force(list.h, env, ctx); nextList = forceConsTail(list, ctx)
        } else if (list.T === 'Lazy') {
          list = list._f(ctx); continue
        } else break
        const test = force(applyFn(fn, h, env, ctx), env, ctx)
        const pass = toBool(test)
        const listStr = list.T === 'Rng' ? pretty(list) : prettyList(list)
        if (pass) {
          record(`filter ${pretty(fn)} ${listStr}`,
            `${pretty(h)} : filter ${pretty(fn)} ...`,
            'filter p (x:xs) | p x = x : filter p xs')
          const _fn = fn, _tail = nextList, _env = env
          return { T: 'C', h, t: { T: 'Lazy', _f: (c) => applyBuiltin('filter', [_fn, _tail], _env, c) } }
        } else {
          record(`filter ${pretty(fn)} ${listStr}`,
            `filter ${pretty(fn)} ${list.T === 'Rng' ? pretty(nextList) : prettyList(nextList)}`,
            'filter p (x:xs) | not (p x) = filter p xs')
          list = nextList
        }
      }
      record(`filter ${pretty(fn)} []`, '[]', 'filter p [] = []')
      return { T: 'Nil' }
    }

    case 'foldr': {
      const fn = force(args[0], env, ctx)
      const z = force(args[1], env, ctx)
      let list = forceList(args[2])
      const items = []
      while (list.T !== 'Nil') {
        if (list.T === 'Rng') {
          const from = rngHead(list)
          const to = list.to ? (typeof list.to === 'number' ? list.to : list.to.v) : null
          if (to === null) throw new Error('foldr: infinite list')
          for (let i = from; i <= to; i++) items.push({ T: 'N', v: i })
          break
        } else if (list.T === 'C') {
          items.push(force(list.h, env, ctx)); list = forceConsTail(list, ctx)
        } else break
      }
      let acc = z
      const zStr = pretty(z)
      record(`foldr ${pretty(fn)} ${zStr} []`, zStr, 'foldr f z [] = z')
      for (let i = items.length - 1; i >= 0; i--) {
        const h = items[i]
        const accStr = pretty(acc)
        const hStr = pretty(h)
        const before = `foldr ${pretty(fn)} ${accStr} (${hStr}:...)`
        acc = force(applyFn(force(applyFn(fn, h, env, ctx), env, ctx), acc, env, ctx), env, ctx)
        record(before, pretty(acc), 'foldr f z (x:xs) = f x (foldr f z xs)')
      }
      return acc
    }

    case 'foldl': {
      const fn = force(args[0], env, ctx)
      let acc = force(args[1], env, ctx)
      let list = forceList(args[2])
      let prev = pretty(acc)
      record(`foldl ${pretty(fn)} ${prev} ${prettyList(list)}`,
        pretty(acc), 'foldl f z [] = z')
      while (list.T !== 'Nil' && !ctx.truncated) {
        let h, nextList
        if (list.T === 'Rng') {
          h = { T: 'N', v: rngHead(list) }; nextList = rngTail(list)
        } else if (list.T === 'C') {
          h = force(list.h, env, ctx); nextList = forceConsTail(list, ctx)
        } else break
        const before = `foldl ${pretty(fn)} ${pretty(acc)} (${pretty(h)}:...)`
        acc = force(applyFn(force(applyFn(fn, acc, env, ctx), env, ctx), h, env, ctx), env, ctx)
        record(before, pretty(acc), 'foldl f z (x:xs) = foldl f (f z x) xs')
        list = nextList
      }
      return acc
    }

    case 'zip': {
      let a = forceList(args[0])
      let b = forceList(args[1])
      const pairs = []
      while (a.T !== 'Nil' && b.T !== 'Nil' && !ctx.truncated) {
        let ha, hb, na, nb
        if (a.T === 'Rng') { ha = { T: 'N', v: rngHead(a) }; na = rngTail(a) }
        else { ha = force(a.h, env, ctx); na = forceConsTail(a, ctx) }
        if (b.T === 'Rng') { hb = { T: 'N', v: rngHead(b) }; nb = rngTail(b) }
        else { hb = force(b.h, env, ctx); nb = forceConsTail(b, ctx) }
        const pair = { T: 'Tu', es: [ha, hb] }
        record(`zip ... ...`, pretty(pair) + ' : ...', 'zip (x:xs) (y:ys) = (x,y) : zip xs ys')
        pairs.push(pair); a = na; b = nb
      }
      return pairs.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }

    case 'zipWith': {
      const fn = force(args[0], env, ctx)
      let a = forceList(args[1])
      let b = forceList(args[2])
      const results = []
      while (a.T !== 'Nil' && b.T !== 'Nil' && !ctx.truncated) {
        let ha, hb, na, nb
        if (a.T === 'Rng') { ha = { T: 'N', v: rngHead(a) }; na = rngTail(a) }
        else { ha = force(a.h, env, ctx); na = forceConsTail(a, ctx) }
        if (b.T === 'Rng') { hb = { T: 'N', v: rngHead(b) }; nb = rngTail(b) }
        else { hb = force(b.h, env, ctx); nb = forceConsTail(b, ctx) }
        const combined = force(applyFn(force(applyFn(fn, ha, env, ctx), env, ctx), hb, env, ctx), env, ctx)
        record(`zipWith ${pretty(fn)} (${pretty(ha)}:...) (${pretty(hb)}:...)`,
          `${pretty(combined)} : zipWith ${pretty(fn)} ... ...`,
          'zipWith f (x:xs) (y:ys) = f x y : zipWith f xs ys')
        results.push(combined); a = na; b = nb
      }
      return results.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }

    case 'iterate': {
      // iterate f x = x : iterate f (f x)
      // Return a lazy range representation up to step limit
      const fn = force(args[0], env, ctx)
      const x0 = force(args[1], env, ctx)
      record(`iterate ${pretty(fn)} ${pretty(x0)}`,
        `${pretty(x0)} : iterate ${pretty(fn)} (${pretty(fn)} ${pretty(x0)})`,
        'iterate f x = x : iterate f (f x)')
      // Build as lazy linked list up to max steps / 10 to avoid blowing the budget
      const cap = 20
      let cur = x0
      let node = { T: 'Nil' }
      const items = [cur]
      for (let i = 1; i < cap && !ctx.truncated; i++) {
        cur = force(applyFn(fn, cur, env, ctx), env, ctx)
        items.push(cur)
      }
      return items.reduceRight((t, h) => ({ T: 'C', h, t }), node)
    }

    case 'repeat': {
      const v = force(args[0], env, ctx)
      const cap = 20
      const items = Array.from({ length: cap }, () => v)
      record(`repeat ${pretty(v)}`, `${pretty(v)} : repeat ${pretty(v)}`, 'repeat x = x : repeat x')
      return items.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }

    case 'cycle': {
      const list = forceList(args[0])
      const items = []
      let node = list
      while (node.T !== 'Nil' && items.length < 100) {
        if (node.T === 'C') { items.push(force(node.h, env, ctx)); node = forceConsTail(node, ctx) }
        else break
      }
      if (!items.length) throw new Error('cycle: empty list')
      const cap = 20
      const cycled = Array.from({ length: cap }, (_, i) => items[i % items.length])
      record(`cycle ${prettyList(list)}`, '[' + cycled.slice(0,6).map(x=>pretty(x)).join(',') + ',...]',
        'cycle xs = xs ++ cycle xs')
      return cycled.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }

    case 'sum': {
      const list = forceList(args[0])
      let total = 0, node = list
      while (node.T !== 'Nil') {
        if (node.T === 'Rng') {
          const from = rngHead(node)
          const to = node.to ? (typeof node.to === 'number' ? node.to : node.to.v) : null
          if (to === null) throw new Error('sum: infinite list')
          const n = Math.max(0, to - from + 1)
          total += n * (from + to) / 2; break
        }
        total += toNum(force(node.h, env, ctx)); node = forceConsTail(node, ctx)
      }
      record(`sum ${prettyList(list)}`, String(total), 'sum xs = foldr (+) 0 xs')
      return { T: 'N', v: total }
    }

    case 'product': {
      const list = forceList(args[0])
      let total = 1, node = list
      while (node.T !== 'Nil') {
        if (node.T === 'Rng') {
          const from = rngHead(node)
          const to = node.to ? (typeof node.to === 'number' ? node.to : node.to.v) : null
          if (to === null) throw new Error('product: infinite list')
          for (let i = from; i <= to; i++) total *= i; break
        }
        total *= toNum(force(node.h, env, ctx)); node = forceConsTail(node, ctx)
      }
      record(`product ${prettyList(list)}`, String(total), 'product xs = foldr (*) 1 xs')
      return { T: 'N', v: total }
    }

    case 'maximum': case 'minimum': {
      const list = forceList(args[0])
      const vals = []
      let node = list
      while (node.T !== 'Nil') {
        if (node.T === 'Rng') {
          const from = rngHead(node)
          const to = node.to ? (typeof node.to === 'number' ? node.to : node.to.v) : null
          if (to === null) throw new Error(name + ': infinite list')
          vals.push(from, to); break
        }
        vals.push(toNum(force(node.h, env, ctx))); node = forceConsTail(node, ctx)
      }
      const res = name === 'maximum' ? Math.max(...vals) : Math.min(...vals)
      record(`${name} ${prettyList(list)}`, String(res), `${name} xs = fold1 ...`)
      return { T: 'N', v: res }
    }

    case 'even': {
      const n = toNum(force(args[0], env, ctx))
      const r = n % 2 === 0
      record(`even ${n}`, r ? 'True' : 'False', 'even n = n mod 2 == 0')
      return { T: 'B', v: r }
    }
    case 'odd': {
      const n = toNum(force(args[0], env, ctx))
      const r = n % 2 !== 0
      record(`odd ${n}`, r ? 'True' : 'False', 'odd n = n mod 2 /= 0')
      return { T: 'B', v: r }
    }
    case 'abs': {
      const n = toNum(force(args[0], env, ctx))
      record(`abs ${n}`, String(Math.abs(n)), 'abs x = if x < 0 then -x else x')
      return { T: 'N', v: Math.abs(n) }
    }
    case 'negate': {
      const n = toNum(force(args[0], env, ctx))
      record(`negate ${n}`, String(-n), 'negate x = 0 - x')
      return { T: 'N', v: -n }
    }
    case 'signum': {
      const n = toNum(force(args[0], env, ctx))
      const s = n < 0 ? -1 : n > 0 ? 1 : 0
      record(`signum ${n}`, String(s), 'signum x = compare x 0')
      return { T: 'N', v: s }
    }
    case 'succ': {
      const n = toNum(force(args[0], env, ctx))
      return { T: 'N', v: n + 1 }
    }
    case 'pred': {
      const n = toNum(force(args[0], env, ctx))
      return { T: 'N', v: n - 1 }
    }
    case 'floor': { const n = toNum(force(args[0], env, ctx)); return { T: 'N', v: Math.floor(n) } }
    case 'ceiling': { const n = toNum(force(args[0], env, ctx)); return { T: 'N', v: Math.ceil(n) } }
    case 'round': { const n = toNum(force(args[0], env, ctx)); return { T: 'N', v: Math.round(n) } }
    case 'truncate': case 'fromIntegral': case 'toInteger': {
      const n = toNum(force(args[0], env, ctx)); return { T: 'N', v: Math.trunc(n) }
    }
    case 'sqrt': {
      const n = toNum(force(args[0], env, ctx))
      return { T: 'N', v: Math.sqrt(n) }
    }
    case 'show': {
      const v = force(args[0], env, ctx)
      return { T: 'S', v: pretty(v) }
    }
    case 'id': return force(args[0], env, ctx)
    case 'const': {
      const a = force(args[0], env, ctx)
      return a  // const a _ = a
    }
    case 'not': {
      const v = force(args[0], env, ctx)
      return { T: 'B', v: !toBool(v) }
    }
    case 'div': case 'quot': {
      const a = toNum(force(args[0], env, ctx))
      const b = toNum(force(args[1], env, ctx))
      record(`${name} ${a} ${b}`, String(Math.trunc(a / b)), `${name} a b = truncate (a / b)`)
      return { T: 'N', v: Math.trunc(a / b) }
    }
    case 'mod': case 'rem': {
      const a = toNum(force(args[0], env, ctx))
      const b = toNum(force(args[1], env, ctx))
      const r = name === 'mod' ? ((a % b) + b) % b : a % b
      record(`${name} ${a} ${b}`, String(r), `${name} a b = ...`)
      return { T: 'N', v: r }
    }
    case 'gcd': {
      let a = Math.abs(toNum(force(args[0], env, ctx)))
      let b = Math.abs(toNum(force(args[1], env, ctx)))
      while (b) { [a, b] = [b, a % b] }
      return { T: 'N', v: a }
    }
    case 'lcm': {
      const a = Math.abs(toNum(force(args[0], env, ctx)))
      const b = Math.abs(toNum(force(args[1], env, ctx)))
      let g = a, r = b; while (r) { [g, r] = [r, g % r] }
      return { T: 'N', v: a / g * b }
    }
    case 'max': {
      const a = toNum(force(args[0], env, ctx))
      const b = toNum(force(args[1], env, ctx))
      return { T: 'N', v: Math.max(a, b) }
    }
    case 'min': {
      const a = toNum(force(args[0], env, ctx))
      const b = toNum(force(args[1], env, ctx))
      return { T: 'N', v: Math.min(a, b) }
    }
    case 'elem': {
      const v = force(args[0], env, ctx)
      let list = forceList(args[1])
      while (list.T !== 'Nil') {
        const h = list.T === 'Rng' ? { T: 'N', v: rngHead(list) } : force(list.h, env, ctx)
        if (pretty(h) === pretty(v)) { return { T: 'B', v: true } }
        list = list.T === 'Rng' ? rngTail(list) : forceConsTail(list, ctx)
      }
      return { T: 'B', v: false }
    }
    case 'notElem': {
      const v = force(args[0], env, ctx)
      let list = forceList(args[1])
      while (list.T !== 'Nil') {
        const h = list.T === 'Rng' ? { T: 'N', v: rngHead(list) } : force(list.h, env, ctx)
        if (pretty(h) === pretty(v)) { return { T: 'B', v: false } }
        list = list.T === 'Rng' ? rngTail(list) : forceConsTail(list, ctx)
      }
      return { T: 'B', v: true }
    }
    case 'and': {
      let list = forceList(args[0])
      while (list.T !== 'Nil') {
        const h = list.T === 'C' ? force(list.h, env, ctx) : { T: 'B', v: true }
        if (!toBool(h)) return { T: 'B', v: false }
        list = list.T === 'C' ? forceConsTail(list, ctx) : { T: 'Nil' }
      }
      return { T: 'B', v: true }
    }
    case 'or': {
      let list = forceList(args[0])
      while (list.T !== 'Nil') {
        const h = list.T === 'C' ? force(list.h, env, ctx) : { T: 'B', v: false }
        if (toBool(h)) return { T: 'B', v: true }
        list = list.T === 'C' ? forceConsTail(list, ctx) : { T: 'Nil' }
      }
      return { T: 'B', v: false }
    }
    case 'all': {
      const fn = force(args[0], env, ctx)
      let list = forceList(args[1])
      while (list.T !== 'Nil') {
        const h = list.T === 'C' ? force(list.h, env, ctx) : null
        if (!h) break
        if (!toBool(force(applyFn(fn, h, env, ctx), env, ctx))) return { T: 'B', v: false }
        list = forceConsTail(list, ctx)
      }
      return { T: 'B', v: true }
    }
    case 'any': {
      const fn = force(args[0], env, ctx)
      let list = forceList(args[1])
      while (list.T !== 'Nil') {
        const h = list.T === 'C' ? force(list.h, env, ctx) : null
        if (!h) break
        if (toBool(force(applyFn(fn, h, env, ctx), env, ctx))) return { T: 'B', v: true }
        list = forceConsTail(list, ctx)
      }
      return { T: 'B', v: false }
    }
    case 'concat': {
      let list = forceList(args[0])
      let result = { T: 'Nil' }
      const segments = []
      while (list.T !== 'Nil' && !ctx.truncated) {
        const h = force(list.h, env, ctx)
        segments.push(h)
        list = forceConsTail(list, ctx)
      }
      return segments.reduceRight((acc, seg) => concatLists(seg, acc, ctx), { T: 'Nil' })
    }
    case 'concatMap': {
      const fn = force(args[0], env, ctx)
      let list = forceList(args[1])
      let result = { T: 'Nil' }
      while (list.T !== 'Nil' && !ctx.truncated) {
        const h = force(list.h, env, ctx)
        const mapped = force(applyFn(fn, h, env, ctx), env, ctx)
        result = concatLists(result, mapped, ctx)
        list = forceConsTail(list, ctx)
      }
      return result
    }
    case 'flip': {
      const fn = force(args[0], env, ctx)
      const b = args[1]
      const a = args[2]
      return applyFn(force(applyFn(fn, a, env, ctx), env, ctx), b, env, ctx)
    }
    case 'words': {
      const s = force(args[0], env, ctx).v || ''
      const ws = s.split(/\s+/).filter(Boolean)
      return ws.reduceRight((t, w) => ({ T: 'C', h: { T: 'S', v: w }, t }), { T: 'Nil' })
    }
    case 'unwords': {
      let list = forceList(args[0]), ws = []
      while (list.T !== 'Nil') { ws.push(force(list.h, env, ctx).v || ''); list = forceConsTail(list, ctx) }
      return { T: 'S', v: ws.join(' ') }
    }
    case 'scanl': {
      const fn = force(args[0], env, ctx)
      let acc = force(args[1], env, ctx)
      let list = forceList(args[2])
      const results = [acc]
      while (list.T !== 'Nil' && !ctx.truncated) {
        let h
        if (list.T === 'Rng') { h = { T: 'N', v: rngHead(list) }; list = rngTail(list) }
        else { h = force(list.h, env, ctx); list = forceConsTail(list, ctx) }
        acc = force(applyFn(force(applyFn(fn, acc, env, ctx), env, ctx), h, env, ctx), env, ctx)
        results.push(acc)
      }
      return results.reduceRight((t, h) => ({ T: 'C', h, t }), { T: 'Nil' })
    }
    case '(+)': return { T: 'N', v: toNum(force(args[0], env, ctx)) + toNum(force(args[1], env, ctx)) }
    case '(-)': return { T: 'N', v: toNum(force(args[0], env, ctx)) - toNum(force(args[1], env, ctx)) }
    case '(*)': return { T: 'N', v: toNum(force(args[0], env, ctx)) * toNum(force(args[1], env, ctx)) }
    case '(/)': return { T: 'N', v: toNum(force(args[0], env, ctx)) / toNum(force(args[1], env, ctx)) }
    case '(:)': {
      const h = force(args[0], env, ctx)
      const t = force(args[1], env, ctx)
      return { T: 'C', h, t }
    }
    default:
      throw new Error(`Unknown built-in: ${name}`)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns true if src parses in the mini-grammar and contains no IO/do/main-IO patterns.
export function canHandle(src) {
  // Reject common Layer A patterns
  if (/\bdo\b/.test(src)) return false
  if (/\bIO\b/.test(src)) return false
  if (/\bputStr(?:Ln)?\b/.test(src)) return false
  if (/\bprint\b/.test(src)) return false
  if (/\bgetLine\b/.test(src)) return false
  if (/\bimport\b/.test(src)) return false
  if (/\bmodule\b/.test(src)) return false
  if (/\bdata\s+[A-Z]/.test(src)) return false
  if (/\btype\s+[A-Z]/.test(src)) return false
  if (/\bnewtype\b/.test(src)) return false
  // Must have something to evaluate
  const trimmed = src.replace(/--[^\n]*/g, '').trim()
  if (!trimmed) return false
  try {
    const { defs, expr } = parse(src)
    // Need either a bare expression or definitions
    if (!expr && defs.length === 0) return false
    return true
  } catch (_) {
    return false
  }
}

// Evaluate src and return step trace.
// Returns { steps: Step[], resultStr: string, truncated: boolean }
// Step: { step: number, redex: string, result: string, annotation: string }
export function stepEval(src, max = 200) {
  const ctx = { steps: [], max, truncated: false }
  try {
    const { defs, expr } = parse(src)
    const env = new Map()

    // Load built-ins
    for (const [name, def] of BUILTINS) {
      env.set(name, { T: 'Prim', n: def.n, arity: def.arity, args: [] })
    }
    // Operator references
    for (const op of ['+', '-', '*', '/', '++', '**']) {
      env.set('(' + op + ')', { T: 'Prim', n: '(' + op + ')', arity: 2, args: [] })
    }

    // Load user definitions (letrec style)
    for (const d of defs) {
      env.set(d.n, { T: 'Thunk', e: d.e, env })
    }

    if (!expr && defs.length === 0) {
      return { steps: [], resultStr: '(nothing to evaluate)', truncated: false }
    }

    const target = expr ?? { T: 'V', n: defs[defs.length - 1].n }
    const result = evalE(target, env, ctx)
    // Force the full result spine, recording any remaining lazy steps into the main ctx.
    // For standalone `map f xs` this adds the remaining element steps; for `take n (map ...)`
    // the result is already fully materialized so this is a no-op.
    const forced = forceSteps(result, env, ctx)
    const resultStr = pretty(forced)

    return { steps: ctx.steps, resultStr, truncated: ctx.truncated }
  } catch (e) {
    return {
      steps: ctx.steps,
      resultStr: 'Error: ' + e.message,
      truncated: ctx.truncated,
      error: e.message
    }
  }
}

// src/utils/javaInstrumenter.js
// Session 6 - Path B: regex/text-based Java source instrumenter (no JavaParser/AST).
// Session 7 - reflection-based heap capture layered on top (see __CasTrace below).
//
// Strategy: find method declarations with a regex, use brace-counting to locate each method
// body, inject __CasTrace.__trace("call") at entry and route `return expr;` through a generic
// passthrough (__CasTrace.__traceRet) for non-void methods. For void methods, inject a trace
// before each `return;` and before the closing brace. Append the __CasTrace helper class,
// which writes a JSON trace file to /files/cas_trace.json (readable by javaRunner.js via
// cjFileBlob after execution).
//
// __CasTrace.__classify() also does reflection-based heap capture for user-defined object
// instances (Session 7), mirroring python.worker.js's _classify_local/_walk_heap: stable
// integer oids via an IdentityHashMap (__objIds), fields walked via
// java.lang.reflect.Field/getDeclaredFields up the superclass chain (depth-capped at 5,
// 20-fields-per-object cap), circular references marked as kind:'ref'. Each __trace() call
// rebuilds a flat oid -> object snapshot (__curHeap) from whatever user objects were
// reachable in that call's locals, and appends it as a `heap` key on the frame (matching the
// `heap?: { [objId]: HeapObject }` frame shape already used by python.worker.js and
// iframeRunner.js). The object graph renderer in traceVisualizer.js (Session 2) picks this up
// automatically - no renderer changes needed. JDK objects (java.*/javax.*/sun.* packages,
// Collections, Maps, enums, arrays - already handled by earlier branches) are excluded from
// reflection and keep the old toString()-only fallback.
//
// Documented limitations (Path B, not Path A):
//  - Comments and string literals are not stripped before method-signature matching; unusual
//   code that has method-like patterns inside a string may be wrongly matched.
//  - `return` inside a string literal will be wrapped (harmless - the string is still valid Java;
//   the wrapper is just dead code at runtime, so no test-correctness issue, just extra frames).
//  - Only method-level tracing (call + return); no per-statement line events.
//  - Methods inside inner classes and anonymous classes are traced but the class context is not
//   reflected in the func name in the trace - only the method name appears.
//  - Return-value capture uses a generic static passthrough (__CasTrace.__traceRet), not a
//   `var` temp-variable - compilation now runs under CheerpJ's Java 8 mode (see
//   javaRunner.js), so `var` (Java 10+) isn't available; the generic passthrough works under
//   any source level and is simpler besides (single expression, no temp-variable statement).
//  - Reflection field access uses setAccessible(true); a field that throws under CheerpJ's
//   security model is silently skipped rather than failing the whole trace.
//
// Usage:
//  import { instrumentForTrace } from './javaInstrumenter'
//  const r = instrumentForTrace(sourceCode)
//  if (r.ok) compileAndRun(r.instrumented) // includes __CasTrace class
//  else fallback to plain run
//
// Return shape: { ok: boolean, instrumented?: string, error?: string }

// Matches Java method declarations (non-abstract, non-interface-default stubs).
// Group 1: modifiers Group 2: return type Group 3: method name Group 4: param list
// Uses a single trailing `\{` to anchor the match to the opening brace of the body.
const METHOD_RE =
  /\b((?:(?:public|private|protected|static|final|synchronized|native|default)\s+)*)(\w[\w$]*(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,.<>]+?)?\s*\{/g

const MODIFIER_WORDS = new Set([
  'public',
  'private',
  'protected',
  'static',
  'final',
  'synchronized',
  'native',
  'default',
])

function parseParams(paramStr) {
  if (!paramStr.trim()) return []
  return paramStr
    .split(',')
    .map((p) => {
      p = p.trim().replace(/^(?:final\s+)?/, '')
      if (!p) return null
      const parts = p.split(/\s+/)
      if (parts.length < 2) return null
      // Strip varargs `...` from the last element before the name
      const name = parts[parts.length - 1].replace(/^\.\.\./, '').replace(/\[\]$/, '')
      if (!/^\w+$/.test(name)) return null
      return { name }
    })
    .filter(Boolean)
}

function namesValues(params) {
  const names = params.length
    ? 'new String[]{' + params.map((p) => `"${p.name}"`).join(', ') + '}'
    : 'new String[]{}'
  const values = params.length
    ? 'new Object[]{' + params.map((p) => p.name).join(', ') + '}'
    : 'new Object[]{}'
  return { names, values }
}

function buildTraceCall(lineNum, event, methodName, params) {
  const { names, values } = namesValues(params)
  return `__CasTrace.__trace(${lineNum}, "${event}", "${methodName}", ${names}, ${values});`
}

// Generic passthrough: evaluates `expr` exactly once, records the trace as a side effect, and
// returns the value unchanged - avoids needing a `var` temp-variable statement (Java 10+) to
// call __trace() before returning without double-evaluating the return expression.
function buildTraceRetExpr(lineNum, methodName, params, expr) {
  const { names, values } = namesValues(params)
  return `__CasTrace.__traceRet(${expr}, ${lineNum}, "return", "${methodName}", ${names}, ${values})`
}

// Walk forward from braceOpenPos counting braces. Skips string/char literals and
// block/line comments so embedded braces don't confuse the count.
function findBodyEnd(src, braceOpenPos) {
  let depth = 1
  let i = braceOpenPos + 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      i++
      continue
    }
    // String literal - skip to closing unescaped "
    if (ch === '"') {
      i++
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    // Char literal - skip to closing '
    if (ch === "'") {
      i++
      if (src[i] === '\\') i++
      i++ // the char
      i++ // closing '
      continue
    }
    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    i++
  }
  return i - 1 // position of the closing '}'
}

function lineOf(src, pos) {
  return src.substring(0, pos).split('\n').length
}

// If a method body opens with a super(...) or this(...) constructor-delegation call (skipping
// leading whitespace/comments), returns the index just past that call's terminating `;` within
// `body`; otherwise -1. Needed because Java requires such a call to be the literal first
// statement in a constructor - splicing the entry trace call in ahead of it (the previous,
// simpler behavior) made javac reject the program with "call to super must be first statement
// in constructor", and additionally made javac silently assume an implicit no-arg super() ahead
// of the inserted statement, which then fails to compile whenever the superclass has no no-arg
// constructor. Found by actually compiling a `Dog extends Animal` example with an explicit
// `super(name)` call, not by reading the Java language spec.
function findLeadingSuperOrThisCallEnd(body) {
  const n = body.length
  let i = 0
  while (i < n) {
    if (/\s/.test(body[i])) {
      i++
      continue
    }
    if (body[i] === '/' && body[i + 1] === '/') {
      while (i < n && body[i] !== '\n') i++
      continue
    }
    if (body[i] === '/' && body[i + 1] === '*') {
      i += 2
      while (i < n - 1 && !(body[i] === '*' && body[i + 1] === '/')) i++
      i += 2
      continue
    }
    break
  }
  const m = /^(?:super|this)\s*\(/.exec(body.slice(i))
  if (!m) return -1
  let j = i + m[0].length
  let depth = 1
  while (j < n && depth > 0) {
    const ch = body[j]
    if (ch === '(') {
      depth++
      j++
      continue
    }
    if (ch === ')') {
      depth--
      j++
      continue
    }
    if (ch === '"') {
      j++
      while (j < n && body[j] !== '"') {
        if (body[j] === '\\') j++
        j++
      }
      j++
      continue
    }
    if (ch === "'") {
      j++
      if (body[j] === '\\') j++
      j++
      j++
      continue
    }
    j++
  }
  while (j < n && body[j] !== ';') j++
  return j < n ? j + 1 : -1
}

// Instrument a single method body. Works on `result` (accumulated source string) using
// positions from the original source - safe because we process from last to first, so
// all positions of earlier methods are still valid when we touch this one.
function instrumentMethod(src, method) {
  const { name, returnType, params, bodyStart, bodyEnd, lineNum } = method
  const ind = '    ' // 8-space indent; works for both 2- and 4-space indented files

  const callTrace = `\n${ind}${buildTraceCall(lineNum, 'call', name, params)}`
  const rawBody = src.substring(bodyStart + 1, bodyEnd)

  // Keep a leading super(...)/this(...) call untouched ahead of the entry trace so it stays
  // the constructor's first statement; everything else is instrumented as before.
  const superEnd = findLeadingSuperOrThisCallEnd(rawBody)
  const bodyPrefix = superEnd >= 0 ? rawBody.slice(0, superEnd) : ''
  let body = superEnd >= 0 ? rawBody.slice(superEnd) : rawBody

  if (returnType === 'void') {
    // Wrap each `return;` with a trace call immediately before it.
    body = body.replace(
      /\breturn\s*;/g,
      `{ ${buildTraceCall(lineNum, 'return', name, params)} return; }`,
    )
    // Also inject a trace just before the fall-through closing } so void methods that
    // simply fall off the end (no explicit return) still get a return event.
    body = body + `\n${ind}${buildTraceCall(lineNum, 'return', name, params)}`
  } else {
    // Non-void: route `return <expr>;` through a generic passthrough (__CasTrace.__traceRet)
    // that evaluates expr once, records the trace, and returns the value unchanged - no temp
    // variable needed, so no `var` (Java 10+) dependency.
    // The regex is non-greedy (.+?) on a single line; multi-line returns are rare in teaching
    // code and won't be wrapped (they still compile and run, just without a return trace).
    body = body.replace(/\breturn ((?:[^;{]|\{[^}]*\})+?);/g, (_, expr) => {
      const stripped = expr.trim()
      return `return ${buildTraceRetExpr(lineNum, name, params, stripped)};`
    })
  }

  // Inject __CasTrace.__flush() before the closing } of `main` so the trace file is written
  // even if the program never calls System.exit explicitly.
  const flushInject = name === 'main' ? `\n${ind}__CasTrace.__flush();` : ''

  return (
    src.substring(0, bodyStart + 1) +
    bodyPrefix +
    callTrace +
    body +
    flushInject +
    src.substring(bodyEnd)
  )
}

// ─── __CasTrace helper class ──────────────────────────────────────────────────
// Written as String.raw so backslash sequences (e.g. \" inside Java string literals)
// are preserved verbatim - the outer JS template literal would otherwise consume them.
const CAS_TRACE_CLASS = String.raw`
class __CasTrace {
  static final java.util.List<String> __frames = new java.util.ArrayList<>();
  static boolean __truncated = false;
  static final int __MAX = 2000;

  // Session 7: reflection-based heap capture. __objIds assigns stable integer ids to
  // user-defined object instances (IdentityHashMap so equals()/hashCode() overrides on
  // user classes cannot collide two different objects into the same id). __curHeap is
  // rebuilt fresh at the start of every __trace() call and holds a flat oid -> object
  // snapshot for whichever user objects were reachable from this call's locals.
  static final java.util.Map<Object, Integer> __objIds = new java.util.IdentityHashMap<>();
  static int __objCtr = 0;
  static final java.util.Map<Integer, String> __curHeap = new java.util.LinkedHashMap<>();

  public static void __trace(int line, String event, String func,
                String[] names, Object[] values) {
    if (__frames.size() >= __MAX) { __truncated = true; return; }
    __curHeap.clear();
    StringBuilder sb = new StringBuilder();
    sb.append("{\"event\":\"").append(event)
     .append("\",\"func\":\"").append(func)
     .append("\",\"line\":").append(line)
     .append(",\"locals\":{");
    int len = Math.min(names.length, values.length);
    for (int i = 0; i < len; i++) {
      if (i > 0) sb.append(",");
      sb.append("\"").append(names[i]).append("\":");
      sb.append(__classify(values[i]));
    }
    sb.append("},\"ret\":null");
    if (!__curHeap.isEmpty()) {
      sb.append(",\"heap\":{");
      boolean __firstHeap = true;
      for (java.util.Map.Entry<Integer, String> __he : __curHeap.entrySet()) {
        if (!__firstHeap) sb.append(",");
        sb.append("\"").append(__he.getKey()).append("\":").append(__he.getValue());
        __firstHeap = false;
      }
      sb.append("}");
    }
    sb.append("}");
    __frames.add(sb.toString());
  }

  // Generic passthrough used for instrumented return-expression sites: records the trace as
  // a side effect and returns value unchanged, so the call site doesn't need a temp variable
  // (and doesn't need var, which the Java 8 language level used here doesn't have).
  public static <T> T __traceRet(T value, int line, String event, String func,
                  String[] names, Object[] values) {
    __trace(line, event, func, names, values);
    return value;
  }

  private static String __classify(Object v) {
    return __classify(v, 0, __newSeenSet());
  }

  private static java.util.Set<Object> __newSeenSet() {
    return java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Object, Boolean>());
  }

  private static java.util.Set<Object> __seenWith(java.util.Set<Object> seen, Object v) {
    java.util.Set<Object> next = __newSeenSet();
    next.addAll(seen);
    next.add(v);
    return next;
  }

  // Heuristic for "is this a user-defined object we should reflect into" - mirrors
  // python.worker.js's _is_obj(): exclude containers (handled by their own branches above)
  // and anything from the java.*/javax.*/sun.* packages, since walking JDK internals via
  // reflection is noisy and not useful for teaching OOP.
  private static boolean __isUserObject(Object v) {
    if (v == null) return false;
    Class<?> c = v.getClass();
    if (c.isArray() || c.isEnum()) return false;
    if (v instanceof java.util.Collection || v instanceof java.util.Map) return false;
    Package pkg = c.getPackage();
    String pkgName = (pkg != null) ? pkg.getName() : "";
    return !(pkgName.startsWith("java.") || pkgName.startsWith("javax.") || pkgName.startsWith("sun."));
  }

  private static int __getOid(Object v) {
    Integer oid = __objIds.get(v);
    if (oid == null) {
      oid = __objCtr++;
      __objIds.put(v, oid);
    }
    return oid;
  }

  // Walks a class's declared instance fields up through its superclass chain (stopping at
  // Object), skipping static and synthetic fields, capped at 20 fields total - matches
  // python.worker.js's _classify_local field cap.
  private static java.util.List<java.lang.reflect.Field> __collectFields(Class<?> c) {
    java.util.List<java.lang.reflect.Field> out = new java.util.ArrayList<>();
    while (c != null && c != Object.class) {
      for (java.lang.reflect.Field f : c.getDeclaredFields()) {
        if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
        if (f.isSynthetic()) continue;
        out.add(f);
        if (out.size() >= 20) return out;
      }
      c = c.getSuperclass();
    }
    return out;
  }

  private static String __classify(Object v, int depth, java.util.Set<Object> seen) {
    if (v == null) return "{\"k\":\"none\",\"r\":\"null\"}";
    if (v instanceof Boolean) return "{\"k\":\"bool\",\"r\":\"" + v + "\"}";
    if (v instanceof Byte || v instanceof Short ||
      v instanceof Integer || v instanceof Long)
      return "{\"k\":\"int\",\"r\":\"" + v + "\"}";
    if (v instanceof Float || v instanceof Double)
      return "{\"k\":\"float\",\"r\":\"" + v + "\"}";
    if (v instanceof Character)
      return "{\"k\":\"str\",\"r\":\"'" + v + "'\"}";
    if (v instanceof String) {
      String s = ((String) v)
        .replace("\\", "\\\\").replace("\"", "\\\"")
        .replace("\n", "\\n").replace("\r", "\\r");
      if (s.length() > 100) s = s.substring(0, 100) + "...";
      return "{\"k\":\"str\",\"r\":\"\\\"" + s + "\\\"\"}";
    }
    if (v instanceof int[]) {
      int[] a = (int[]) v;
      int cap = Math.min(a.length, 50);
      StringBuilder sb = new StringBuilder("[");
      for (int i = 0; i < cap; i++) {
        if (i > 0) sb.append(",");
        sb.append("\"").append(a[i]).append("\"");
      }
      if (a.length > cap) sb.append(",\"...\"");
      sb.append("]");
      String r = java.util.Arrays.toString(a)
        .replace("\"", "\\\"");
      return "{\"k\":\"list\",\"r\":\"" + r + "\",\"items\":" + sb + "}";
    }
    if (v instanceof long[]) {
      long[] a = (long[]) v;
      int cap = Math.min(a.length, 50);
      StringBuilder sb = new StringBuilder("[");
      for (int i = 0; i < cap; i++) {
        if (i > 0) sb.append(",");
        sb.append("\"").append(a[i]).append("\"");
      }
      if (a.length > cap) sb.append(",\"...\"");
      sb.append("]");
      String r = java.util.Arrays.toString(a).replace("\"", "\\\"");
      return "{\"k\":\"list\",\"r\":\"" + r + "\",\"items\":" + sb + "}";
    }
    if (v instanceof double[]) {
      double[] a = (double[]) v;
      int cap = Math.min(a.length, 50);
      StringBuilder sb = new StringBuilder("[");
      for (int i = 0; i < cap; i++) {
        if (i > 0) sb.append(",");
        sb.append("\"").append(a[i]).append("\"");
      }
      if (a.length > cap) sb.append(",\"...\"");
      sb.append("]");
      String r = java.util.Arrays.toString(a).replace("\"", "\\\"");
      return "{\"k\":\"list\",\"r\":\"" + r + "\",\"items\":" + sb + "}";
    }
    if (v instanceof Object[]) {
      Object[] a = (Object[]) v;
      int cap = Math.min(a.length, 30);
      StringBuilder sb = new StringBuilder("[");
      for (int i = 0; i < cap; i++) {
        if (i > 0) sb.append(",");
        String rep = (a[i] == null ? "null" : a[i].toString())
          .replace("\\", "\\\\").replace("\"", "\\\"");
        if (rep.length() > 40) rep = rep.substring(0, 40) + "...";
        sb.append("\"").append(rep).append("\"");
      }
      if (a.length > cap) sb.append(",\"...\"");
      sb.append("]");
      return "{\"k\":\"list\",\"r\":\"" + v.toString().replace("\"","\\\"") + "\",\"items\":" + sb + "}";
    }
    if (__isUserObject(v)) {
      int oid = __getOid(v);
      String cls = v.getClass().getSimpleName();
      if (seen.contains(v)) {
        return "{\"k\":\"ref\",\"r\":\"<" + cls + " #" + oid + ">\",\"oid\":" + oid + "}";
      }
      String r;
      try {
        r = v.toString();
      } catch (Exception e) {
        r = "<" + cls + " #" + oid + ">";
      }
      r = r.replace("\\", "\\\\").replace("\"", "\\\"")
         .replace("\n", "\\n").replace("\r", "\\r");
      if (r.length() > 120) r = r.substring(0, 120) + "...";
      StringBuilder fieldsJson = new StringBuilder();
      if (depth < 5) {
        java.util.Set<Object> nextSeen = __seenWith(seen, v);
        int count = 0;
        for (java.lang.reflect.Field f : __collectFields(v.getClass())) {
          Object fv;
          try {
            f.setAccessible(true);
            fv = f.get(v);
          } catch (Exception e) {
            continue;
          }
          if (count > 0) fieldsJson.append(",");
          fieldsJson.append("\"").append(f.getName()).append("\":")
            .append(__classify(fv, depth + 1, nextSeen));
          count++;
        }
      }
      StringBuilder entry = new StringBuilder();
      entry.append("{\"k\":\"obj\",\"r\":\"").append(r).append("\",\"oid\":").append(oid)
         .append(",\"cls\":\"").append(cls).append("\"");
      if (fieldsJson.length() > 0) entry.append(",\"fields\":{").append(fieldsJson).append("}");
      entry.append("}");
      StringBuilder heapEntry = new StringBuilder();
      heapEntry.append("{\"cls\":\"").append(cls).append("\",\"r\":\"").append(r).append("\"");
      if (fieldsJson.length() > 0) heapEntry.append(",\"fields\":{").append(fieldsJson).append("}");
      heapEntry.append("}");
      __curHeap.put(oid, heapEntry.toString());
      return entry.toString();
    }
    // Generic object: use toString, escape JSON special chars
    String r = v.toString()
      .replace("\\", "\\\\").replace("\"", "\\\"")
      .replace("\n", "\\n");
    if (r.length() > 120) r = r.substring(0, 120) + "...";
    return "{\"k\":\"obj\",\"r\":\"" + r + "\"}";
  }

  public static void __flush() {
    try {
      java.io.FileWriter w = new java.io.FileWriter("/files/cas_trace.json");
      w.write("{\"frames\":[");
      for (int i = 0; i < __frames.size(); i++) {
        if (i > 0) w.write(",");
        w.write(__frames.get(i));
      }
      w.write("],\"truncated\":" + __truncated + "}");
      w.close();
    } catch (Exception ignored) {
      // If we can't write the trace file (e.g. /files/ not mounted), silently
      // skip - the main program output is unaffected.
    }
  }
}
`

// Matches a class/interface/enum header so constructors can be found within a known class's
// own name and brace range. Doesn't handle anonymous classes or interfaces with default methods
// acting as pseudo-constructors - out of scope, those aren't constructors.
const CLASS_RE =
  /\bclass\s+(\w[\w$]*)(?:\s+extends\s+[\w$.<>,\s]+)?(?:\s+implements\s+[\w$.<>,\s]+)?\s*\{/g

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// METHOD_RE requires two identifiers before `(` (return type + name); a constructor only has
// one (the class name), so it's invisible to METHOD_RE unless a modifier happens to be present
// (in which case it matches by accident, with the modifier mis-captured as the "return type" -
// harmless since the name still comes out right, but it means a no-modifier constructor like
// `Node(int val) { ... }` is silently skipped entirely). This finds constructors explicitly,
// scoped to each class's own name and brace range, and skips any that METHOD_RE already caught
// (by bracePos) so a modifier-present constructor never gets instrumented twice.
function findConstructors(source, existingBracePositions) {
  const found = []
  CLASS_RE.lastIndex = 0
  let cm
  while ((cm = CLASS_RE.exec(source)) !== null) {
    const className = cm[1]
    const classBraceStart = cm.index + cm[0].length - 1
    const classBraceEnd = findBodyEnd(source, classBraceStart)
    const ctorRe = new RegExp(
      '\\b(?:(?:public|private|protected)\\s+)?' +
        escapeRegex(className) +
        '\\s*\\(([^)]*)\\)\\s*\\{',
      'g',
    )
    let m
    while ((m = ctorRe.exec(source)) !== null) {
      const bracePos = m.index + m[0].length - 1
      if (bracePos <= classBraceStart || bracePos >= classBraceEnd) continue // outside this class
      if (existingBracePositions.has(bracePos)) continue // already matched by METHOD_RE
      existingBracePositions.add(bracePos)
      found.push({
        name: className,
        returnType: 'void', // constructors can only have bare `return;`, same shape as a void method
        params: parseParams(m[1]),
        bodyStart: bracePos,
        bodyEnd: findBodyEnd(source, bracePos),
        lineNum: lineOf(source, m.index),
      })
    }
  }
  return found
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function instrumentForTrace(source) {
  try {
    const methods = []
    const bracePositions = new Set()
    METHOD_RE.lastIndex = 0
    let m
    while ((m = METHOD_RE.exec(source)) !== null) {
      const returnType = m[2]
      const methodName = m[3]
      const paramStr = m[4]
      // The regex ends with `\{`; bodyStart is the position of that `{`.
      const bracePos = m.index + m[0].length - 1
      const bodyEnd = findBodyEnd(source, bracePos)
      const ln = lineOf(source, m.index)
      bracePositions.add(bracePos)
      methods.push({
        name: methodName,
        returnType,
        params: parseParams(paramStr),
        bodyStart: bracePos,
        bodyEnd,
        lineNum: ln,
      })
    }

    // A constructor with a modifier (e.g. `public Holder(Node n) { ... }`) only matches
    // METHOD_RE by regex-backtracking accident: with no return type present, the modifier
    // itself gets captured into the "return type" group (m[2] = "public"), while the method
    // name (m[3]) still comes out correct. This means instrumentMethod's `returnType === 'void'`
    // check fails for these entries even though a constructor can only ever have a bare
    // `return;` - identical in shape to a void method - so a constructor with no explicit return
    // statement silently got NO return trace appended at all (found by actually compiling and
    // running a two-constructor test program, not by reading the regex). Fix: any METHOD_RE
    // entry whose name matches a known class name and whose "return type" is actually one of the
    // modifier keywords is a mis-parsed constructor - force its returnType to 'void'.
    const classNames = new Set()
    CLASS_RE.lastIndex = 0
    let cm
    while ((cm = CLASS_RE.exec(source)) !== null) classNames.add(cm[1])
    for (const method of methods) {
      if (classNames.has(method.name) && MODIFIER_WORDS.has(method.returnType)) {
        method.returnType = 'void'
      }
    }

    methods.push(...findConstructors(source, bracePositions))

    if (methods.length === 0) return { ok: false }

    // Constructors are appended after the METHOD_RE pass regardless of where they sit in the
    // file, so the array is no longer guaranteed sorted by position - sort explicitly before the
    // last-to-first processing below, which depends on strictly descending bodyStart order.
    methods.sort((a, b) => a.bodyStart - b.bodyStart)

    // Process from last to first: insertions happen at higher offsets first, so lower-offset
    // methods' positions remain valid in the accumulated result string.
    let result = source
    for (let i = methods.length - 1; i >= 0; i--) {
      result = instrumentMethod(result, methods[i])
    }

    return { ok: true, instrumented: result + '\n' + CAS_TRACE_CLASS }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

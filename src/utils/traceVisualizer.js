export function buildTraceSrcdoc(traceJson, code) {
  const safeTrace = JSON.stringify(traceJson)
  const safeCode = JSON.stringify(code)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#1e1e2e;color:#cdd6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;height:100vh;overflow:hidden;display:flex;flex-direction:column;}

#root{display:flex;flex:1;overflow:hidden;}
#left{width:188px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;overflow:hidden;transition:width 0.15s ease;}
#left.collapsed{width:30px;}
#left.collapsed #left-body,#left.collapsed .params-tip{display:none;}
#left-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;}
#right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}

#mode-bar{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}
.mode-btn{background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;transition:all 0.15s;letter-spacing:0.3px;}
.mode-btn.active{background:rgba(203,166,247,0.15);border-color:rgba(203,166,247,0.45);color:#cba6f7;}
.mode-btn:hover:not(.active){border-color:rgba(255,255,255,0.25);color:rgba(255,255,255,0.65);}

.ph{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(255,255,255,0.25);padding:8px 10px 7px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;}
.ph-toggle{font-size:13px;opacity:0.45;}
.ph-toggle:hover{opacity:0.9;}

.p-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 9px;}
.p-name{font-size:10px;color:rgba(255,255,255,0.38);margin-bottom:3px;font-weight:500;}
.p-cur{font-size:18px;font-weight:700;color:#cba6f7;margin-bottom:6px;font-variant-numeric:tabular-nums;line-height:1;}
.p-range{width:100%;accent-color:#cba6f7;cursor:ew-resize;display:block;margin-bottom:4px;}
.p-num{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:4px 7px;outline:none;display:block;}
.p-num:focus,.p-str:focus{border-color:rgba(203,166,247,0.55);}
.p-str{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:5px 7px;outline:none;display:block;}
.empty-hint{font-size:11px;color:rgba(255,255,255,0.2);font-style:italic;line-height:1.7;padding:2px 0;}
.params-tip{font-size:10px;color:rgba(255,255,255,0.14);text-align:center;padding:7px 8px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.05);line-height:1.6;}

#trunc-banner{display:none;background:rgba(249,226,175,0.12);color:#f9e2af;font-size:11px;padding:6px 12px;border-bottom:1px solid rgba(249,226,175,0.25);flex-shrink:0;}

#step-view{flex:1;display:flex;flex-direction:column;overflow:hidden;}

#step-header{padding:9px 12px 7px;flex-shrink:0;}
#step-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 9px;border-radius:20px;margin-bottom:7px;}
#step-badge.call{background:rgba(166,227,161,0.15);color:#a6e3a1;border:1px solid rgba(166,227,161,0.3);}
#step-badge.return{background:rgba(249,226,175,0.15);color:#f9e2af;border:1px solid rgba(249,226,175,0.3);}
#step-badge.line{background:rgba(137,180,250,0.13);color:#89b4fa;border:1px solid rgba(137,180,250,0.28);}
#step-badge.swap{background:rgba(243,139,168,0.16);color:#f38ba8;border:1px solid rgba(243,139,168,0.35);box-shadow:0 0 12px rgba(243,139,168,0.25);}
#step-badge.compare{background:rgba(148,226,213,0.14);color:#94e2d5;border:1px solid rgba(148,226,213,0.3);}
#step-badge.loop{background:rgba(203,166,247,0.14);color:#cba6f7;border:1px solid rgba(203,166,247,0.3);}
#step-desc{font-size:13px;font-weight:500;color:rgba(255,255,255,0.82);line-height:1.45;min-height:18px;font-family:'Fira Code',Consolas,monospace;}
#step-counter-line{display:flex;align-items:center;gap:8px;margin-top:7px;}
#step-count-text{font-size:10px;color:rgba(255,255,255,0.3);font-variant-numeric:tabular-nums;white-space:nowrap;}
#prog-bar{flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;cursor:pointer;}
#prog-fill{height:100%;background:linear-gradient(90deg,#89b4fa,#cba6f7);border-radius:2px;transition:width 0.15s ease;pointer-events:none;}
#step-dots{display:flex;flex-wrap:nowrap;gap:3px;overflow-x:auto;margin-top:8px;padding-bottom:2px;}
.step-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,0.12);cursor:pointer;transition:transform 0.12s,background 0.12s;}
.step-dot:hover{transform:scale(1.5);}
.step-dot.active{transform:scale(1.7);background:#cdd6f4 !important;}
.step-dot-call{background:rgba(166,227,161,0.45);}
.step-dot-return{background:rgba(249,226,175,0.45);}
.step-dot-line{background:rgba(137,180,250,0.3);}
.step-dot-swap{background:rgba(243,139,168,0.7);}
.step-dot-compare{background:rgba(148,226,213,0.5);}
.step-dot-loop{background:rgba(203,166,247,0.5);}

#main-row{flex:1;display:flex;overflow:hidden;min-height:0;}

#source-panel{width:clamp(230px,23%,520px);flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);overflow-y:auto;padding:10px 0;}
.src-line{display:flex;align-items:baseline;gap:9px;padding:2.5px 14px;line-height:1.7;border-left:2px solid transparent;transition:background 0.15s,border-color 0.15s;}
.src-line.src-active{background:linear-gradient(90deg,rgba(137,180,250,0.16),rgba(137,180,250,0.03));border-left:2px solid #89b4fa;box-shadow:inset 0 0 18px rgba(137,180,250,0.12);}
.src-ln{color:rgba(255,255,255,0.18);min-width:22px;text-align:right;user-select:none;flex-shrink:0;font-size:11px;font-family:'Fira Code',Consolas,monospace;}
.src-txt{color:rgba(255,255,255,0.45);white-space:pre;font-family:'Fira Code',Consolas,monospace;font-size:12.5px;}
.src-active .src-txt{color:#eef1fb;text-shadow:0 0 14px rgba(137,180,250,0.35);}

#canvas-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
#stack-breadcrumb{padding:9px 18px;font-size:12px;font-family:'Fira Code',Consolas,monospace;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap;overflow-x:auto;flex-shrink:0;color:rgba(255,255,255,0.5);}
.bc-sep{color:rgba(255,255,255,0.18);margin:0 6px;}
.bc-active{font-weight:700;}

#anim-canvas{
  flex:1;position:relative;overflow:auto;padding:clamp(18px,3vw,40px);display:flex;flex-wrap:wrap;align-content:flex-start;gap:clamp(14px,1.6vw,26px);
  background-image:radial-gradient(rgba(255,255,255,0.05) 1px,transparent 1px);
  background-size:24px 24px;
}
.canvas-empty{color:rgba(255,255,255,0.2);font-style:italic;font-size:13px;padding:20px;width:100%;text-align:center;}

@keyframes frame-enter{from{opacity:0.3;transform:translateY(-4px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
.var-card{background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.09);border-radius:9px;width:clamp(130px,11%,210px);flex-shrink:0;overflow:hidden;animation:frame-enter 0.2s ease-out;box-shadow:0 4px 18px rgba(0,0,0,0.22);backdrop-filter:blur(2px);}
.vc-head{font-size:10.5px;color:rgba(255,255,255,0.42);background:rgba(255,255,255,0.035);padding:7px 10px;cursor:grab;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);letter-spacing:0.2px;}
.vc-head:active{cursor:grabbing;}
.vc-close{cursor:pointer;opacity:0.35;font-size:12px;padding:0 2px;}
.vc-close:hover{opacity:0.9;}
.vc-val{padding:12px 10px;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;word-break:break-all;font-family:'Fira Code',Consolas,monospace;}

.arr-card{width:auto;max-width:100%;}
.arr-card .vc-head{background:linear-gradient(90deg,rgba(250,179,135,0.12),rgba(255,255,255,0.02));}
.arr-row{display:flex;padding:12px;gap:6px;overflow-x:auto;}
.arr-box{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:5px 12px;min-width:34px;flex-shrink:0;transition:background 0.15s,border-color 0.15s;position:relative;}
.arr-box.arr-swapping{z-index:8;box-shadow:0 8px 22px rgba(0,0,0,0.45);}
.arr-idx{font-size:9px;color:rgba(255,255,255,0.25);}
.arr-val{font-size:16px;font-weight:600;color:#cdd6f4;font-variant-numeric:tabular-nums;font-family:'Fira Code',Consolas,monospace;}
.arr-box.arr-changed{background:rgba(166,227,161,0.2);border-color:rgba(166,227,161,0.55);animation:box-pulse 0.4s ease;}
.arr-box.arr-hl{border-color:#cba6f7;box-shadow:0 0 0 1px rgba(203,166,247,0.45),0 0 16px rgba(203,166,247,0.3);}
@keyframes box-pulse{0%{transform:scale(1.25);}100%{transform:scale(1);}}

#vars-panel{width:clamp(150px,14%,260px);flex-shrink:0;border-left:1px solid rgba(255,255,255,0.07);overflow-y:auto;display:flex;flex-direction:column;}
#vars-list{padding:6px 0;}
.var-row{display:flex;gap:6px;font-family:'Fira Code',Consolas,monospace;font-size:11.5px;padding:4px 12px;line-height:1.75;flex-wrap:wrap;}
.var-row-k{color:rgba(255,255,255,0.4);}
.var-row-eq{color:rgba(255,255,255,0.18);}
.vars-empty{color:rgba(255,255,255,0.2);font-style:italic;font-size:11px;padding:14px 10px;text-align:center;}

#step-controls{padding:7px 12px 9px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.06);}
#ctrl-row{display:flex;align-items:center;gap:5px;margin-bottom:5px;}
.ctrl-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;padding:5px 10px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
.ctrl-btn:hover:not(:disabled){background:rgba(255,255,255,0.12);color:#fff;}
.ctrl-btn:disabled{opacity:0.22;cursor:default;}
#btn-play{background:rgba(166,227,161,0.12);border-color:rgba(166,227,161,0.3);color:#a6e3a1;flex:1;justify-content:center;}
#btn-play:hover:not(:disabled){background:rgba(166,227,161,0.2);}
#btn-play.playing{background:rgba(249,226,175,0.12);border-color:rgba(249,226,175,0.3);color:#f9e2af;}
#speed-select{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.45);font-size:11px;padding:4px 6px;outline:none;cursor:pointer;}
.kbd-hint{font-size:10px;color:rgba(255,255,255,0.15);text-align:center;letter-spacing:0.2px;}
.kbd{display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:3px;padding:0 4px;font-size:9.5px;color:rgba(255,255,255,0.3);}

#flow-view{flex:1;display:none;flex-direction:column;overflow:hidden;}
#flow-view.visible{display:flex;}
#flow-scroll{flex:1;overflow-y:auto;padding:10px;}
.tile{border:1px solid rgba(255,255,255,0.07);border-left:3px solid;border-radius:0 5px 5px 0;padding:6px 10px;margin-bottom:3px;transition:background 0.1s;}
.tile.clickable{cursor:pointer;}
.tile.clickable:hover{background:rgba(255,255,255,0.04);}
.t-row{display:flex;align-items:center;gap:7px;}
.t-ev{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;width:28px;flex-shrink:0;}
.t-fn{font-family:'Fira Code',Consolas,monospace;font-size:13px;font-weight:600;}
.t-arrow{font-size:9px;color:rgba(255,255,255,0.2);margin-left:2px;transition:transform 0.15s;display:inline-block;}
.tile.open .t-arrow{transform:rotate(90deg);}
.t-ret{margin-left:auto;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.28);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.t-ln{font-size:10px;color:rgba(255,255,255,0.18);white-space:nowrap;margin-left:4px;}
.t-locals{display:none;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.05);font-family:monospace;font-size:11px;line-height:1.8;}
.tile.open .t-locals{display:block;}
.tl-k{color:rgba(255,255,255,0.38);}

.empty-state{padding:24px 12px;text-align:center;color:rgba(255,255,255,0.2);font-size:12px;font-style:italic;line-height:1.8;}
</style>
</head>
<body>
<div id="root">

  <div id="left">
    <div class="ph" id="params-header"><span>Parameters</span><span class="ph-toggle" id="left-toggle-btn">&minus;</span></div>
    <div id="left-body">
      <div id="param-list"></div>
    </div>
    <div class="params-tip">Edit to re-run with<br>new parameters</div>
  </div>

  <div id="right">
    <div id="mode-bar">
      <button class="mode-btn active" id="btn-mode-step">&#9654; Step</button>
      <button class="mode-btn" id="btn-mode-flow">&#11200; Flow</button>
    </div>
    <div id="trunc-banner">&#9888; Trace truncated at 2000 steps &mdash; this run produced more steps than the visualizer can capture</div>

    <div id="step-view">
      <div id="step-header">
        <div id="step-badge" class="call">CALL</div>
        <div id="step-desc">Run your code to begin</div>
        <div id="step-counter-line">
          <span id="step-count-text">- / -</span>
          <div id="prog-bar"><div id="prog-fill" style="width:0%"></div></div>
        </div>
        <div id="step-dots"></div>
      </div>

      <div id="main-row">
        <div id="source-panel"><div id="code-ctx"></div></div>
        <div id="canvas-wrap">
          <div id="stack-breadcrumb"></div>
          <div id="anim-canvas"></div>
        </div>
        <div id="vars-panel">
          <div class="ph"><span>Variables</span></div>
          <div id="vars-list"></div>
        </div>
      </div>

      <div id="step-controls">
        <div id="ctrl-row">
          <button class="ctrl-btn" id="btn-prev" disabled>&#9664; Prev</button>
          <button class="ctrl-btn" id="btn-play" disabled>&#9654; Play</button>
          <button class="ctrl-btn" id="btn-next" disabled>Next &#9654;</button>
          <select id="speed-select" title="Speed">
            <option value="900">0.5x</option>
            <option value="500" selected>1x</option>
            <option value="280">2x</option>
            <option value="100">4x</option>
          </select>
        </div>
        <div class="kbd-hint">
          <span class="kbd">&#8592;</span> <span class="kbd">&#8594;</span> step &nbsp; <span class="kbd">Space</span> play/pause &nbsp; drag a card's header to move it
        </div>
      </div>
    </div>

    <div id="flow-view">
      <div class="ph"><span>Call Tree</span><span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(255,255,255,0.14);">click a tile to inspect locals</span></div>
      <div id="flow-scroll"><div id="call-tree"></div></div>
    </div>
  </div>

</div>
<script>
var payload = JSON.parse(${safeTrace});
var trace = payload.frames || [];
var truncated = !!payload.truncated;
var src = ${safeCode};

var PALETTE = ['#89b4fa','#cba6f7','#a6e3a1','#fab387','#f38ba8','#94e2d5','#f9e2af','#b4befe','#eba0ac'];
var cmap = {}, ci = 0;
function col(name) { if (!cmap[name]) cmap[name] = PALETTE[ci++ % PALETTE.length]; return cmap[name]; }

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var KIND_COLOR = {
  int:'#89b4fa', float:'#89b4fa', str:'#a6e3a1', bool:'#fab387', none:'#f38ba8',
  fn:'#cba6f7', method:'#cba6f7', list:'#fab387', tuple:'#fab387', dict:'#f9e2af', obj:'#cdd6f4'
};
function kindColor(k) { return KIND_COLOR[k] || '#cdd6f4'; }

function shortLabel(entry) {
  if (!entry) return 'None';
  var r = entry.r, k = entry.k;
  if (k === 'str') {
    var inner = r.length >= 2 ? r.slice(1, -1) : r;
    return inner.length > 22 ? '"' + inner.slice(0,22) + '…"' : r;
  }
  if (k === 'list' || k === 'tuple' || k === 'dict') {
    return r.length > 24 ? r.slice(0,24) + '…' : r;
  }
  if (k === 'fn') {
    var m = r.match(/^<function (\\w+)/);
    return 'fn ' + (m ? m[1] : 'anon');
  }
  return r.length > 28 ? r.slice(0,28) + '…' : r;
}

// Builds a step entry for every traced event (call / line / return), tracking the live
// call stack so each step carries a breadcrumb of which frames are active and which is current.
function computeSteps(frames) {
  var steps = [], stack = [];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    if (f.event === 'call') {
      stack.push({ func: f.func, line: f.line });
    } else if (f.event === 'line') {
      if (stack.length) stack[stack.length-1].line = f.line;
      else stack.push({ func: f.func, line: f.line });
    }
    steps.push({
      type: f.event, func: f.func, line: f.line,
      locals: f.locals || {}, ret: f.ret || null,
      stack: stack.map(function(s){ return { func: s.func, line: s.line }; }),
      activeIdx: stack.length - 1
    });
    if (f.event === 'return') stack.pop();
  }
  return steps;
}

// Most real swaps (e.g. the classic temp = a; a = b; b = temp pattern) are spread across
// several consecutive 'line' steps, so only ONE array index actually changes per step — a
// naive "diff against the immediately previous step" never sees two indices change at once.
// This does a single forward pass over the whole trace, keeping a per-array "baseline"
// snapshot that only advances once a change has fully settled: a single changed index means
// "mid-swap, keep waiting"; two changed indices forming a clean swap relative to the baseline
// means "swap complete, narrate + animate it on this step"; anything else just resyncs the
// baseline. Precomputed once so it works correctly regardless of which order the user steps
// through afterward (forward, backward, or jumping via the dot timeline).
function precomputeSwaps() {
  var result = new Array(steps.length).fill(null);
  var baseline = {};
  for (var i = 0; i < steps.length; i++) {
    var locals = steps[i].locals;
    var names = Object.keys(locals);
    for (var ni = 0; ni < names.length; ni++) {
      var nm = names[ni];
      var e = locals[nm];
      if (e.k !== 'list' && e.k !== 'tuple' || !e.items) continue;
      if (!Object.prototype.hasOwnProperty.call(baseline, nm)) {
        baseline[nm] = e.items.slice();
        continue;
      }
      var base = baseline[nm];
      if (base.length !== e.items.length) { baseline[nm] = e.items.slice(); continue; }
      var changed = [];
      for (var k = 0; k < e.items.length; k++) {
        if (base[k] !== e.items[k]) changed.push(k);
      }
      if (changed.length === 0) continue;
      if (changed.length === 1) continue; // mid-swap — keep the old baseline and wait
      if (changed.length === 2 && base[changed[0]] === e.items[changed[1]] && base[changed[1]] === e.items[changed[0]]) {
        result[i] = { name: nm, pair: [changed[0], changed[1]] };
      }
      baseline[nm] = e.items.slice();
    }
  }
  return result;
}

// Resolves a simple index expression ("j", "j + 1", "3") against the current locals.
// Heuristic, source-text based — same caveat class as detectHighlightedIndices.
function resolveIndexExpr(expr, locals) {
  expr = expr.trim();
  if (/^\\d+$/.test(expr)) return parseInt(expr, 10);
  var m = expr.match(/^([a-zA-Z_]\\w*)\\s*([+-]\\s*\\d+)?$/);
  if (!m) return null;
  var base = locals[m[1]];
  if (!base || base.k !== 'int') return null;
  var n = parseInt(base.r, 10);
  if (m[2]) n += parseInt(m[2].replace(/\\s+/g, ''), 10);
  return n;
}

// Produces a higher-level "what just happened / what's about to happen" narration instead
// of just echoing the raw source line. Priority: a completed swap (diffed against the
// previous step) > an in-progress comparison on the active line > a loop re-entry > the
// raw line text as a fallback. Returns { text, kind } where kind drives badge color.
function observeStep(stepIdx) {
  var step = steps[stepIdx];

  if (step.type === 'call') {
    var caller = step.stack.length > 1 ? step.stack[step.stack.length-2].func+'()' : 'top level';
    return { text: 'Entering ' + step.func + '() from ' + caller, kind: 'call' };
  }
  if (step.type === 'return') {
    var callee = step.stack.length > 1 ? step.stack[step.stack.length-2].func+'()' : 'top level';
    return { text: step.func + '() → ' + shortLabel(step.ret) + ' (back to ' + callee + ')', kind: 'return' };
  }

  var swapHere = swapEvents[stepIdx];
  if (swapHere) {
    var arrNow = step.locals[swapHere.name];
    if (arrNow && arrNow.items) {
      return {
        text: 'Swapped ' + swapHere.name + '[' + swapHere.pair[0] + '] and ' + swapHere.name + '[' + swapHere.pair[1] + '] → now ' + arrNow.items[swapHere.pair[0]] + ' and ' + arrNow.items[swapHere.pair[1]],
        kind: 'swap'
      };
    }
  }

  var lineText = (src.split('\\n')[step.line-1] || '').trim();

  var cmp = lineText.match(/([a-zA-Z_]\\w*)\\s*\\[([^\\]]+)\\]\\s*(>=|<=|==|!=|>|<)\\s*([a-zA-Z_]\\w*)\\s*\\[([^\\]]+)\\]/);
  if (cmp) {
    var arrName = cmp[1], idxExprA = cmp[2], op = cmp[3], idxExprB = cmp[5];
    var arrEntry = step.locals[arrName];
    if (arrEntry && arrEntry.items) {
      var idxA = resolveIndexExpr(idxExprA, step.locals);
      var idxB = resolveIndexExpr(idxExprB, step.locals);
      if (idxA != null && idxB != null && arrEntry.items[idxA] !== undefined && arrEntry.items[idxB] !== undefined) {
        return {
          text: 'Comparing ' + arrName + '[' + idxA + ']=' + arrEntry.items[idxA] + ' ' + op + ' ' + arrName + '[' + idxB + ']=' + arrEntry.items[idxB],
          kind: 'compare'
        };
      }
    }
  }

  var forMatch = lineText.match(/^for\\s+(\\w+)\\s+in\\s+/);
  if (forMatch && stepIdx > 0) {
    var loopVar = forMatch[1];
    var lv = step.locals[loopVar];
    if (lv) return { text: 'Loop check — ' + loopVar + ' = ' + lv.r, kind: 'loop' };
  }

  return { text: lineText || ('Line ' + step.line), kind: 'line' };
}

var steps = computeSteps(trace);
var swapEvents = precomputeSwaps();
var currentStep = 0;
var playing = false;
var playTimer = null;
var activeSrcLine = null;
var hiddenCards = new Set();
var draggedPositions = {};

function buildSourceList() {
  var el = document.getElementById('code-ctx');
  var lines = src.split('\\n');
  var html = '';
  for (var i = 0; i < lines.length; i++) {
    html += '<div class="src-line" id="src-line-'+(i+1)+'">' +
      '<span class="src-ln">'+(i+1)+'</span>' +
      '<span class="src-txt">'+esc(lines[i])+'</span>' +
      '</div>';
  }
  el.innerHTML = html;
}

function renderSource(lineNum) {
  if (activeSrcLine) {
    var prevEl = document.getElementById('src-line-'+activeSrcLine);
    if (prevEl) prevEl.classList.remove('src-active');
  }
  var curEl = document.getElementById('src-line-'+lineNum);
  if (curEl) {
    curEl.classList.add('src-active');
    curEl.scrollIntoView({ block: 'center' });
  }
  activeSrcLine = lineNum;
}

function renderBreadcrumb(step) {
  var el = document.getElementById('stack-breadcrumb');
  if (!step.stack.length) { el.innerHTML = '<span style="opacity:0.3">top level</span>'; return; }
  el.innerHTML = step.stack.map(function(s, idx) {
    var active = idx === step.activeIdx;
    return '<span class="bc-sep">' + (idx === 0 ? '' : '→') + '</span>' +
      '<span class="' + (active ? 'bc-active' : '') + '" style="color:'+col(s.func)+'">'+esc(s.func)+'()</span>';
  }).join('');
}

// Heuristic, source-text based: finds subscript reads like arr[j] or arr[j + 1] on the
// current line and resolves the index using in-scope int locals. This is not true
// bytecode-level subscript tracking, just a regex match against the active line, so
// unusual indexing expressions may not be detected. Documented limitation.
function detectHighlightedIndices(lineText, arrName, allLocals) {
  var result = new Set();
  if (!lineText) return result;
  var safe = arrName.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  var re = new RegExp('\\\\b' + safe + '\\\\s*\\\\[\\\\s*([a-zA-Z_]\\\\w*|\\\\d+)\\\\s*([+-]\\\\s*\\\\d+)?\\\\s*\\\\]', 'g');
  var m;
  while ((m = re.exec(lineText)) !== null) {
    var base;
    if (/^\\d+$/.test(m[1])) {
      base = parseInt(m[1], 10);
    } else {
      var lv = allLocals[m[1]];
      if (!lv || lv.k !== 'int') continue;
      base = parseInt(lv.r, 10);
    }
    var offset = 0;
    if (m[2]) offset = parseInt(m[2].replace(/\\s+/g, ''), 10);
    result.add(base + offset);
  }
  return result;
}

function applyPosition(card, name) {
  card.dataset.varName = name;
  if (draggedPositions[name]) {
    card.style.position = 'absolute';
    card.style.left = draggedPositions[name].x + 'px';
    card.style.top = draggedPositions[name].y + 'px';
  }
}

function makeDraggable(card, name) {
  var closeBtn = card.querySelector('.vc-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      hiddenCards.add(name);
      renderStep(currentStep);
    });
  }
  var head = card.querySelector('.vc-head');
  var dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
  head.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('vc-close')) return;
    dragging = true;
    var canvas = document.getElementById('anim-canvas');
    var canvasRect = canvas.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    origLeft = cardRect.left - canvasRect.left + canvas.scrollLeft;
    origTop = cardRect.top - canvasRect.top + canvas.scrollTop;
    card.style.position = 'absolute';
    card.style.left = origLeft + 'px';
    card.style.top = origTop + 'px';
    card.style.zIndex = 20;
    startX = e.clientX; startY = e.clientY;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var nx = origLeft + (e.clientX - startX);
    var ny = origTop + (e.clientY - startY);
    card.style.left = nx + 'px';
    card.style.top = ny + 'px';
    draggedPositions[name] = { x: nx, y: ny };
  });
  document.addEventListener('mouseup', function() { dragging = false; });
}

var ICON = { int:'#', float:'~', str:'❝', bool:'◑', none:'∅', fn:'ƒ', method:'ƒ', list:'▤', tuple:'▤', dict:'▥', obj:'●' };

function buildScalarCard(name, entry) {
  var card = document.createElement('div');
  card.className = 'var-card';
  applyPosition(card, name);
  var icon = ICON[entry.k] || ICON.obj;
  card.innerHTML =
    '<div class="vc-head"><span>'+icon+' '+esc(name)+': '+entry.k+'</span><span class="vc-close">×</span></div>' +
    '<div class="vc-val" style="color:'+kindColor(entry.k)+'">'+esc(shortLabel(entry))+'</div>';
  makeDraggable(card, name);
  return card;
}

function buildArrayCard(name, entry, prevEntry, lineText, allLocals) {
  var card = document.createElement('div');
  card.className = 'var-card arr-card';
  applyPosition(card, name);
  var highlighted = detectHighlightedIndices(lineText, name, allLocals);
  var items = entry.items || [];
  var prevItems = (prevEntry && prevEntry.items) || [];
  var boxes = items.map(function(val, idx) {
    var changed = prevItems[idx] !== undefined && prevItems[idx] !== val;
    var hl = highlighted.has(idx);
    return '<div class="arr-box'+(changed?' arr-changed':'')+(hl?' arr-hl':'')+'" data-arr-key="'+esc(name)+':'+idx+'">' +
      '<span class="arr-idx">'+idx+'</span>' +
      '<span class="arr-val">'+esc(val)+'</span>' +
      '</div>';
  }).join('');
  card.innerHTML =
    '<div class="vc-head"><span>' + ICON.list + ' ' + esc(name)+': '+entry.k+'['+items.length+']</span><span class="vc-close">×</span></div>' +
    '<div class="arr-row">'+boxes+'</div>';
  makeDraggable(card, name);
  return card;
}

// FLIP animation: measures a box's position at its OLD screen location (captured before the
// DOM was rebuilt) versus where it landed after rebuild, then animates the visual delta away
// so a swapped box appears to physically slide into its new slot instead of snapping there.
function flipBox(boxEl, oldRect) {
  if (!boxEl || !oldRect) return;
  var newRect = boxEl.getBoundingClientRect();
  var dx = oldRect.left - newRect.left;
  var dy = oldRect.top - newRect.top;
  if (!dx && !dy) return;
  boxEl.style.transition = 'none';
  boxEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  boxEl.classList.add('arr-swapping');
  // force a reflow so the browser commits the start position before we animate to the end
  boxEl.getBoundingClientRect();
  requestAnimationFrame(function() {
    boxEl.style.transition = 'transform 0.32s cubic-bezier(.22,.85,.32,1)';
    boxEl.style.transform = 'translate(0,0)';
  });
  setTimeout(function() {
    boxEl.classList.remove('arr-swapping');
    boxEl.style.transition = '';
    boxEl.style.transform = '';
  }, 360);
}

function renderCanvas(stepIdx, step) {
  var canvas = document.getElementById('anim-canvas');

  // FLIP "First": capture current on-screen positions of every array box before the DOM
  // is rebuilt for this step, so swapped boxes can be animated sliding from old to new.
  var oldRects = {};
  var existingBoxes = canvas.querySelectorAll('.arr-box');
  for (var bi = 0; bi < existingBoxes.length; bi++) {
    var key = existingBoxes[bi].getAttribute('data-arr-key');
    if (key) oldRects[key] = existingBoxes[bi].getBoundingClientRect();
  }

  canvas.innerHTML = '';
  var names = Object.keys(step.locals).filter(function(nm){ return !hiddenCards.has(nm); });
  if (!names.length) {
    canvas.innerHTML = '<div class="canvas-empty">No local variables in scope yet</div>';
    return;
  }
  var prevLocals = stepIdx > 0 ? steps[stepIdx-1].locals : {};
  var lineText = src.split('\\n')[step.line-1] || '';

  names.filter(function(nm){ var e = step.locals[nm]; return e.k === 'list' || e.k === 'tuple'; })
    .forEach(function(nm) {
      canvas.appendChild(buildArrayCard(nm, step.locals[nm], prevLocals[nm], lineText, step.locals));
    });

  names.filter(function(nm){ var e = step.locals[nm]; return !(e.k === 'list' || e.k === 'tuple'); })
    .forEach(function(nm) {
      canvas.appendChild(buildScalarCard(nm, step.locals[nm]));
    });

  // FLIP "Last + Invert + Play": if this exact step is where a pending swap resolved
  // (see precomputeSwaps), slide the two boxes from their old screen positions into their
  // new ones instead of letting the values just snap to their new spots.
  var swapHere = swapEvents[stepIdx];
  if (swapHere && names.indexOf(swapHere.name) !== -1) {
    var keyA = swapHere.name + ':' + swapHere.pair[0], keyB = swapHere.name + ':' + swapHere.pair[1];
    var boxA = canvas.querySelector('[data-arr-key="' + keyA + '"]');
    var boxB = canvas.querySelector('[data-arr-key="' + keyB + '"]');
    flipBox(boxA, oldRects[keyB]);
    flipBox(boxB, oldRects[keyA]);
  }
}

function renderVarsPanel(step) {
  var el = document.getElementById('vars-list');
  var names = Object.keys(step.locals);
  if (!names.length) { el.innerHTML = '<div class="vars-empty">No variables yet</div>'; return; }
  el.innerHTML = names.map(function(nm) {
    var entry = step.locals[nm];
    return '<div class="var-row"><span class="var-row-k">'+esc(nm)+'</span><span class="var-row-eq">=</span>'+
      '<span style="color:'+kindColor(entry.k)+'">'+esc(shortLabel(entry))+'</span></div>';
  }).join('');
}

// A compact timeline of every step as a small colored dot (colored by step kind), so the
// whole run's shape is visible at a glance and any step is one click away. Capped at 150
// steps to stay readable and avoid layout cost on very long traces; longer traces fall back
// to the gradient scrubber bar only.
var STEP_DOT_LIMIT = 150;
var stepDotEls = [];

function buildStepDots() {
  var el = document.getElementById('step-dots');
  if (!steps.length || steps.length > STEP_DOT_LIMIT) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  var html = '';
  for (var i = 0; i < steps.length; i++) {
    var obs = observeStep(i);
    html += '<span class="step-dot step-dot-' + obs.kind + '" data-step-idx="' + i + '" title="' + esc(obs.text) + '"></span>';
  }
  el.innerHTML = html;
  stepDotEls = Array.prototype.slice.call(el.querySelectorAll('.step-dot'));
  stepDotEls.forEach(function(dot) {
    dot.addEventListener('click', function() {
      setStep(parseInt(dot.getAttribute('data-step-idx'), 10));
    });
  });
}

function renderStepDots(n) {
  if (!stepDotEls.length) return;
  for (var i = 0; i < stepDotEls.length; i++) {
    stepDotEls[i].classList.toggle('active', i === n);
  }
  if (stepDotEls[n]) stepDotEls[n].scrollIntoView({ inline: 'center', block: 'nearest' });
}

var BADGE_LABEL = { call:'CALL', return:'RETURN', line:'LINE', swap:'SWAP', compare:'COMPARE', loop:'LOOP' };

function renderStep(n) {
  if (!steps.length) return;
  var step = steps[n];
  var obs = observeStep(n);

  var badge = document.getElementById('step-badge');
  badge.textContent = BADGE_LABEL[obs.kind] || 'LINE';
  badge.className = obs.kind;

  document.getElementById('step-desc').textContent = obs.text;
  document.getElementById('step-count-text').textContent = (n+1) + ' / ' + steps.length;
  document.getElementById('prog-fill').style.width = ((n+1)/steps.length*100)+'%';
  document.getElementById('btn-prev').disabled = (n === 0);
  document.getElementById('btn-next').disabled = (n === steps.length-1);

  renderSource(step.line);
  renderBreadcrumb(step);
  renderCanvas(n, step);
  renderVarsPanel(step);
  renderStepDots(n);
}

function setStep(n) {
  if (n < 0 || n >= steps.length) return;
  currentStep = n;
  renderStep(n);
}
function nextStep() { setStep(currentStep+1); }
function prevStep() { setStep(currentStep-1); }

function togglePlay() {
  playing = !playing;
  var btn = document.getElementById('btn-play');
  if (playing) {
    btn.innerHTML = '&#10074;&#10074; Pause';
    btn.classList.add('playing');
    autoPlay();
  } else {
    btn.innerHTML = '&#9654; Play';
    btn.classList.remove('playing');
    clearTimeout(playTimer);
  }
}

function autoPlay() {
  if (!playing) return;
  if (currentStep >= steps.length-1) {
    playing = false;
    var btn = document.getElementById('btn-play');
    btn.innerHTML = '&#9654; Play';
    btn.classList.remove('playing');
    return;
  }
  nextStep();
  var speed = parseInt(document.getElementById('speed-select').value, 10);
  playTimer = setTimeout(autoPlay, speed);
}

function setMode(mode) {
  var stepView = document.getElementById('step-view');
  var flowView = document.getElementById('flow-view');
  var btnStep = document.getElementById('btn-mode-step');
  var btnFlow = document.getElementById('btn-mode-flow');
  if (mode === 'step') {
    stepView.style.display = 'flex';
    flowView.classList.remove('visible');
    btnStep.classList.add('active');
    btnFlow.classList.remove('active');
  } else {
    stepView.style.display = 'none';
    flowView.classList.add('visible');
    btnStep.classList.remove('active');
    btnFlow.classList.add('active');
  }
}

document.getElementById('btn-mode-step').addEventListener('click', function(){ setMode('step'); });
document.getElementById('btn-mode-flow').addEventListener('click', function(){ setMode('flow'); });
document.getElementById('btn-prev').addEventListener('click', prevStep);
document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-next').addEventListener('click', nextStep);
document.getElementById('prog-bar').addEventListener('click', function(e) {
  if (!steps.length) return;
  var rect = this.getBoundingClientRect();
  var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  setStep(Math.round(frac * (steps.length - 1)));
});
document.getElementById('params-header').addEventListener('click', function() {
  var left = document.getElementById('left');
  left.classList.toggle('collapsed');
  document.getElementById('left-toggle-btn').innerHTML = left.classList.contains('collapsed') ? '+' : '&minus;';
});

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nextStep(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep(); }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

// Flow (call tree) view only cares about call/return structure, so line events are filtered out.
function buildTree(frames) {
  var root = { children:[] }, stack = [root];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    var parent = stack[stack.length-1];
    if (f.event === 'call') {
      var node = { func:f.func, line:f.line, locals:f.locals||{}, ret:null, children:[], depth:stack.length-1 };
      parent.children.push(node);
      stack.push(node);
    } else if (f.event === 'return') {
      var popped = stack.pop();
      if (popped && popped !== root) popped.ret = f.ret;
    }
  }
  return root.children;
}

function renderTree(nodes, container) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var c = col(n.func);
    var tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.borderLeftColor = c;
    tile.style.marginLeft = (n.depth*14)+'px';
    var locEntries = Object.keys(n.locals).map(function(k){ return [k, n.locals[k]]; });
    if (locEntries.length) tile.classList.add('clickable');
    var locHtml = locEntries.map(function(kv) {
      return '<div><span class="tl-k">' + esc(kv[0]) + '</span> = <span style="color:' + kindColor(kv[1].k) + '">' + esc(shortLabel(kv[1])) + '</span></div>';
    }).join('');
    tile.innerHTML =
      '<div class="t-row">' +
        '<span class="t-ev" style="color:'+c+'">call</span>' +
        '<span class="t-fn" style="color:'+c+'">' + esc(n.func) + '</span>' +
        (locEntries.length ? '<span class="t-arrow">&#9654;</span>' : '') +
        (n.ret ? '<span class="t-ret">→ ' + esc(shortLabel(n.ret).slice(0,20)) + '</span>' : '') +
        '<span class="t-ln">:' + n.line + '</span>' +
      '</div>' +
      (locEntries.length ? '<div class="t-locals">' + locHtml + '</div>' : '');
    if (locEntries.length) {
      tile.addEventListener('click', (function(el){ return function(){ el.classList.toggle('open'); }; })(tile));
    }
    container.appendChild(tile);
    if (n.children.length) renderTree(n.children, container);
  }
}

var SKIP = new Set(['True','False','None','if','else','elif','for','while','return','import','from','class','def','lambda','and','or','not','in','is','print','len','range','str','int','float','list','dict','tuple','set','type','zip','map','filter','sum','min','max','abs','round','open','super','self','cls','with','as','pass','break','continue','try','except','finally','raise','yield','assert','del','global','nonlocal','enumerate','isinstance','hasattr','getattr','setattr','sorted','reversed','any','all','next','iter']);

function detectParams(code) {
  var params = [], seen = new Set(), m;
  var r1 = /\\b([a-zA-Z_]\\w*)\\s*=\\s*(\\d+(?:\\.\\d+)?)\\b/g;
  while ((m = r1.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k1 = 'n:'+m[1]+':'+m[2];
    if (seen.has(k1)) continue;
    seen.add(k1);
    params.push({ type:'num', name:m[1], value:parseFloat(m[2]), original:m[0] });
  }
  var r2a = /\\b([a-zA-Z_]\\w*)\\s*\\(\\s*"([^"\\n]{1,50})"/g;
  while ((m = r2a.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k2 = 's:'+m[1]+':'+m[2];
    if (seen.has(k2)) continue;
    seen.add(k2);
    params.push({ type:'str', name:m[1]+'()', value:m[2], original:'"'+m[2]+'"', quote:'"' });
  }
  var r2b = /\\b([a-zA-Z_]\\w*)\\s*\\(\\s*'([^'\\n]{1,50})'/g;
  while ((m = r2b.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k2b = 's:'+m[1]+':'+m[2];
    if (seen.has(k2b)) continue;
    seen.add(k2b);
    params.push({ type:'str', name:m[1]+'()', value:m[2], original:"'"+m[2]+"'", quote:"'" });
  }
  return params;
}

function renderParams(params) {
  var list = document.getElementById('param-list');
  if (!params.length) {
    list.innerHTML = '<div class="empty-hint">No editable parameters found.<br>Use keyword args like<br><code style="color:#cba6f7;font-family:monospace;font-size:11px">num_times=3</code></div>';
    return;
  }
  params.forEach(function(p) {
    var card = document.createElement('div');
    card.className = 'p-card';
    if (p.type === 'num') {
      var cur = p.value;
      var maxV = Math.max(20, Math.ceil(cur*5));
      var minV = cur < 0 ? Math.floor(cur*3) : 0;
      var lastOrig = p.original;
      card.innerHTML =
        '<div class="p-name">'+esc(p.name)+'</div>'+
        '<div class="p-cur" id="pc-'+esc(p.name)+'">'+cur+'</div>'+
        '<input type="range" class="p-range" min="'+minV+'" max="'+maxV+'" value="'+cur+'" step="1">'+
        '<input type="number" class="p-num" min="'+minV+'" max="'+maxV+'" value="'+cur+'" step="1">';
      var disp = card.querySelector('.p-cur');
      var slider = card.querySelector('.p-range');
      var numIn = card.querySelector('.p-num');
      var debT = null;
      function applyNum(newV) {
        newV = parseFloat(newV);
        if (isNaN(newV)) return;
        disp.textContent = newV;
        slider.value = newV;
        numIn.value = newV;
        var from = lastOrig;
        var to = lastOrig.replace(/(\\d+(?:\\.\\d+)?)$/, String(newV));
        lastOrig = to;
        clearTimeout(debT);
        debT = setTimeout(function() {
          window.parent.postMessage({ type:'code_patch', from:from, to:to }, '*');
        }, 400);
      }
      slider.addEventListener('input', function(){ applyNum(slider.value); });
      numIn.addEventListener('change', function(){ applyNum(numIn.value); });
    } else {
      var lastOrig = p.original;
      card.innerHTML =
        '<div class="p-name">'+esc(p.name)+'</div>'+
        '<input type="text" class="p-str" value="'+esc(p.value)+'">';
      var strIn = card.querySelector('.p-str');
      strIn.addEventListener('change', function() {
        var from = lastOrig;
        var to = p.quote + strIn.value + p.quote;
        lastOrig = to;
        window.parent.postMessage({ type:'code_patch', from:from, to:to }, '*');
      });
    }
    list.appendChild(card);
  });
}

buildSourceList();

if (truncated) {
  document.getElementById('trunc-banner').style.display = 'block';
}

var params = detectParams(src);
renderParams(params);

var crFrames = trace.filter(function(f){ return f.event !== 'line'; });
var treeEl = document.getElementById('call-tree');
var tree = buildTree(crFrames);
if (tree.length) {
  renderTree(tree, treeEl);
  var first = treeEl.querySelector('.tile.clickable');
  if (first) first.classList.add('open');
} else {
  treeEl.innerHTML = '<div class="empty-state">No function calls traced.<br>Define and call functions to see the call tree.</div>';
}

if (steps.length) {
  document.getElementById('btn-play').disabled = false;
  document.getElementById('btn-next').disabled = false;
  buildStepDots();
  renderStep(0);
} else {
  document.getElementById('stack-breadcrumb').innerHTML = '<span style="opacity:0.3">No function calls traced</span>';
  document.getElementById('anim-canvas').innerHTML = '<div class="canvas-empty">No function calls traced.<br>Define and call functions to step through them.</div>';
}
</script>
</body>
</html>`
}

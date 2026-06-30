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
#step-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 8px;border-radius:20px;margin-bottom:6px;}
#step-badge.call{background:rgba(166,227,161,0.15);color:#a6e3a1;border:1px solid rgba(166,227,161,0.3);}
#step-badge.ret{background:rgba(249,226,175,0.15);color:#f9e2af;border:1px solid rgba(249,226,175,0.3);}
#step-badge.line{background:rgba(137,180,250,0.15);color:#89b4fa;border:1px solid rgba(137,180,250,0.3);}
#step-desc{font-size:12.5px;font-weight:500;color:rgba(255,255,255,0.75);line-height:1.4;min-height:18px;font-family:'Fira Code',Consolas,monospace;}
#step-counter-line{display:flex;align-items:center;gap:8px;margin-top:5px;}
#step-count-text{font-size:10px;color:rgba(255,255,255,0.3);font-variant-numeric:tabular-nums;white-space:nowrap;}
#prog-bar{flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;cursor:pointer;}
#prog-fill{height:100%;background:linear-gradient(90deg,#89b4fa,#cba6f7);border-radius:2px;transition:width 0.15s ease;pointer-events:none;}

#main-row{flex:1;display:flex;overflow:hidden;min-height:0;}

#source-panel{width:225px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);overflow-y:auto;padding:6px 0;}
.src-line{display:flex;align-items:baseline;gap:7px;padding:1.5px 10px;line-height:1.6;border-left:2px solid transparent;}
.src-line.src-active{background:rgba(137,180,250,0.1);border-left:2px solid #89b4fa;}
.src-ln{color:rgba(255,255,255,0.18);min-width:20px;text-align:right;user-select:none;flex-shrink:0;font-size:10px;font-family:'Fira Code',Consolas,monospace;}
.src-txt{color:rgba(255,255,255,0.45);white-space:pre;font-family:'Fira Code',Consolas,monospace;font-size:11.5px;}
.src-active .src-txt{color:#cdd6f4;}

#canvas-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
#stack-breadcrumb{padding:6px 12px;font-size:11px;font-family:'Fira Code',Consolas,monospace;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap;overflow-x:auto;flex-shrink:0;color:rgba(255,255,255,0.5);}
.bc-sep{color:rgba(255,255,255,0.18);margin:0 5px;}
.bc-active{font-weight:700;}

#anim-canvas{flex:1;position:relative;overflow:auto;padding:14px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:10px;}
.canvas-empty{color:rgba(255,255,255,0.2);font-style:italic;font-size:12px;padding:20px;width:100%;text-align:center;}

@keyframes frame-enter{from{opacity:0.3;transform:translateY(-4px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
.var-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:7px;width:128px;flex-shrink:0;overflow:hidden;animation:frame-enter 0.18s ease-out;box-shadow:0 2px 10px rgba(0,0,0,0.15);}
.vc-head{font-size:9.5px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.03);padding:5px 8px;cursor:grab;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);letter-spacing:0.2px;}
.vc-head:active{cursor:grabbing;}
.vc-close{cursor:pointer;opacity:0.35;font-size:11px;padding:0 2px;}
.vc-close:hover{opacity:0.9;}
.vc-val{padding:9px 8px;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;word-break:break-all;font-family:'Fira Code',Consolas,monospace;}

.arr-card{width:auto;max-width:100%;}
.arr-row{display:flex;padding:8px;gap:3px;overflow-x:auto;}
.arr-box{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:5px;padding:3px 8px;min-width:28px;flex-shrink:0;transition:background 0.15s,border-color 0.15s;}
.arr-idx{font-size:8px;color:rgba(255,255,255,0.25);}
.arr-val{font-size:13px;font-weight:600;color:#cdd6f4;font-variant-numeric:tabular-nums;font-family:'Fira Code',Consolas,monospace;}
.arr-box.arr-changed{background:rgba(166,227,161,0.18);border-color:rgba(166,227,161,0.5);animation:box-pulse 0.4s ease;}
.arr-box.arr-hl{border-color:#cba6f7;box-shadow:0 0 0 1px rgba(203,166,247,0.45);}
@keyframes box-pulse{0%{transform:scale(1.22);}100%{transform:scale(1);}}

#vars-panel{width:148px;flex-shrink:0;border-left:1px solid rgba(255,255,255,0.07);overflow-y:auto;display:flex;flex-direction:column;}
#vars-list{padding:4px 0;}
.var-row{display:flex;gap:5px;font-family:'Fira Code',Consolas,monospace;font-size:10.5px;padding:3px 10px;line-height:1.7;flex-wrap:wrap;}
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

function stepDesc(step) {
  if (step.type === 'call') {
    var caller = step.stack.length > 1 ? step.stack[step.stack.length-2].func+'()' : 'top level';
    return 'Entering ' + step.func + '() from ' + caller;
  }
  if (step.type === 'return') {
    var callee = step.stack.length > 1 ? step.stack[step.stack.length-2].func+'()' : 'top level';
    return step.func + '() → ' + shortLabel(step.ret) + ' (back to ' + callee + ')';
  }
  var lines = src.split('\\n');
  var text = (lines[step.line-1] || '').trim();
  return text || ('Line ' + step.line);
}

var steps = computeSteps(trace);
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

function buildScalarCard(name, entry) {
  var card = document.createElement('div');
  card.className = 'var-card';
  applyPosition(card, name);
  card.innerHTML =
    '<div class="vc-head">'+esc(name)+': '+entry.k+'<span class="vc-close">×</span></div>' +
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
    return '<div class="arr-box'+(changed?' arr-changed':'')+(hl?' arr-hl':'')+'">' +
      '<span class="arr-idx">'+idx+'</span>' +
      '<span class="arr-val">'+esc(val)+'</span>' +
      '</div>';
  }).join('');
  card.innerHTML =
    '<div class="vc-head">'+esc(name)+': '+entry.k+'['+items.length+']<span class="vc-close">×</span></div>' +
    '<div class="arr-row">'+boxes+'</div>';
  makeDraggable(card, name);
  return card;
}

function renderCanvas(stepIdx, step) {
  var canvas = document.getElementById('anim-canvas');
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

function renderStep(n) {
  if (!steps.length) return;
  var step = steps[n];

  var badge = document.getElementById('step-badge');
  badge.textContent = step.type === 'call' ? 'CALL' : step.type === 'return' ? 'RETURN' : 'LINE';
  badge.className = step.type === 'call' ? 'call' : step.type === 'return' ? 'ret' : 'line';

  document.getElementById('step-desc').textContent = stepDesc(step);
  document.getElementById('step-count-text').textContent = (n+1) + ' / ' + steps.length;
  document.getElementById('prog-fill').style.width = ((n+1)/steps.length*100)+'%';
  document.getElementById('btn-prev').disabled = (n === 0);
  document.getElementById('btn-next').disabled = (n === steps.length-1);

  renderSource(step.line);
  renderBreadcrumb(step);
  renderCanvas(n, step);
  renderVarsPanel(step);
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
  renderStep(0);
} else {
  document.getElementById('stack-breadcrumb').innerHTML = '<span style="opacity:0.3">No function calls traced</span>';
  document.getElementById('anim-canvas').innerHTML = '<div class="canvas-empty">No function calls traced.<br>Define and call functions to step through them.</div>';
}
</script>
</body>
</html>`
}

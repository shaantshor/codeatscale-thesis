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

/* ── Layout ── */
#root{display:flex;flex:1;overflow:hidden;}
#left{width:192px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;overflow:hidden;}
#left-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;}
#right{flex:1;display:flex;flex-direction:column;overflow:hidden;}

/* ── Mode bar ── */
#mode-bar{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}
.mode-btn{background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;transition:all 0.15s;letter-spacing:0.3px;}
.mode-btn.active{background:rgba(203,166,247,0.15);border-color:rgba(203,166,247,0.45);color:#cba6f7;}
.mode-btn:hover:not(.active){border-color:rgba(255,255,255,0.25);color:rgba(255,255,255,0.65);}

/* ── Panel headers ── */
.ph{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(255,255,255,0.25);padding:8px 10px 7px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}
.ph-sub{font-weight:400;text-transform:none;letter-spacing:0;color:rgba(255,255,255,0.14);margin-left:6px;}

/* ── Parameters ── */
.p-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 9px;}
.p-name{font-size:10px;color:rgba(255,255,255,0.38);margin-bottom:3px;font-weight:500;}
.p-cur{font-size:18px;font-weight:700;color:#cba6f7;margin-bottom:6px;font-variant-numeric:tabular-nums;line-height:1;}
.p-range{width:100%;accent-color:#cba6f7;cursor:ew-resize;display:block;margin-bottom:4px;}
.p-num{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:4px 7px;outline:none;display:block;}
.p-num:focus,.p-str:focus{border-color:rgba(203,166,247,0.55);}
.p-str{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:5px 7px;outline:none;display:block;}
.empty-hint{font-size:11px;color:rgba(255,255,255,0.2);font-style:italic;line-height:1.7;padding:2px 0;}
.params-tip{font-size:10px;color:rgba(255,255,255,0.14);text-align:center;padding:7px 8px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.05);line-height:1.6;}

/* ── STEP view ── */
#step-view{flex:1;display:flex;flex-direction:column;overflow:hidden;}
#step-header{padding:10px 12px 8px;flex-shrink:0;}
#step-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 8px;border-radius:20px;margin-bottom:7px;}
#step-badge.call{background:rgba(166,227,161,0.15);color:#a6e3a1;border:1px solid rgba(166,227,161,0.3);}
#step-badge.ret{background:rgba(249,226,175,0.15);color:#f9e2af;border:1px solid rgba(249,226,175,0.3);}
#step-desc{font-size:13px;font-weight:500;color:rgba(255,255,255,0.75);line-height:1.4;}
#step-counter-line{display:flex;align-items:center;gap:8px;margin-top:6px;}
#step-count-text{font-size:10px;color:rgba(255,255,255,0.3);font-variant-numeric:tabular-nums;white-space:nowrap;}
#prog-bar{flex:1;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;}
#prog-fill{height:100%;background:linear-gradient(90deg,#89b4fa,#cba6f7);border-radius:2px;transition:width 0.25s ease;}

/* ── Stack cards ── */
#stack-scroll{flex:1;overflow-y:auto;padding:0 12px 4px;}
.frame-card{border:1px solid rgba(255,255,255,0.07);border-left:3px solid;border-radius:0 6px 6px 0;padding:8px 11px;margin-bottom:5px;transition:all 0.2s ease;}
.frame-card.active{background:rgba(255,255,255,0.05);box-shadow:0 0 0 1px rgba(203,166,247,0.2),0 4px 16px rgba(0,0,0,0.3);}
.frame-card.dim{opacity:0.45;}
.frame-name{font-family:'Fira Code',Consolas,monospace;font-size:12px;font-weight:700;margin-bottom:0;}
.frame-name-active{font-family:'Fira Code',Consolas,monospace;font-size:13px;font-weight:700;margin-bottom:6px;}
.frame-locals{display:flex;flex-direction:column;gap:2px;}
.loc-row{display:flex;align-items:baseline;gap:6px;font-family:'Fira Code',Consolas,monospace;font-size:11px;line-height:1.6;}
.loc-k{color:rgba(255,255,255,0.4);flex-shrink:0;}
.loc-eq{color:rgba(255,255,255,0.2);}
.loc-v{color:#a6e3a1;word-break:break-all;}
.ret-pill{display:inline-flex;align-items:center;gap:4px;margin-top:6px;background:rgba(249,226,175,0.1);border:1px solid rgba(249,226,175,0.25);border-radius:4px;padding:3px 8px;font-family:monospace;font-size:11px;color:#f9e2af;}
.stack-spacer{font-size:10px;color:rgba(255,255,255,0.12);text-align:center;padding:4px 0;}
.no-stack-msg{padding:20px 12px;text-align:center;color:rgba(255,255,255,0.2);font-size:12px;font-style:italic;line-height:1.7;}

/* ── Step controls ── */
#step-controls{padding:8px 12px 10px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.06);}
#ctrl-row{display:flex;align-items:center;gap:6px;}
.ctrl-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;padding:5px 12px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
.ctrl-btn:hover:not(:disabled){background:rgba(255,255,255,0.12);color:#fff;}
.ctrl-btn:disabled{opacity:0.25;cursor:default;}
#btn-play{background:rgba(166,227,161,0.12);border-color:rgba(166,227,161,0.3);color:#a6e3a1;flex:1;justify-content:center;}
#btn-play:hover:not(:disabled){background:rgba(166,227,161,0.2);}
#btn-play.playing{background:rgba(249,226,175,0.12);border-color:rgba(249,226,175,0.3);color:#f9e2af;}
#speed-select{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.5);font-size:11px;padding:4px 6px;outline:none;cursor:pointer;}

/* ── FLOW view ── */
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
.tl-v{color:#a6e3a1;}

/* ── Empty state ── */
.empty-state{padding:24px 12px;text-align:center;color:rgba(255,255,255,0.2);font-size:12px;font-style:italic;line-height:1.8;}
</style>
</head>
<body>
<div id="root">

  <!-- LEFT: Parameters -->
  <div id="left">
    <div class="ph">Parameters</div>
    <div id="left-body">
      <div id="param-list"></div>
    </div>
    <div class="params-tip">Edit values to re-run<br>with new parameters</div>
  </div>

  <!-- RIGHT: Explorer -->
  <div id="right">
    <div id="mode-bar">
      <button class="mode-btn active" id="btn-mode-step" onclick="setMode('step')">&#9654; Step</button>
      <button class="mode-btn" id="btn-mode-flow" onclick="setMode('flow')">&#11200; Flow</button>
    </div>

    <!-- STEP view -->
    <div id="step-view">
      <div id="step-header">
        <div id="step-badge" class="call">CALL</div>
        <div id="step-desc">Run your code to begin</div>
        <div id="step-counter-line">
          <span id="step-count-text">0 / 0</span>
          <div id="prog-bar"><div id="prog-fill" style="width:0%"></div></div>
        </div>
      </div>
      <div id="stack-scroll"><div class="no-stack-msg">Press Play or click Next to step through execution</div></div>
      <div id="step-controls">
        <div id="ctrl-row">
          <button class="ctrl-btn" id="btn-prev" onclick="prevStep()" disabled>&#9664; Prev</button>
          <button class="ctrl-btn" id="btn-play" onclick="togglePlay()" disabled>&#9654; Play</button>
          <button class="ctrl-btn" id="btn-next" onclick="nextStep()" disabled>Next &#9654;</button>
          <select id="speed-select" title="Playback speed">
            <option value="900">0.5x</option>
            <option value="500" selected>1x</option>
            <option value="280">2x</option>
            <option value="100">4x</option>
          </select>
        </div>
      </div>
    </div>

    <!-- FLOW view -->
    <div id="flow-view">
      <div class="ph">Call Tree <span class="ph-sub">click a tile to inspect locals</span></div>
      <div id="flow-scroll"><div id="call-tree"></div></div>
    </div>
  </div>

</div>
<script>
var trace = JSON.parse(${safeTrace});
var src = ${safeCode};

/* ── Color assignment ── */
var PALETTE = ['#89b4fa','#cba6f7','#a6e3a1','#fab387','#f38ba8','#94e2d5','#f9e2af','#b4befe','#eba0ac'];
var cmap = {}, ci = 0;
function col(name) { if (!cmap[name]) cmap[name] = PALETTE[ci++ % PALETTE.length]; return cmap[name]; }

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Compute steps ── */
function computeSteps(frames) {
  var steps = [], stack = [];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    if (f.event === 'call') {
      stack.push({ func: f.func, line: f.line });
      steps.push({
        type: 'call', func: f.func, line: f.line,
        locals: f.locals || {}, ret: null,
        stack: stack.map(function(s){ return {func:s.func,line:s.line}; }),
        activeIdx: stack.length - 1
      });
    } else if (f.event === 'return') {
      steps.push({
        type: 'return', func: f.func, line: f.line,
        locals: f.locals || {}, ret: f.ret,
        stack: stack.map(function(s){ return {func:s.func,line:s.line}; }),
        activeIdx: stack.length - 1
      });
      stack.pop();
    }
  }
  return steps;
}

function stepDesc(step) {
  if (step.type === 'call') {
    var caller = step.stack.length > 1 ? step.stack[step.stack.length - 2].func : 'top level';
    return 'Calling ' + step.func + '() from ' + caller;
  } else {
    var callee = step.stack.length > 1 ? step.stack[step.stack.length - 2].func : 'top level';
    var retStr = step.ret ? step.ret : 'None';
    return step.func + '() returns ' + retStr + ' to ' + callee;
  }
}

var steps = computeSteps(trace);
var currentStep = 0;
var playing = false;
var playTimer = null;

/* ── Render a step ── */
function renderStep(n) {
  if (!steps.length) return;
  var step = steps[n];

  var badge = document.getElementById('step-badge');
  badge.textContent = step.type === 'call' ? 'CALL' : 'RETURN';
  badge.className = step.type === 'call' ? 'call' : 'ret';

  document.getElementById('step-desc').textContent = stepDesc(step);
  document.getElementById('step-count-text').textContent = (n + 1) + ' / ' + steps.length;
  document.getElementById('prog-fill').style.width = ((n + 1) / steps.length * 100) + '%';

  document.getElementById('btn-prev').disabled = (n === 0);
  document.getElementById('btn-next').disabled = (n === steps.length - 1);

  var scroll = document.getElementById('stack-scroll');
  scroll.innerHTML = '';

  if (!step.stack.length) {
    scroll.innerHTML = '<div class="no-stack-msg">Stack is empty</div>';
    return;
  }

  /* Render stack top-to-bottom (innermost first) */
  for (var i = step.stack.length - 1; i >= 0; i--) {
    var frame = step.stack[i];
    var isActive = (i === step.activeIdx);
    var c = col(frame.func);

    var card = document.createElement('div');
    card.className = 'frame-card' + (isActive ? ' active' : ' dim');
    card.style.borderLeftColor = c;

    if (isActive) {
      var locEntries = Object.entries(step.locals);
      var locHtml = locEntries.map(function(kv) {
        return '<div class="loc-row"><span class="loc-k">' + esc(kv[0]) + '</span><span class="loc-eq"> = </span><span class="loc-v">' + esc(kv[1]) + '</span></div>';
      }).join('');

      var retHtml = '';
      if (step.type === 'return' && step.ret) {
        retHtml = '<div class="ret-pill">&#x21A9; ' + esc(step.ret) + '</div>';
      }

      card.innerHTML =
        '<div class="frame-name-active" style="color:' + c + '">' + esc(frame.func) + '<span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.25);margin-left:6px;">line ' + frame.line + '</span></div>' +
        (locHtml ? '<div class="frame-locals">' + locHtml + '</div>' : '') +
        retHtml;
    } else {
      card.innerHTML = '<div class="frame-name" style="color:' + c + '">' + esc(frame.func) + ' <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.2)">line ' + frame.line + '</span></div>';
    }

    scroll.appendChild(card);

    if (i > 0) {
      var sp = document.createElement('div');
      sp.className = 'stack-spacer';
      sp.textContent = 'called by';
      scroll.appendChild(sp);
    }
  }
}

/* ── Step controls ── */
function setStep(n) {
  if (n < 0 || n >= steps.length) return;
  currentStep = n;
  renderStep(n);
}
function nextStep() { setStep(currentStep + 1); }
function prevStep() { setStep(currentStep - 1); }

function togglePlay() {
  playing = !playing;
  var btn = document.getElementById('btn-play');
  if (playing) {
    btn.textContent = '&#10074;&#10074; Pause';
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
  if (currentStep >= steps.length - 1) {
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

/* ── Mode toggle ── */
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

/* ── Flow view (call tree) ── */
function buildTree(frames) {
  var root = { children: [] }, stack = [root];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    var parent = stack[stack.length - 1];
    if (f.event === 'call') {
      var node = { func: f.func, line: f.line, locals: f.locals || {}, ret: null, children: [], depth: stack.length - 1 };
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
    tile.style.marginLeft = (n.depth * 14) + 'px';
    var locs = Object.entries(n.locals);
    if (locs.length) tile.classList.add('clickable');
    var locHtml = locs.map(function(kv) {
      return '<div><span class="tl-k">' + esc(kv[0]) + '</span> = <span class="tl-v">' + esc(kv[1]) + '</span></div>';
    }).join('');
    tile.innerHTML =
      '<div class="t-row">' +
        '<span class="t-ev" style="color:' + c + '">call</span>' +
        '<span class="t-fn" style="color:' + c + '">' + esc(n.func) + '</span>' +
        (locs.length ? '<span class="t-arrow">&#9654;</span>' : '') +
        (n.ret ? '<span class="t-ret">&#x2192; ' + esc(n.ret) + '</span>' : '') +
        '<span class="t-ln">:' + n.line + '</span>' +
      '</div>' +
      (locs.length ? '<div class="t-locals">' + locHtml + '</div>' : '');
    if (locs.length) {
      tile.addEventListener('click', (function(el){ return function(){ el.classList.toggle('open'); }; })(tile));
    }
    container.appendChild(tile);
    if (n.children.length) renderTree(n.children, container);
  }
}

/* ── Parameter detection ── */
var SKIP = new Set(['True','False','None','if','else','elif','for','while','return','import','from','class','def','lambda','and','or','not','in','is','print','len','range','str','int','float','list','dict','tuple','set','type','zip','map','filter','sum','min','max','abs','round','open','super','self','cls','with','as','pass','break','continue','try','except','finally','raise','yield','assert','del','global','nonlocal','enumerate','isinstance','hasattr','getattr','setattr','sorted','reversed','any','all','next','iter']);

function detectParams(code) {
  var params = [], seen = new Set(), m;

  var r1 = /\b([a-zA-Z_]\w*)\s*=\s*(\d+(?:\.\d+)?)\b/g;
  while ((m = r1.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k1 = 'n:' + m[1] + ':' + m[2];
    if (seen.has(k1)) continue;
    seen.add(k1);
    params.push({ type: 'num', name: m[1], value: parseFloat(m[2]), original: m[0] });
  }

  var r2a = /\b([a-zA-Z_]\w*)\s*\(\s*"([^"\n]{1,50})"/g;
  while ((m = r2a.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k2 = 's:' + m[1] + ':' + m[2];
    if (seen.has(k2)) continue;
    seen.add(k2);
    params.push({ type: 'str', name: m[1] + '()', value: m[2], original: '"' + m[2] + '"', quote: '"' });
  }

  var r2b = /\b([a-zA-Z_]\w*)\s*\(\s*'([^'\n]{1,50})'/g;
  while ((m = r2b.exec(code)) !== null) {
    if (SKIP.has(m[1])) continue;
    var k2b = 's:' + m[1] + ':' + m[2];
    if (seen.has(k2b)) continue;
    seen.add(k2b);
    params.push({ type: 'str', name: m[1] + '()', value: m[2], original: "'" + m[2] + "'", quote: "'" });
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
      var maxV = Math.max(20, Math.ceil(cur * 5));
      var minV = cur < 0 ? Math.floor(cur * 3) : 0;
      var lastOrig = p.original;
      card.innerHTML =
        '<div class="p-name">' + esc(p.name) + '</div>' +
        '<div class="p-cur" id="pc-' + esc(p.name) + '">' + cur + '</div>' +
        '<input type="range" class="p-range" min="' + minV + '" max="' + maxV + '" value="' + cur + '" step="1">' +
        '<input type="number" class="p-num" min="' + minV + '" max="' + maxV + '" value="' + cur + '" step="1">';
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
        var to = lastOrig.replace(/(\d+(?:\.\d+)?)$/, String(newV));
        lastOrig = to;
        clearTimeout(debT);
        debT = setTimeout(function() {
          window.parent.postMessage({ type: 'code_patch', from: from, to: to }, '*');
        }, 400);
      }
      slider.addEventListener('input', function() { applyNum(slider.value); });
      numIn.addEventListener('change', function() { applyNum(numIn.value); });
    } else {
      var lastOrig = p.original;
      card.innerHTML =
        '<div class="p-name">' + esc(p.name) + '</div>' +
        '<input type="text" class="p-str" value="' + esc(p.value) + '">';
      var strIn = card.querySelector('.p-str');
      strIn.addEventListener('change', function() {
        var from = lastOrig;
        var to = p.quote + strIn.value + p.quote;
        lastOrig = to;
        window.parent.postMessage({ type: 'code_patch', from: from, to: to }, '*');
      });
    }
    list.appendChild(card);
  });
}

/* ── INIT ── */
var params = detectParams(src);
renderParams(params);

var treeEl = document.getElementById('call-tree');
var tree = buildTree(trace);
if (tree.length) {
  renderTree(tree, treeEl);
  var first = treeEl.querySelector('.tile.clickable');
  if (first) first.classList.add('open');
} else {
  treeEl.innerHTML = '<div class="empty-state">No function calls traced.<br>Define and call functions to see the execution tree here.</div>';
}

if (steps.length) {
  document.getElementById('btn-play').disabled = false;
  document.getElementById('btn-next').disabled = false;
  renderStep(0);
} else {
  document.getElementById('stack-scroll').innerHTML = '<div class="no-stack-msg">No function calls traced.<br>Define and call functions to step through them here.</div>';
}
</script>
</body>
</html>`
}

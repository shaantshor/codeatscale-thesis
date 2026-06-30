export function buildTraceSrcdoc(traceJson, code) {
  const safeTrace = JSON.stringify(traceJson)
  const safeCode = JSON.stringify(code)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#1e1e2e;color:#cdd6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;height:100vh;overflow:hidden;}
#app{display:flex;height:100vh;}
#left{width:188px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;overflow:hidden;}
#left-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;}
#right{flex:1;display:flex;flex-direction:column;overflow:hidden;}
#right-body{flex:1;overflow-y:auto;padding:10px;}
.ph{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(255,255,255,0.25);padding:8px 10px 7px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}
.ph-sub{font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:rgba(255,255,255,0.14);margin-left:6px;}
.p-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 9px;}
.p-name{font-size:10px;color:rgba(255,255,255,0.38);margin-bottom:3px;}
.p-cur{font-size:16px;font-weight:700;color:#cba6f7;margin-bottom:5px;font-variant-numeric:tabular-nums;}
.p-range{width:100%;accent-color:#cba6f7;cursor:ew-resize;display:block;}
.p-num{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:4px 7px;margin-top:5px;outline:none;display:block;}
.p-num:focus{border-color:rgba(203,166,247,0.5);}
.p-str{width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;font-size:12px;padding:5px 7px;outline:none;display:block;}
.p-str:focus{border-color:rgba(203,166,247,0.5);}
.empty-msg{font-size:11px;color:rgba(255,255,255,0.2);font-style:italic;line-height:1.7;}
.tip{font-size:10px;color:rgba(255,255,255,0.15);text-align:center;padding:7px 10px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.05);line-height:1.6;}
.tile{border:1px solid rgba(255,255,255,0.07);border-left:3px solid;border-radius:0 5px 5px 0;padding:6px 10px;margin-bottom:3px;transition:background 0.1s;}
.tile.clickable{cursor:pointer;}
.tile.clickable:hover{background:rgba(255,255,255,0.04);}
.t-row{display:flex;align-items:center;gap:7px;}
.t-ev{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;width:28px;flex-shrink:0;}
.t-fn{font-family:'Fira Code',Consolas,monospace;font-size:13px;font-weight:600;}
.t-arrow{font-size:10px;color:rgba(255,255,255,0.22);margin-left:2px;transition:transform 0.15s;display:inline-block;}
.tile.open .t-arrow{transform:rotate(90deg);}
.t-ret{margin-left:auto;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.28);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.t-ln{font-size:10px;color:rgba(255,255,255,0.18);white-space:nowrap;margin-left:4px;}
.t-locals{display:none;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.05);font-family:'Fira Code',Consolas,monospace;font-size:11px;line-height:1.8;}
.tile.open .t-locals{display:block;}
.lk{color:rgba(255,255,255,0.38);}
.lv{color:#a6e3a1;}
</style>
</head>
<body>
<div id="app">
  <div id="left">
    <div class="ph">Parameters</div>
    <div id="left-body">
      <div id="param-list"></div>
    </div>
    <div class="tip">Drag sliders or edit values<br>to update code &amp; re-run</div>
  </div>
  <div id="right">
    <div class="ph">Execution Flow <span class="ph-sub">click a tile to inspect locals</span></div>
    <div id="right-body">
      <div id="call-tree"></div>
    </div>
  </div>
</div>
<script>
var trace = JSON.parse(${safeTrace});
var src = ${safeCode};

var PALETTE = ['#89b4fa','#cba6f7','#a6e3a1','#fab387','#f38ba8','#94e2d5','#f9e2af','#b4befe','#eba0ac'];
var cmap = {}, ci = 0;
function col(name) { if (!cmap[name]) cmap[name] = PALETTE[ci++ % PALETTE.length]; return cmap[name]; }

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildTree(frames) {
  var root = { children: [] };
  var stack = [root];
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

function renderNodes(nodes, container) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var c = col(n.func);
    var tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.borderLeftColor = c;
    tile.style.marginLeft = (n.depth * 14) + 'px';
    var locs = Object.entries(n.locals);
    var hasLocs = locs.length > 0;
    if (hasLocs) tile.classList.add('clickable');
    var locHtml = locs.map(function(kv) {
      return '<div><span class="lk">' + esc(kv[0]) + '</span> = <span class="lv">' + esc(kv[1]) + '</span></div>';
    }).join('');
    tile.innerHTML =
      '<div class="t-row">' +
        '<span class="t-ev" style="color:' + c + '">call</span>' +
        '<span class="t-fn" style="color:' + c + '">' + esc(n.func) + '</span>' +
        (hasLocs ? '<span class="t-arrow">&#9654;</span>' : '') +
        (n.ret ? '<span class="t-ret">&#x2192; ' + esc(n.ret) + '</span>' : '') +
        '<span class="t-ln">:' + n.line + '</span>' +
      '</div>' +
      (hasLocs ? '<div class="t-locals">' + locHtml + '</div>' : '');
    if (hasLocs) {
      tile.addEventListener('click', (function(el) { return function() { el.classList.toggle('open'); }; })(tile));
    }
    container.appendChild(tile);
    if (n.children.length) renderNodes(n.children, container);
  }
}

var SKIP = new Set(['True','False','None','if','else','elif','for','while','return','import','from','class','def','lambda','and','or','not','in','is','print','len','range','str','int','float','list','dict','tuple','set','type','zip','map','filter','sum','min','max','abs','round','open','super','self','cls','with','as','pass','break','continue','try','except','finally','raise','yield','assert','del','global','nonlocal','enumerate','isinstance','hasattr','getattr','setattr']);

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
    list.innerHTML = '<div class="empty-msg">No editable parameters detected.<br><br>Use keyword args like<br><code style="color:#cba6f7;font-family:monospace">num_times=3</code><br>to add controls here.</div>';
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
        }, 380);
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

var tree = buildTree(trace);
var params = detectParams(src);
renderParams(params);

var treeEl = document.getElementById('call-tree');
if (!tree.length) {
  treeEl.innerHTML = '<div class="empty-msg" style="padding:4px 0;">No function calls traced.<br><br>Define and call functions to see the execution flow here.</div>';
} else {
  renderNodes(tree, treeEl);
  var first = treeEl.querySelector('.tile.clickable');
  if (first) first.classList.add('open');
}
</script>
</body>
</html>`
}

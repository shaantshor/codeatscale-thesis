export function buildTraceSrcdoc(traceJson, code, darkMode = true) {
  const safeTrace = JSON.stringify(traceJson)
  const safeCode = JSON.stringify(code)

  // Visual pane theme: this is a fully separate `srcdoc` document, so it doesn't inherit the
  // parent app's CSS or `data-theme` attribute - the light/dark choice has to be baked into
  // the generated HTML itself, mirroring whatever the parent's toggle currently says. onRgb is
  // the "surface overlay" base channel that every rgba(...) border/background rule below reuses
  // (white overlays lighten a dark page; near-black overlays darken a light one); accent/accentRgb
  // swap the lavender accent for a slightly deeper shade in light mode so it keeps enough
  // contrast against a light background instead of washing out.
  const bg = darkMode ? '#1a1a1a' : '#f5f5f6'
  const fg = darkMode ? '#eff1f6' : '#1c1c20'
  const onRgb = darkMode ? '255,255,255' : '0,0,0'
  const accent = darkMode ? '#b39ddb' : '#7c5cbf'
  const accentRgb = darkMode ? '179,157,219' : '124,92,191'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
/* Unified type scale (codespecs.shah.fyi restyle pass): every piece of text on this panel now
  maps to exactly one of these three sizes instead of the ~9 one-off sizes that used to be
  scattered across cards/labels/badges. --lbl is for muted uppercase labels, --val is for the
  actual data being shown (array/heap/variable values), --mono is for everything else in
  monospace (descriptions, breadcrumbs, tree text). */
:root{--lbl:11px;--val:15px;--mono:12.5px;}
body{background:${bg};color:${fg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;height:100vh;overflow:hidden;display:flex;flex-direction:column;}

#root{display:flex;flex:1;overflow:hidden;}
#left{width:188px;flex-shrink:0;border-right:1px solid rgba(${onRgb},0.07);display:flex;flex-direction:column;overflow:hidden;transition:width 0.15s ease;}
#left.collapsed{width:30px;}
#left.collapsed #left-body,#left.collapsed .params-tip{display:none;}
#left-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;}
#right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}

#mode-bar{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(${onRgb},0.06);flex-shrink:0;}
.mode-btn{background:transparent;border:1px solid rgba(${onRgb},0.1);border-radius:5px;color:rgba(${onRgb},0.4);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;transition:all 0.15s;letter-spacing:0.3px;}
.mode-btn.active{background:rgba(${onRgb},0.06);border-color:rgba(${accentRgb},0.5);color:${accent};}
.mode-btn:hover:not(.active){border-color:rgba(${onRgb},0.25);color:rgba(${onRgb},0.65);}

.ph{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:rgba(${onRgb},0.25);padding:8px 10px 7px;border-bottom:1px solid rgba(${onRgb},0.06);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;}
.ph-toggle{font-size:13px;opacity:0.45;}
.ph-toggle:hover{opacity:0.9;}

.p-card{background:rgba(${onRgb},0.04);border:1px solid rgba(${onRgb},0.08);border-radius:6px;padding:8px 9px;}
.p-name{font-size:var(--lbl);color:rgba(${onRgb},0.38);margin-bottom:3px;font-weight:500;}
.p-cur{font-size:var(--val);font-weight:700;color:${accent};margin-bottom:6px;font-variant-numeric:tabular-nums;line-height:1.3;}
.p-range{width:100%;accent-color:${accent};cursor:ew-resize;display:block;margin-bottom:4px;}
.p-num{width:100%;background:rgba(${onRgb},0.07);border:1px solid rgba(${onRgb},0.1);border-radius:4px;color:${fg};font-size:12px;padding:4px 7px;outline:none;display:block;}
.p-num:focus,.p-str:focus{border-color:rgba(${accentRgb},0.6);}
.p-str{width:100%;background:rgba(${onRgb},0.07);border:1px solid rgba(${onRgb},0.1);border-radius:4px;color:${fg};font-size:12px;padding:5px 7px;outline:none;display:block;}
.empty-hint{font-size:11px;color:rgba(${onRgb},0.2);font-style:italic;line-height:1.7;padding:2px 0;}
.params-tip{font-size:10px;color:rgba(${onRgb},0.14);text-align:center;padding:7px 8px;flex-shrink:0;border-top:1px solid rgba(${onRgb},0.05);line-height:1.6;}

#trunc-banner{display:none;background:rgba(255,192,30,0.12);color:#ffc01e;font-size:11px;padding:6px 12px;border-bottom:1px solid rgba(255,192,30,0.25);flex-shrink:0;}
#runtime-error{display:none;background:rgba(239,71,67,0.14);color:#ef4743;font-size:11px;padding:8px 12px;border-bottom:1px solid rgba(239,71,67,0.3);flex-shrink:0;font-family:'Fira Code',Consolas,monospace;white-space:pre-wrap;}

@keyframes canvas-fade{from{opacity:0.45;}to{opacity:1;}}
.canvas-stepping{animation:canvas-fade 0.16s ease-out;}

#step-view{flex:1;display:flex;flex-direction:column;overflow:hidden;}

#step-header{padding:9px 12px 7px;flex-shrink:0;}
/* Restyle pass (codespecs.shah.fyi reference): one badge style regardless of step kind - 
  the reference site has no per-event-type color coding, so obs.kind now only drives the
  label text (via BADGE_LABEL), not the badge's color. */
/* Plain uppercase label, no pill/border - codespecs has no badge chrome at all here, and this
  was one more "box" in a view that already had too many; the color + weight alone still marks
  it as a distinct piece of information above the description line. */
#step-badge{display:inline-block;font-size:var(--lbl);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;color:${accent};}
#step-desc{font-size:13px;font-weight:500;color:rgba(${onRgb},0.82);line-height:1.45;min-height:18px;font-family:'Fira Code',Consolas,monospace;}
#step-counter-line{display:flex;align-items:center;gap:8px;margin-top:7px;}
#step-count-text{font-size:10px;color:rgba(${onRgb},0.3);font-variant-numeric:tabular-nums;white-space:nowrap;}
#prog-bar{flex:1;height:5px;background:rgba(${onRgb},0.08);border-radius:2px;overflow:hidden;cursor:pointer;}
#prog-fill{height:100%;background:${accent};border-radius:2px;transition:width 0.15s ease;pointer-events:none;}
#step-dots{display:flex;flex-wrap:nowrap;gap:3px;overflow-x:auto;margin-top:8px;padding-bottom:2px;}
.step-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:rgba(${onRgb},0.12);cursor:pointer;transition:transform 0.12s,background 0.12s;}
.step-dot:hover{transform:scale(1.5);}
.step-dot.active{transform:scale(1.7);background:${fg} !important;}
.step-dot-call,.step-dot-return,.step-dot-line,.step-dot-swap,.step-dot-compare,.step-dot-loop{background:rgba(${accentRgb},0.4);}

#main-row{flex:1;display:flex;overflow:hidden;min-height:0;}

#canvas-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
#stack-breadcrumb{padding:9px 18px;font-size:12px;font-family:'Fira Code',Consolas,monospace;border-bottom:1px solid rgba(${onRgb},0.06);white-space:nowrap;overflow-x:auto;flex-shrink:0;color:rgba(${onRgb},0.5);}
.bc-sep{color:rgba(${onRgb},0.18);margin:0 6px;}
.bc-active{font-weight:700;}

#anim-canvas{
 flex:1;position:relative;overflow:auto;padding:clamp(18px,3vw,40px);display:flex;flex-wrap:wrap;align-content:flex-start;gap:clamp(14px,1.6vw,26px);
 background-image:radial-gradient(rgba(${onRgb},0.05) 1px,transparent 1px);
 background-size:24px 24px;
}
.canvas-empty{color:rgba(${onRgb},0.2);font-style:italic;font-size:13px;padding:20px;width:100%;text-align:center;}

/* Restyle pass (codespecs.shah.fyi reference): the reference site uses plain bordered boxes
  with a near-monochrome fill and a single accent color for values, not a tinted "sticky
  note" card per kind - and cards fade in rather than bounce onto the canvas. */
@keyframes frame-enter{from{opacity:0;}to{opacity:1;}}
/* Scalar variables no longer get their own canvas card at all (see renderCanvas) - only
  arrays/lists get a .var-card now, so its width no longer needs to squeeze into an 11%
  column; it's sized to its own content instead, wide enough that class/field text never
  wraps mid-word. */
.var-card{background:rgba(${onRgb},0.03);border:1px solid rgba(${onRgb},0.14);border-radius:8px;width:auto;max-width:100%;flex-shrink:0;overflow:hidden;animation:frame-enter 0.18s ease-out;}
.vc-head{font-size:var(--lbl);color:rgba(${onRgb},0.55);background:rgba(${onRgb},0.04);padding:7px 10px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(${onRgb},0.1);letter-spacing:0.2px;font-family:'Fira Code',Consolas,monospace;white-space:nowrap;}
.vc-close{cursor:pointer;opacity:0.4;font-size:12px;padding:0 2px;}
.vc-close:hover{opacity:0.9;}
.vc-val{padding:12px 10px;font-size:var(--val);font-weight:700;font-variant-numeric:tabular-nums;word-break:break-all;font-family:'Fira Code',Consolas,monospace;}

/* Array rendering matches the reference site's memory-row look: one continuous bordered
  strip with thin internal dividers between cells, rather than separate rounded "pill"
  boxes with gaps between them. */
.arr-card{width:auto;max-width:100%;}
.arr-row{display:flex;padding:0;gap:0;overflow-x:auto;margin:12px;width:fit-content;border:1px solid rgba(${onRgb},0.18);border-radius:6px;}
.arr-box{display:flex;flex-direction:column;align-items:center;background:transparent;border:none;border-right:1px solid rgba(${onRgb},0.18);border-radius:0;padding:7px 16px;min-width:40px;flex-shrink:0;transition:background 0.15s;position:relative;}
.arr-box:last-child{border-right:none;}
.arr-idx{font-size:var(--lbl);color:rgba(${onRgb},0.35);}
.arr-val{font-size:var(--val);font-weight:600;color:${accent};font-variant-numeric:tabular-nums;font-family:'Fira Code',Consolas,monospace;}
.arr-box.arr-changed{background:rgba(${accentRgb},0.24);animation:box-pulse 0.4s ease;}
.arr-box.arr-hl{background:rgba(${accentRgb},0.12);}
@keyframes box-pulse{0%{background:rgba(${accentRgb},0.5);}100%{background:rgba(${accentRgb},0.24);}}

#heap-section{display:none;flex-shrink:0;position:relative;max-height:48%;overflow:auto;border-bottom:1px solid rgba(${onRgb},0.08);}
#heap-section.has-heap{display:block;}

/* Drag handles so the heap/canvas/variables rows and columns can be expanded by hand inside
  the Visual pane itself, rather than being stuck at their default proportions. Only shown
  when there's actually something to resize (the row handle needs heap objects present; the
  column handle is always available since Variables is always shown). */
#heap-resizer{display:none;height:6px;flex-shrink:0;cursor:row-resize;background:rgba(${onRgb},0.02);position:relative;}
#heap-section.has-heap + #heap-resizer{display:block;}
#heap-resizer:hover,#heap-resizer.resizing{background:rgba(${accentRgb},0.28);}
#heap-resizer::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:2px;background:rgba(${onRgb},0.16);border-radius:2px;}
#vpanel-resizer{width:6px;flex-shrink:0;cursor:col-resize;background:rgba(${onRgb},0.02);position:relative;}
#vpanel-resizer:hover,#vpanel-resizer.resizing{background:rgba(${accentRgb},0.28);}
#vpanel-resizer::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:2px;height:28px;background:rgba(${onRgb},0.16);border-radius:2px;}
#heap-label{font-size:var(--lbl);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(${onRgb},0.22);padding:7px 14px 0;}
/* Deterministic flow layout instead of a force-directed simulation: boxes are placed in
  normal reading order (left-to-right, wrapping top-to-bottom) via flexbox, in the same
  stable numeric-oid order every render, so an object never jumps to a different spot
  between steps the way the old physics simulation could. position:relative is kept only
  so the SVG arrow overlay can be positioned on top of it. */
#heap-boxes{position:relative;padding:10px 14px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:16px;}
#heap-svg{position:absolute;top:0;left:0;pointer-events:none;overflow:visible;}
.heap-obj{position:static;background:rgba(${onRgb},0.03);border:1px solid rgba(${onRgb},0.16);border-radius:8px;min-width:160px;max-width:280px;width:auto;flex-shrink:0;overflow:hidden;animation:frame-enter 0.18s ease-out;}
.heap-obj-head{background:rgba(${onRgb},0.04);padding:6px 10px;font-size:var(--lbl);font-weight:700;color:${accent};border-bottom:1px solid rgba(${onRgb},0.12);font-family:'Fira Code',Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.heap-field{padding:4px 10px;font-size:var(--mono);font-family:'Fira Code',Consolas,monospace;display:flex;gap:5px;align-items:center;min-height:22px;}
.heap-fk{color:rgba(${onRgb},0.38);flex-shrink:0;}
.heap-feq{color:rgba(${onRgb},0.18);flex-shrink:0;}
.heap-fv{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;}
.heap-fref{color:${accent};font-style:italic;}

#vars-panel{width:clamp(150px,14%,260px);flex-shrink:0;border-left:1px solid rgba(${onRgb},0.07);overflow-y:auto;display:flex;flex-direction:column;}
#vars-list{padding:6px 0;}
.var-row{display:flex;gap:6px;font-family:'Fira Code',Consolas,monospace;font-size:var(--mono);padding:5px 12px;line-height:1.75;flex-wrap:wrap;}
.var-row-k{color:rgba(${onRgb},0.4);}
.var-row-eq{color:rgba(${onRgb},0.18);}
.vars-empty{color:rgba(${onRgb},0.2);font-style:italic;font-size:11px;padding:14px 10px;text-align:center;}

#step-controls{padding:7px 12px 9px;flex-shrink:0;border-top:1px solid rgba(${onRgb},0.06);}
#ctrl-row{display:flex;align-items:center;gap:5px;margin-bottom:5px;}
.ctrl-btn{background:rgba(${onRgb},0.07);border:1px solid rgba(${onRgb},0.1);border-radius:5px;color:rgba(${onRgb},0.7);font-size:12px;font-weight:600;padding:5px 10px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
.ctrl-btn:hover:not(:disabled){background:rgba(${onRgb},0.12);color:${fg};}
.ctrl-btn:disabled{opacity:0.22;cursor:default;}
/* Play is the only thing that starts autoplay (no spacebar shortcut), so it's sized a bit
  bigger than the plain step buttons around it - but otherwise static: codespecs.shah.fyi has
  no idle animation anywhere, and a pulsing glow on a button nothing else in the UI does read
  as busier than intended. Removed in the cleanup pass; the color + size difference alone is
  enough to mark it as the primary action. */
#btn-play{background:rgba(44,187,93,0.14);border:1.5px solid rgba(44,187,93,0.45);color:#2cbb5d;flex:1.6;justify-content:center;font-size:13px;padding:7px 10px;}
#btn-play:hover:not(:disabled){background:rgba(44,187,93,0.24);}
#btn-play.playing{background:rgba(255,192,30,0.14);border-color:rgba(255,192,30,0.5);color:#ffc01e;}
#speed-select{background:rgba(${onRgb},0.07);border:1px solid rgba(${onRgb},0.1);border-radius:5px;color:rgba(${onRgb},0.45);font-size:11px;padding:4px 6px;outline:none;cursor:pointer;}
.kbd-hint{font-size:10px;color:rgba(${onRgb},0.15);text-align:center;letter-spacing:0.2px;}
.kbd{display:inline-block;background:rgba(${onRgb},0.07);border:1px solid rgba(${onRgb},0.1);border-radius:3px;padding:0 4px;font-size:9.5px;color:rgba(${onRgb},0.3);}

#flow-view{flex:1;display:none;flex-direction:column;overflow:hidden;}
#flow-view.visible{display:flex;}
#flow-scroll{flex:1;overflow:auto;padding:22px;}

/* Mindmap-style call tree: each node is a floating card connected to its parent by a dashed
  line, children laid out in a vertical trunk to the right of the parent (classic file-tree /
  org-chart CSS pattern). No layout engine needed, just border + ::before connector lines, so
  it stays as robust as the rest of the rewrite. */
.tree-root{display:flex;flex-direction:column;gap:14px;}
.tree-item{position:relative;}
.tree-children{margin-left:26px;padding-left:22px;border-left:1.5px dashed rgba(${onRgb},0.18);margin-top:10px;display:flex;flex-direction:column;gap:10px;}
.tree-children .tree-item::before{content:'';position:absolute;left:-22px;top:19px;width:20px;height:0;border-top:1.5px dashed rgba(${onRgb},0.18);}

.node-box{display:inline-block;border:1px solid rgba(${onRgb},0.1);border-left:3px solid;border-radius:8px;padding:8px 12px;background:rgba(${onRgb},0.035);box-shadow:0 3px 10px rgba(0,0,0,0.18);transition:background 0.12s,transform 0.12s;}
.node-box.clickable{cursor:pointer;}
.node-box.clickable:hover{background:rgba(${onRgb},0.07);transform:translateY(-1px);}
.t-row{display:flex;align-items:center;gap:8px;}
.t-fn{font-family:'Fira Code',Consolas,monospace;font-size:var(--val);font-weight:700;}
.t-arrow{font-size:var(--lbl);color:rgba(${onRgb},0.25);transition:transform 0.15s;display:inline-block;}
.node-box.open .t-arrow{transform:rotate(90deg);}
.t-ret{font-family:monospace;font-size:var(--mono);color:rgba(${onRgb},0.32);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.t-ln{font-size:var(--lbl);color:rgba(${onRgb},0.2);white-space:nowrap;}
.t-locals{display:none;margin-top:6px;padding-top:6px;border-top:1px solid rgba(${onRgb},0.07);font-family:monospace;font-size:var(--mono);line-height:1.8;}
.node-box.open .t-locals{display:block;}
.tl-k{color:rgba(${onRgb},0.4);}

.empty-state{padding:24px 12px;text-align:center;color:rgba(${onRgb},0.2);font-size:12px;font-style:italic;line-height:1.8;}
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
  <div id="runtime-error"></div>

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
    <div id="canvas-wrap">
     <div id="stack-breadcrumb"></div>
     <div id="heap-section">
      <div id="heap-label">Heap Objects</div>
      <div id="heap-boxes"></div>
      <svg id="heap-svg" width="0" height="0">
       <defs>
        <marker id="heap-arr" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
         <polygon points="0 0, 7 2.5, 0 5" fill="rgba(${accentRgb},0.6)"/>
        </marker>
       </defs>
      </svg>
     </div>
     <div id="heap-resizer" title="Drag to resize"></div>
     <div id="anim-canvas"></div>
    </div>
    <div id="vpanel-resizer" title="Drag to resize"></div>
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
      <option value="3800">0.5x</option>
      <option value="2200" selected>1x</option>
      <option value="1250">2x</option>
      <option value="650">4x</option>
     </select>
    </div>
    <div class="kbd-hint">
     <span class="kbd">&#8592;</span> <span class="kbd">&#8594;</span> step &nbsp; <span class="kbd">Space</span> play/pause
    </div>
   </div>
  </div>

  <div id="flow-view">
   <div class="ph"><span>Call Tree</span><span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(${onRgb},0.14);">click a tile to inspect locals</span></div>
   <div id="flow-scroll"><div id="call-tree" class="tree-root"></div></div>
  </div>
 </div>

</div>
<script>
var payload = JSON.parse(${safeTrace});
var trace = payload.frames || [];
var truncated = !!payload.truncated;
var src = ${safeCode};

// Restyle pass (codespecs.shah.fyi reference): one accent color for everything - function
// names in the breadcrumb/call-tree no longer get a rainbow per-name color; the current
// frame is distinguished by weight (.bc-active) instead of hue.
var ACCENT = '${accent}';
function col(name) { return ACCENT; }

function esc(s) {
 return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Restyle pass (codespecs.shah.fyi reference): the reference uses one accent color for every
// value regardless of type, rather than a distinct hue per kind - kindColor() now always
// returns ACCENT, but keeps its signature so every call site (scalar cards, array cells,
// the Variables panel, the Flow-view locals) needed no further changes.
function kindColor(k) { return ACCENT; }

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
   heap: f.heap || null,
   stack: stack.map(function(s){ return { func: s.func, line: s.line }; }),
   activeIdx: stack.length - 1
  });
  if (f.event === 'return') stack.pop();
 }
 return steps;
}

// Most real swaps (e.g. the classic temp = a; a = b; b = temp pattern) are spread across
// several consecutive 'line' steps, so only ONE array index actually changes per step - a
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
   if (changed.length === 1) continue; // mid-swap - keep the old baseline and wait
   if (changed.length === 2 && base[changed[0]] === e.items[changed[1]] && base[changed[1]] === e.items[changed[0]]) {
    result[i] = { name: nm, pair: [changed[0], changed[1]] };
   }
   baseline[nm] = e.items.slice();
  }
 }
 return result;
}

// Resolves a simple index expression ("j", "j + 1", "3") against the current locals.
// Heuristic, source-text based - same caveat class as detectHighlightedIndices.
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
  if (lv) return { text: 'Loop check - ' + loopVar + ' = ' + lv.r, kind: 'loop' };
 }

 return { text: lineText || ('Line ' + step.line), kind: 'line' };
}

var steps = computeSteps(trace);
var swapEvents = precomputeSwaps();
var currentStep = 0;
var playing = false;
var playTimer = null;
var hiddenCards = new Set();

// There's no source panel inside this view anymore - the real CodeMirror editor on the left
// IS the source view. Instead of duplicating the code here, every step posts its active line
// number up to the parent app, which highlights and auto-scrolls that line in the real editor.
function reportActiveLine(lineNum) {
 window.parent.postMessage({ type: 'trace_line', line: lineNum || null }, '*');
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

function attachCloseHandler(card, name) {
 var closeBtn = card.querySelector('.vc-close');
 if (!closeBtn) return;
 closeBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  hiddenCards.add(name);
  renderStep(currentStep);
 });
}

function buildArrayCard(name, entry, prevEntry, lineText, allLocals) {
 var card = document.createElement('div');
 card.className = 'var-card arr-card';
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
  '<div class="vc-head"><span>' + esc(name)+': '+entry.k+'['+items.length+']</span><span class="vc-close">×</span></div>' +
  '<div class="arr-row">'+boxes+'</div>';
 attachCloseHandler(card, name);
 return card;
}

// Renders one heap-field row for either an object's field or a dict's key/value entry - 
// shared so dict cards and object-instance cards reuse the exact same ref-detection,
// arrow-edge registration, and data-field-ref markup that drawHeapArrows() reads.
function heapRowHtml(oid, labelEsc, sep, fv, edges) {
 var isRef = fv && (fv.k === 'obj' || fv.k === 'ref') && fv.oid != null;
 if (isRef) edges.push({ source: oid, target: String(fv.oid) });
 var valHtml = isRef
  ? '<span class="heap-fv heap-fref" data-ref-oid="'+fv.oid+'">&#8594; '+esc(fv.cls || ('obj#'+fv.oid))+'</span>'
  : '<span class="heap-fv" title="'+esc(shortLabel(fv))+'" style="color:'+kindColor(fv.k)+'">'+esc(shortLabel(fv))+'</span>';
 return '<div class="heap-field" data-field-ref="'+(isRef ? fv.oid : '')+'">'+
  '<span class="heap-fk">'+labelEsc+'</span>'+
  '<span class="heap-feq">'+sep+'</span>'+valHtml+'</div>';
}

// Renders heap objects (user-defined class instances) in the dedicated #heap-section strip
// above the variable cards. Visible only when the current step's frame carries a heap snapshot.
// Restyle pass (codespecs.shah.fyi reference): boxes are placed in a deterministic flow layout
// (plain flexbox, wrapping left-to-right/top-to-bottom in the same stable numeric-oid order
// every render - JS already sorts integer-like string object keys ascending) instead of the
// previous force-directed physics simulation. This trades "nodes automatically spread apart"
// for "an object never jumps to a different spot between steps," which is easier for a
// beginner to build a mental map from - you can always find object #2 in the same relative
// spot it was last step. SVG arrows are drawn async via rAF, guarded by a generation counter
// so rapid stepping never leaves stale arrows from a previous renderHeap call on screen.
var __heapGen = 0;
function renderHeap(step) {
 var section = document.getElementById('heap-section');
 var boxes = document.getElementById('heap-boxes');
 var svg = document.getElementById('heap-svg');
 var heap = step.heap;
 if (!heap || !Object.keys(heap).length) {
  section.classList.remove('has-heap');
  return;
 }
 section.classList.add('has-heap');
 boxes.innerHTML = '';
 Array.prototype.slice.call(svg.querySelectorAll('path')).forEach(function(p){ p.parentNode.removeChild(p); });

 var gen = ++__heapGen;
 var oids = Object.keys(heap);
 var edges = [];

 oids.forEach(function(oid) {
  var obj = heap[oid];
  var isDict = obj.kind === 'dict';
  var div = document.createElement('div');
  div.className = 'heap-obj' + (isDict ? ' heap-dict-obj' : '');
  div.setAttribute('data-oid', oid);
  var bodyHtml;
  if (isDict) {
   var entries = obj.entries || [];
   bodyHtml = entries.map(function(de) {
    return heapRowHtml(oid, esc(de.key), ':', de.value, edges);
   }).join('');
  } else {
   var fields = obj.fields || {};
   bodyHtml = Object.keys(fields).map(function(fn) {
    return heapRowHtml(oid, esc(fn), '=', fields[fn], edges);
   }).join('');
  }
  div.innerHTML =
   '<div class="heap-obj-head" title="'+esc(isDict ? 'dict' : obj.cls)+' #'+oid+'">'+esc(isDict ? 'dict' : obj.cls)+'<span style="opacity:0.4;font-weight:400"> #'+oid+'</span></div>'+
   (bodyHtml || '<div class="heap-field"><span style="color:rgba(${onRgb},0.2);font-style:italic">&#8960;</span></div>');
  boxes.appendChild(div);
 });

 requestAnimationFrame(function() {
  if (gen !== __heapGen) return;
  svg.setAttribute('width', boxes.scrollWidth);
  svg.setAttribute('height', boxes.scrollHeight);
  drawHeapArrows(section, boxes, svg);
 });
}

// Coordinates are computed from offsetLeft/offsetTop relative to #heap-boxes (the force-layout
// container) rather than getBoundingClientRect - the boxes can now exceed the visible section
// and scroll (force layout can produce a 2D arrangement, not just one row), and offset-based
// math stays correct regardless of scroll position since it never touches viewport coordinates.
// Builds an orthogonal (right-angle) elbow path from a source box to a target box, so the
// arrow exits and enters at box edges - never at the middle of a box, never cutting straight
// across a box's text - and routes around boxes instead of drawing a diagonal line through
// whatever sits between them. Picks the exit/entry sides (left/right vs top/bottom) from
// whichever axis separates the two box centers more, so the path always leaves the source
// perpendicular to its border and arrives at the target perpendicular to its border, with a
// short straight run past each edge (EDGE_GAP) before the turn so the line doesn't hug the
// box outline. This is a heuristic router, not full obstacle-avoidance pathfinding - it keeps
// the line off the two boxes it connects, but with a dense graph it can still cross an
// unrelated third box.
var EDGE_GAP = 10;
function elbowPath(srcRect, tgtRect) {
 var sCx = srcRect.left + srcRect.width / 2, sCy = srcRect.top + srcRect.height / 2;
 var tCx = tgtRect.left + tgtRect.width / 2, tCy = tgtRect.top + tgtRect.height / 2;
 var dx = tCx - sCx, dy = tCy - sCy;
 var horizontal = Math.abs(dx) >= Math.abs(dy);
 var x1, y1, x2, y2, pts;
 if (horizontal) {
  var goRight = dx >= 0;
  x1 = goRight ? srcRect.left + srcRect.width : srcRect.left;
  y1 = sCy;
  x2 = goRight ? tgtRect.left : tgtRect.left + tgtRect.width;
  y2 = tCy;
  var gap1x = goRight ? x1 + EDGE_GAP : x1 - EDGE_GAP;
  var gap2x = goRight ? x2 - EDGE_GAP : x2 + EDGE_GAP;
  var midX = (gap1x + gap2x) / 2;
  pts = [[x1, y1], [gap1x, y1], [midX, y1], [midX, y2], [gap2x, y2], [x2, y2]];
 } else {
  var goDown = dy >= 0;
  x1 = sCx;
  y1 = goDown ? srcRect.top + srcRect.height : srcRect.top;
  x2 = tCx;
  y2 = goDown ? tgtRect.top : tgtRect.top + tgtRect.height;
  var gap1y = goDown ? y1 + EDGE_GAP : y1 - EDGE_GAP;
  var gap2y = goDown ? y2 - EDGE_GAP : y2 + EDGE_GAP;
  var midY = (gap1y + gap2y) / 2;
  pts = [[x1, y1], [x1, gap1y], [x1, midY], [x2, midY], [x2, gap2y], [x2, y2]];
 }
 return 'M' + pts.map(function(p) { return p[0] + ',' + p[1]; }).join(' L');
}

function drawHeapArrows(section, boxes, svg) {
 svg.style.left = boxes.offsetLeft + 'px';
 svg.style.top = boxes.offsetTop + 'px';
 svg.setAttribute('width', boxes.offsetWidth);
 svg.setAttribute('height', boxes.offsetHeight);
 var boxEls = {};
 Array.prototype.slice.call(boxes.querySelectorAll('.heap-obj[data-oid]')).forEach(function(el) {
  boxEls[el.getAttribute('data-oid')] = el;
 });
 Array.prototype.slice.call(boxes.querySelectorAll('.heap-field[data-field-ref]')).forEach(function(fieldEl) {
  var targetOid = fieldEl.getAttribute('data-field-ref');
  if (!targetOid) return;
  // walk up to find parent .heap-obj
  var srcBox = fieldEl.parentNode;
  while (srcBox && !srcBox.classList.contains('heap-obj')) srcBox = srcBox.parentNode;
  var tgtBox = boxEls[String(targetOid)];
  if (!srcBox || !tgtBox || srcBox === tgtBox) return;
  var srcRect = { left: srcBox.offsetLeft, top: srcBox.offsetTop, width: srcBox.offsetWidth, height: srcBox.offsetHeight };
  var tgtRect = { left: tgtBox.offsetLeft, top: tgtBox.offsetTop, width: tgtBox.offsetWidth, height: tgtBox.offsetHeight };
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', elbowPath(srcRect, tgtRect));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'rgba(${accentRgb},0.55)');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('marker-end', 'url(#heap-arr)');
  svg.appendChild(path);
 });
}

// Rebuilds the canvas for this step. Array boxes that changed value since the previous step
// get a CSS pulse (.arr-changed, defined via @keyframes box-pulse) and a swap between two
// boxes is called out in the narration (observeStep) rather than physically animated between
// screen positions - a prior version used getBoundingClientRect-based FLIP animation to slide
// swapped boxes, but that depends on layout timing that isn't reliable inside a sandboxed
// iframe (especially while the host app's panes are mid-resize), so it's replaced here with a
// plain fade-in on the whole canvas (.canvas-stepping) plus the per-box pulse, which is far
// less likely to silently fail.
// Restyle pass (codespecs.shah.fyi reference): scalars (int/str/bool/etc) no longer get their
// own canvas card - the reference site only visualizes things that benefit from spatial
// layout (arrays, pointer graphs) on its canvas and leaves every plain value to the flat
// Variables list. Every scalar local was previously duplicated as a card here AND as a row in
// #vars-panel; cutting the canvas copy removes most of the per-step visual noise a beginner
// had to parse, without losing any information (it's still in Variables, one glance to the
// right). The canvas is now reserved for arrays/lists (heap objects render separately, above,
// in #heap-section).
function renderCanvas(stepIdx, step) {
 renderHeap(step);
 var canvas = document.getElementById('anim-canvas');
 canvas.classList.remove('canvas-stepping');
 void canvas.offsetWidth; // force reflow so the animation restarts on repeated steps
 canvas.classList.add('canvas-stepping');

 canvas.innerHTML = '';
 var names = Object.keys(step.locals).filter(function(nm){
  var e = step.locals[nm];
  return !hiddenCards.has(nm) && (e.k === 'list' || e.k === 'tuple');
 });
 if (!names.length) {
  canvas.innerHTML = '<div class="canvas-empty">No arrays to visualize at this step - see the Variables panel on the right for every value in scope.</div>';
  return;
 }
 var prevLocals = stepIdx > 0 ? steps[stepIdx-1].locals : {};
 var lineText = src.split('\\n')[step.line-1] || '';

 names.forEach(function(nm) {
  canvas.appendChild(buildArrayCard(nm, step.locals[nm], prevLocals[nm], lineText, step.locals));
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
 try {
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

  reportActiveLine(step.line);
  renderBreadcrumb(step);
  renderCanvas(n, step);
  renderVarsPanel(step);
  renderStepDots(n);
 } catch (err) {
  showRuntimeError(err);
 }
}

function setStep(n) {
 if (n < 0 || n >= steps.length) return;
 currentStep = n;
 renderStep(n);
}
// Manual Next/Prev now wrap around - reaching the end and pressing Next again loops back to
// the first step (and pressing Prev at the first step wraps to the last), independent of
// whether autoplay ever ran. This is separate from autoPlay's own end-of-pass handling below.
function nextStep() {
 if (currentStep >= steps.length - 1) { setStep(0); return; }
 setStep(currentStep + 1);
}
function prevStep() {
 if (currentStep <= 0) { setStep(steps.length - 1); return; }
 setStep(currentStep - 1);
}

function togglePlay() {
 playing = !playing;
 var btn = document.getElementById('btn-play');
 if (playing) {
  btn.innerHTML = '&#10074;&#10074; Pause';
  btn.classList.add('playing');
  // If we're already sitting at (or past) the last step, restart from the beginning so
  // clicking Play is always an obvious "go" rather than immediately hitting the end-of-steps
  // check in autoPlay and stopping again with no visible movement.
  if (currentStep >= steps.length - 1) currentStep = -1;
  autoPlay();
 } else {
  btn.innerHTML = '&#9654; Play';
  btn.classList.remove('playing');
  clearTimeout(playTimer);
 }
}

// One full pass per Play click, not an unattended infinite loop: autoplay stops once it
// reaches the last step, rather than looping back and continuing on its own. Starting another
// pass is always available - click Play again (togglePlay above resets to the start first) - 
// but the tool never keeps animating indefinitely without the user asking for that specific
// run, matching the "no unprompted movement" principle from the spacebar-accident fix while
// still making a fresh run one deliberate click away.
function autoPlay() {
 if (!playing) return;
 if (currentStep >= steps.length-1) {
  playing = false;
  var btn = document.getElementById('btn-play');
  btn.innerHTML = '&#9654; Play';
  btn.classList.remove('playing');
  return;
 }
 setStep(currentStep + 1);
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
  if (steps.length) reportActiveLine(steps[currentStep].line);
 } else {
  stepView.style.display = 'none';
  flowView.classList.add('visible');
  btnStep.classList.remove('active');
  btnFlow.classList.add('active');
  reportActiveLine(null); // Flow view has no single "current line" to highlight
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

// Lets the real CodeMirror editor's gutter drive this view: App.jsx posts { type:'goto_line',
// line } when the user clicks a line number after a run has produced a trace. Jumps to the
// first step at or after the current position whose source line matches (so repeatedly
// clicking a line inside a loop steps forward through each visit of it, like "run to line" in
// a real debugger); if none is found after the current step, wraps to the first occurrence
// anywhere in the trace. If the clicked line never appears in the trace at all (a comment, a
// blank line, or code that never ran), this silently does nothing rather than guessing at the
// nearest line - an exact match is the only thing that reads as intentional to a beginner.
window.addEventListener('message', function(e) {
 if (!e.data || e.data.type !== 'goto_line' || !steps.length) return;
 var targetLine = e.data.line;
 var firstMatch = -1;
 for (var i = 0; i < steps.length; i++) {
  if (steps[i].line !== targetLine) continue;
  if (firstMatch === -1) firstMatch = i;
  if (i > currentStep) { setStep(i); return; }
 }
 if (firstMatch !== -1) setStep(firstMatch);
});

// Lets the Variables column and the Heap Objects row be expanded by hand inside the Visual
// pane itself, rather than being stuck at fixed proportions. Plain mousedown/mousemove/mouseup
// (not the drag-and-drop API) so it behaves the same as the outer App's own pane-resize
// handles. Sizes are session-only (not persisted) - this is a reading aid for the current run,
// not a saved layout preference.
(function setupInternalResizers() {
 var vResizer = document.getElementById('vpanel-resizer');
 var varsPanel = document.getElementById('vars-panel');
 var mainRow = document.getElementById('main-row');
 var draggingV = false;

 vResizer.addEventListener('mousedown', function(e) {
  draggingV = true;
  vResizer.classList.add('resizing');
  document.body.style.userSelect = 'none';
  e.preventDefault();
 });

 var hResizer = document.getElementById('heap-resizer');
 var heapSection = document.getElementById('heap-section');
 var canvasWrap = document.getElementById('canvas-wrap');
 var draggingH = false;

 hResizer.addEventListener('mousedown', function(e) {
  draggingH = true;
  hResizer.classList.add('resizing');
  document.body.style.userSelect = 'none';
  e.preventDefault();
 });

 document.addEventListener('mousemove', function(e) {
  if (draggingV) {
   var rowRect = mainRow.getBoundingClientRect();
   var newWidth = rowRect.right - e.clientX;
   newWidth = Math.max(140, Math.min(rowRect.width - 200, newWidth));
   varsPanel.style.width = newWidth + 'px';
  }
  if (draggingH) {
   var wrapRect = canvasWrap.getBoundingClientRect();
   var newHeight = e.clientY - wrapRect.top;
   var maxHeight = wrapRect.height * 0.8;
   newHeight = Math.max(50, Math.min(maxHeight, newHeight));
   heapSection.style.maxHeight = newHeight + 'px';
   heapSection.style.height = newHeight + 'px';
  }
 });

 document.addEventListener('mouseup', function() {
  if (draggingV) { draggingV = false; vResizer.classList.remove('resizing'); document.body.style.userSelect = ''; }
  if (draggingH) { draggingH = false; hResizer.classList.remove('resizing'); document.body.style.userSelect = ''; }
 });
})();

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

// Builds one mindmap branch: a .tree-item holding this node's card (.node-box) followed by a
// .tree-children wrapper (only present if this node has children) recursed into for the next
// level. The CSS connector lines (border-left on .tree-children, ::before on each child
// .tree-item) draw themselves from this nesting, so no coordinate math is needed here.
function renderTree(nodes, container) {
 for (var i = 0; i < nodes.length; i++) {
  var n = nodes[i];
  var c = col(n.func);

  var item = document.createElement('div');
  item.className = 'tree-item';

  var box = document.createElement('div');
  box.className = 'node-box';
  box.style.borderLeftColor = c;

  var locEntries = Object.keys(n.locals).map(function(k){ return [k, n.locals[k]]; });
  if (locEntries.length) box.classList.add('clickable');
  var locHtml = locEntries.map(function(kv) {
   return '<div><span class="tl-k">' + esc(kv[0]) + '</span> = <span style="color:' + kindColor(kv[1].k) + '">' + esc(shortLabel(kv[1])) + '</span></div>';
  }).join('');
  box.innerHTML =
   '<div class="t-row">' +
    '<span class="t-fn" style="color:'+c+'">' + esc(n.func) + '()</span>' +
    (locEntries.length ? '<span class="t-arrow">&#9654;</span>' : '') +
    '<span class="t-ln">:' + n.line + '</span>' +
    (n.ret ? '<span class="t-ret">→ ' + esc(shortLabel(n.ret).slice(0,20)) + '</span>' : '') +
   '</div>' +
   (locEntries.length ? '<div class="t-locals">' + locHtml + '</div>' : '');
  if (locEntries.length) {
   box.addEventListener('click', (function(el){ return function(){ el.classList.toggle('open'); }; })(box));
  }
  item.appendChild(box);

  if (n.children.length) {
   var childWrap = document.createElement('div');
   childWrap.className = 'tree-children';
   renderTree(n.children, childWrap);
   item.appendChild(childWrap);
  }

  container.appendChild(item);
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
  list.innerHTML = '<div class="empty-hint">No editable parameters found.<br>Use keyword args like<br><code style="color:${accent};font-family:monospace;font-size:11px">num_times=3</code></div>';
  return;
 }
 params.forEach(function(p) {
  var card = document.createElement('div');
  card.className = 'p-card';
  if (p.type === 'num') {
   var cur = p.value;
   var maxV = Math.max(20, Math.ceil(cur*5));
   var minV = cur < 0 ? Math.floor(cur*3) : 0;
   // appliedOrig tracks the text as it actually exists in the parent App's source right
   // now - it must only advance when a code_patch message is actually SENT, not on every
   // 'input' tick while dragging. Dragging fires many 'input' events in quick succession,
   // but the postMessage below is debounced (only the last one in a burst actually fires).
   // The previous version advanced its "from" tracker on every tick regardless, so after a
   // fast drag the debounced message's 'from' string was some skipped-over intermediate
   // value (e.g. "num_times=6") that never actually got applied to the real source (still
   // "num_times=3") - App.jsx's codeRef.current.replace(from, to) found no match, silently
   // no-opped, and the slider looked like it had no effect on the running visualization.
   var appliedOrig = p.original;
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
    // Computed relative to appliedOrig (the last value actually confirmed applied), not
    // relative to whatever the previous un-sent tick calculated - so every pending patch
    // in a debounce burst independently describes "from the real current source" all the
    // way to the latest dragged value, and only the last one need ever actually fire.
    var to = appliedOrig.replace(/(\\d+(?:\\.\\d+)?)$/, String(newV));
    clearTimeout(debT);
    debT = setTimeout(function() {
     var from = appliedOrig;
     appliedOrig = to;
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

function showRuntimeError(err) {
 var el = document.getElementById('runtime-error');
 el.textContent = 'Trace visualizer error: ' + (err && err.message ? err.message : err);
 el.style.display = 'block';
}

// Everything below reads the trace and builds the initial view. Wrapped in try/catch so a
// bug here surfaces as a visible banner instead of silently leaving the pane blank, which is
// how earlier breakages went unnoticed until manual inspection.
try {
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
} catch (err) {
 showRuntimeError(err);
}
</script>
</body>
</html>`
}

// ─── Session 8: Haskell Layer B - Lazy Steps view ────────────────────────────
// Renders a mini-Haskell step trace produced by haskellStepper.stepEval().
// Each step shows: the redex (sub-expression being reduced), what it reduced to,
// and which reduction rule was applied.
//
// Step format: { step, redex, result, annotation }
// stepsPayload: JSON string with { steps: Step[], resultStr: string, truncated: boolean }

export function buildHaskellSrcdoc(stepsPayload, darkMode = true) {
  let parsed
  try {
    parsed = JSON.parse(stepsPayload)
  } catch {
    parsed = { steps: [], resultStr: '?', truncated: false }
  }
  const { steps, resultStr, truncated, error } = parsed
  const safeSteps = JSON.stringify(steps)

  // Same theme approach as buildTraceSrcdoc above - a separate srcdoc document that has to
  // bake the parent app's light/dark choice into its own generated CSS. Chip-style elements
  // (`.badge`, `.step-num`) intentionally keep their fixed dark backgrounds in both themes,
  // since their own bright accent color (not the page) is what they need to contrast against.
  const bg = darkMode ? '#1a1a1a' : '#f5f5f6'
  const bgHeader = darkMode ? '#1f1f1f' : '#ffffff'
  const bgElevated = darkMode ? '#2a2a2a' : '#ececed'
  const bgElevatedHover = darkMode ? '#333' : '#dcdce0'
  const fg = darkMode ? '#eff1f6' : '#1c1c20'
  const onRgb = darkMode ? '255,255,255' : '0,0,0'
  // Brand accent (badge, arrow, active-card border, scrubber, step-num chip) - orange reads
  // fine on the dark theme's near-black background, but is too washed out against a light
  // page, so light mode uses a deeper brown-orange instead. redex is a separate color: the
  // "currently reducing" expression used to render in the same yellow as the accent, which on
  // a near-white step-expr card looked like faint yellow text on white - replaced with a blue
  // that has real contrast against both a dark and a light card background, and reads as
  // clearly distinct from the accent and from the green "result" color next to it.
  const accent = darkMode ? '#ffa116' : '#b35900'
  const accentRgb = darkMode ? '255,161,22' : '179,89,0'
  const redex = darkMode ? '#7aa2f7' : '#1c5fd1'
  const redexRgb = darkMode ? '122,162,247' : '28,95,209'

  return String.raw`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{
 background:${bg};color:${fg};
 font-family:'Fira Code','Cascadia Code',Menlo,monospace;
 font-size:13px;height:100vh;overflow:hidden;display:flex;flex-direction:column;
}
#header{
 background:${bgHeader};border-bottom:1px solid rgba(${onRgb},0.08);
 padding:8px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0;
}
.badge{
 background:#313131;border:1px solid rgba(${onRgb},0.12);
 border-radius:4px;padding:2px 8px;font-size:11px;color:#ffa116;
 font-weight:600;letter-spacing:0.3px;
}
.lang-tag{color:rgba(${onRgb},0.35);font-size:11px;}
.step-counter{margin-left:auto;color:rgba(${onRgb},0.4);font-size:11px;font-variant-numeric:tabular-nums;}
#controls{
 display:flex;gap:6px;align-items:center;padding:6px 14px;
 border-bottom:1px solid rgba(${onRgb},0.06);flex-shrink:0;
}
button{
 background:${bgElevated};border:1px solid rgba(${onRgb},0.1);color:${fg};
 border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:inherit;
}
button:hover{background:${bgElevatedHover};border-color:rgba(${onRgb},0.2);}
button:disabled{opacity:0.3;cursor:default;}
#btn-run{background:#1e3a20;border-color:#2cbb5d;color:#2cbb5d;font-weight:700;padding:5px 14px;}
#btn-run:hover{background:#1e4a20;}
#btn-run.playing{background:#3a2f10;border-color:#ffc01e;color:#ffc01e;}
.speed-sel{
 background:${bgElevated};border:1px solid rgba(${onRgb},0.1);color:${fg};
 border-radius:4px;padding:4px 8px;font-size:12px;font-family:inherit;cursor:pointer;
 margin-left:auto;
}
#scrubber{
 width:100%;accent-color:${accent};cursor:pointer;
}
#scrubber-row{padding:4px 14px 6px;flex-shrink:0;}
#step-area{flex:1;overflow-y:auto;padding:14px;}
.step-card{
 border:1px solid rgba(${onRgb},0.08);border-radius:6px;
 margin-bottom:10px;overflow:hidden;
 animation:card-in 0.18s ease both;
}
@keyframes card-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.step-card.active{border-color:${accent};box-shadow:0 0 0 1px rgba(${accentRgb},0.15);}
.step-hd{
 background:rgba(${onRgb},0.04);padding:6px 12px;
 display:flex;align-items:center;gap:8px;
 border-bottom:1px solid rgba(${onRgb},0.06);
}
.step-num{
 font-size:10px;font-weight:700;letter-spacing:0.4px;
 background:${accent};color:#1a1a1a;border-radius:3px;
 padding:1px 6px;
}
.step-annotation{color:rgba(${onRgb},0.4);font-size:11px;font-style:italic;}
.step-body{padding:10px 12px;display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:start;}
.step-col{min-width:0;}
.step-label{font-size:10px;color:rgba(${onRgb},0.3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;}
.step-expr{
 color:${fg};white-space:pre-wrap;word-break:break-all;
 background:rgba(${onRgb},0.03);border-radius:4px;padding:6px 8px;
 border:1px solid rgba(${onRgb},0.05);
}
.step-expr.redex{color:${redex};border-color:rgba(${redexRgb},0.25);}
.step-expr.result{color:#2cbb5d;border-color:rgba(44,187,93,0.2);}
.arrow{color:${accent};font-size:18px;padding-top:18px;align-self:center;}
#result-bar{
 background:${bgHeader};border-top:1px solid rgba(44,187,93,0.3);
 padding:8px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;
}
.result-label{font-size:11px;color:#2cbb5d;font-weight:600;}
.result-val{color:${fg};}
.truncated-banner{
 background:rgba(${accentRgb},0.1);border:1px solid rgba(${accentRgb},0.3);
 border-radius:4px;padding:6px 12px;margin-bottom:10px;
 color:${accent};font-size:12px;
}
.error-banner{
 background:rgba(239,71,67,0.1);border:1px solid rgba(239,71,67,0.3);
 border-radius:4px;padding:10px 12px;color:#ef4743;
}
.empty-state{
 color:rgba(${onRgb},0.3);text-align:center;padding:40px 20px;font-size:13px;
}
</style>
</head>
<body>
<div id="header">
 <span class="badge">λ Lazy stepper</span>
 <span class="lang-tag">mini-Haskell Layer B</span>
 <span class="step-counter" id="step-counter">0 / 0 steps</span>
</div>
<div id="controls">
 <button id="btn-prev" disabled>◀ Prev</button>
 <button id="btn-next">Next ▶</button>
 <button id="btn-run">▶ Play</button>
 <button id="btn-first" title="Jump to start">⏮</button>
 <button id="btn-last" title="Jump to end">⏭</button>
 <select class="speed-sel" id="speed-sel">
  <option value="3200">0.5x</option>
  <option value="1600" selected>1x</option>
  <option value="800">2x</option>
  <option value="400">4x</option>
 </select>
</div>
<div id="scrubber-row">
 <input type="range" id="scrubber" min="0" value="0" step="1">
</div>
<div id="step-area"></div>
<div id="result-bar">
 <span class="result-label">Result</span>
 <span class="result-val" id="result-val"> - </span>
</div>
<script>
const STEPS = ${safeSteps};
const RESULT = ${JSON.stringify(resultStr || ' - ')};
const TRUNCATED = ${!!truncated};
const ERROR = ${JSON.stringify(error || null)};
const MAX_SHOW = 60; // render at most this many cards at once

let cur = -1;
let playing = false;
let timer = null;

const stepArea = document.getElementById('step-area');
const counter = document.getElementById('step-counter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnPlay = document.getElementById('btn-run');
const btnFirst = document.getElementById('btn-first');
const btnLast = document.getElementById('btn-last');
const scrubber = document.getElementById('scrubber');
const resultVal = document.getElementById('result-val');

scrubber.max = Math.max(0, STEPS.length - 1);
resultVal.textContent = RESULT;

function esc(s) {
 return String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function render() {
 if (STEPS.length === 0) {
  stepArea.innerHTML = ERROR
   ? '<div class="error-banner">Error: ' + esc(ERROR) + '</div>'
   : '<div class="empty-state">No reduction steps recorded.<br>Try: <code>take 5 [1..]</code> or <code>map (*2) [1..5]</code></div>';
  counter.textContent = '0 / 0 steps';
  return;
 }

 const total = STEPS.length;
 const show = cur < 0 ? [] : STEPS.slice(Math.max(0, cur - MAX_SHOW + 1), cur + 1);

 let html = '';
 if (TRUNCATED) {
  html += '<div class="truncated-banner">Step limit reached (' + total + ' steps shown). The expression was truncated.</div>';
 }
 if (show.length === 0) {
  html += '<div class="empty-state">Press Next ▶ to start stepping through reductions.</div>';
 } else {
  for (let i = 0; i < show.length; i++) {
   const s = show[i];
   const isActive = i === show.length - 1;
   html += '<div class="step-card' + (isActive ? ' active' : '') + '">';
   html += '<div class="step-hd"><span class="step-num">Step ' + (s.step + 1) + '</span>';
   html += '<span class="step-annotation">' + esc(s.annotation) + '</span></div>';
   html += '<div class="step-body">';
   html += '<div class="step-col"><div class="step-label">Reducing</div><div class="step-expr redex">' + esc(s.redex) + '</div></div>';
   html += '<div class="arrow">→</div>';
   html += '<div class="step-col"><div class="step-label">Result</div><div class="step-expr result">' + esc(s.result) + '</div></div>';
   html += '</div></div>';
  }
 }
 stepArea.innerHTML = html;
 // Scroll last card into view
 const cards = stepArea.querySelectorAll('.step-card');
 if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });

 counter.textContent = (cur + 1) + ' / ' + total + ' steps';
 scrubber.value = Math.max(0, cur);
 btnPrev.disabled = cur <= 0;
 btnNext.disabled = cur >= total - 1;
 btnFirst.disabled = cur <= 0;
 btnLast.disabled = cur >= total - 1;
 btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
 btnPlay.classList.toggle('playing', playing);
}

function goTo(n) {
 cur = Math.min(STEPS.length - 1, Math.max(-1, n));
 render();
}

// Manual Prev/Next wrap around, independent of autoplay: Next at the last step loops back to
// the first, Prev at the first step wraps to the last.
function step(dir) {
 if (dir > 0 && cur >= STEPS.length - 1) { goTo(0); return; }
 if (dir < 0 && cur <= 0) { goTo(STEPS.length - 1); return; }
 goTo(cur + dir);
}

function startPlay() {
 playing = true;
 btnPlay.textContent = '⏸ Pause';
 // Restart from the beginning if we're at (or past) the end, so Play is always an obvious
 // "go" rather than immediately hitting tick()'s end-of-steps check and stopping again.
 if (cur >= STEPS.length - 1) cur = -1;
 tick();
}

function stopPlay() {
 playing = false;
 clearTimeout(timer);
 btnPlay.textContent = '▶ Play';
}

// One full pass per Play click rather than an unattended infinite loop - autoplay stops once
// it reaches the last step. Starting another pass is always one click away (startPlay above
// resets to the beginning first), but the stepper never keeps animating on its own past a
// single run.
function tick() {
 if (!playing) return;
 if (cur >= STEPS.length - 1) { stopPlay(); return; }
 step(1);
 const speed = parseInt(document.getElementById('speed-sel').value, 10) || 1600;
 timer = setTimeout(tick, speed);
}

btnPrev.addEventListener('click', () => { stopPlay(); step(-1); });
btnNext.addEventListener('click', () => { stopPlay(); step(1); });
btnFirst.addEventListener('click', () => { stopPlay(); goTo(0); });
btnLast.addEventListener('click', () => { stopPlay(); goTo(STEPS.length - 1); });
btnPlay.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
scrubber.addEventListener('input', () => { stopPlay(); goTo(parseInt(scrubber.value, 10)); });
document.addEventListener('keydown', e => {
 if (e.key === 'ArrowRight') { stopPlay(); step(1); }
 if (e.key === 'ArrowLeft') { stopPlay(); step(-1); }
 if (e.key === ' ') { e.preventDefault(); playing ? stopPlay() : startPlay(); }
});

render();
</script>
</body>
</html>`
}

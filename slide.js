const cssVar = name =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------- Viewport scaling ---------- */
const stage = document.getElementById('stage');
const vp = document.getElementById('slide-viewport');
function scaleViewport() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const s = Math.min(w / 1920, h / 1080);
  vp.style.transform =
    `translate(${(w - 1920 * s) / 2}px, ${(h - 1080 * s) / 2}px) scale(${s})`;
}
new ResizeObserver(scaleViewport).observe(stage);
scaleViewport();

/* ---------- Slides ---------- */
const slides = [...vp.querySelectorAll(':scope > .slide')];
const TOTAL = slides.length;
slides.forEach((s, i) => { s.id = `slide-${i + 1}`; });

/* ---------- TOC: two columns for 5+ items ---------- */
document.querySelectorAll('.toc-list').forEach(list => {
  const items = [...list.querySelectorAll('.toc-item')];
  if (!items.length) return;
  items[0].classList.add('col-top');
  if (items.length < 5) return;
  const rows = Math.ceil(items.length / 2);
  list.classList.add('two-col');
  list.style.setProperty('--rows', rows);
  items[rows].classList.add('col-top');
});

/* ---------- Progress bar (runs before KaTeX rendering) ---------- */
const SECTIONS = [...document.querySelectorAll('.toc-item .toc-text')]
  .map(e => e.innerHTML.trim());
const BY_SECTION = SECTIONS.map((_, k) =>
  slides.filter(s => s.dataset.section === String(k + 1)));
const PG_ALL_NAMES = 7;   // up to 7 sections: every name shown

slides.forEach((s, i) => {
  if (!s.dataset.section || !SECTIONS.length) return;
  const n = SECTIONS.length;
  const cur = s.dataset.section === 'end' ? -1 : +s.dataset.section - 1;
  const cells = SECTIONS.map((name, k) => {
    const g = BY_SECTION[k];
    const fill = (cur < 0 || k < cur) ? 100
               : (k > cur) ? 0
               : (g.indexOf(s) + 1) / g.length * 100;
    let cls = '', label = name;
    if (k === cur) cls = ' current';
    else if (n > PG_ALL_NAMES) {
      const d = cur < 0 ? n - k : Math.abs(k - cur);
      if (d === 2) cls = ' far';
      if (d > 2) label = '';
    }
    return `<div class="pg-cell${cls}"><div class="pg-seg"><i style="width:${fill.toFixed(1)}%"></i></div>`
         + `<div class="pg-name">${label}</div></div>`;
  }).join('');
  const bar = document.createElement('div');
  bar.className = 'progress';
  bar.innerHTML = `<div class="pg-grid" style="--n:${n}">${cells}</div>`
                + `<span class="pg-num">${i + 1} / ${TOTAL}</span>`;
  s.appendChild(bar);
});

/* ---------- Navigation ---------- */
let current = 1;
function showSlide(n) {
  slides[current - 1].classList.remove('active');
  current = Math.max(1, Math.min(TOTAL, n));
  slides[current - 1].classList.add('active');
  document.getElementById('slide-counter').textContent = `${current} / ${TOTAL}`;
  document.getElementById('btn-prev').disabled = current === 1;
  document.getElementById('btn-next').disabled = current === TOTAL;
}
const navigate = d => showSlide(current + d);
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select')) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); navigate(1); }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); navigate(-1); }
});
document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next').addEventListener('click', () => navigate(1));
showSlide(1);

/* ---------- Graph class (Math and Data modules) ---------- */
class Graph {
  constructor(id, { xMin, xMax, yMin, yMax }) {
    const c = this.canvas = document.getElementById(id);
    if (!c) return;
    if (!c.dataset.w) { c.dataset.w = c.width; c.dataset.h = c.height; }
    this.W = +c.dataset.w; this.H = +c.dataset.h;
    const r = Math.max(2, window.devicePixelRatio || 1);
    if (c.width !== this.W * r) {
      c.width = this.W * r; c.height = this.H * r;
      c.style.width = this.W + 'px'; c.style.height = this.H + 'px';
    }
    this.ctx = c.getContext('2d');
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
    Object.assign(this, { xMin, xMax, yMin, yMax });
  }
  wx(x) { return (x - this.xMin) / (this.xMax - this.xMin) * this.W; }
  wy(y) { return (this.yMax - y) / (this.yMax - this.yMin) * this.H; }

  clear() {
    this.ctx.fillStyle = cssVar('--g-bg');
    this.ctx.fillRect(0, 0, this.W, this.H);
  }
  drawGrid(stepX = 1, stepY = 1) {
    const { ctx, W, H } = this;
    ctx.beginPath(); ctx.strokeStyle = cssVar('--g-grid'); ctx.lineWidth = 1;
    for (let x = Math.ceil(this.xMin / stepX) * stepX; x <= this.xMax; x += stepX) {
      ctx.moveTo(this.wx(x), 0); ctx.lineTo(this.wx(x), H);
    }
    for (let y = Math.ceil(this.yMin / stepY) * stepY; y <= this.yMax; y += stepY) {
      ctx.moveTo(0, this.wy(y)); ctx.lineTo(W, this.wy(y));
    }
    ctx.stroke();
  }
  drawAxes() {
    const { ctx, W, H } = this;
    ctx.beginPath(); ctx.strokeStyle = cssVar('--g-axis'); ctx.lineWidth = 1.5;
    if (this.yMin <= 0 && this.yMax >= 0) { ctx.moveTo(0, this.wy(0)); ctx.lineTo(W, this.wy(0)); }
    if (this.xMin <= 0 && this.xMax >= 0) { ctx.moveTo(this.wx(0), 0); ctx.lineTo(this.wx(0), H); }
    ctx.stroke();
  }
  drawCurve(f, color, lw = 3, steps = 800) {
    const { ctx } = this;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    let pen = false;
    for (let i = 0; i <= steps; i++) {
      const x = this.xMin + (this.xMax - this.xMin) * i / steps;
      const y = f(x);
      const ok = isFinite(y) && y >= this.yMin - 1 && y <= this.yMax + 1;
      if (!ok) { pen = false; continue; }
      pen ? ctx.lineTo(this.wx(x), this.wy(y)) : (ctx.moveTo(this.wx(x), this.wy(y)), pen = true);
    }
    ctx.stroke();
  }
  drawDash(f, color = cssVar('--g-ref'), lw = 3) {
    this.ctx.setLineDash([12, 8]); this.drawCurve(f, color, lw); this.ctx.setLineDash([]);
  }
  dot(x, y, color, r = 9) {
    const { ctx } = this;
    ctx.beginPath(); ctx.arc(this.wx(x), this.wy(y), r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = cssVar('--c-white'); ctx.lineWidth = 3; ctx.stroke();
  }
  text(x, y, str, color = cssVar('--c-ink'), dx = 12, dy = -12, size = 28) {
    const { ctx } = this;
    ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.font = `${size}px "IBM Plex Sans KR","IBM Plex Sans",sans-serif`;
    ctx.fillText(str, this.wx(x) + dx, this.wy(y) + dy);
  }
  ticksX(vals, fmt = String, dy = 34, size = 28) {
    const { ctx } = this;
    const y0 = Math.min(Math.max(this.wy(0), 0), this.H - dy - 4);
    ctx.fillStyle = cssVar('--g-tick'); ctx.textAlign = 'center';
    ctx.font = `${size}px "IBM Plex Sans",sans-serif`;
    for (const v of vals) ctx.fillText(fmt(v), this.wx(v), y0 + dy);
  }
  ticksY(vals, fmt = String, dx = -12, size = 28) {
    const { ctx } = this;
    const x0 = Math.min(Math.max(this.wx(0), -dx + 44), this.W);
    ctx.fillStyle = cssVar('--g-tick'); ctx.textAlign = 'right';
    ctx.font = `${size}px "IBM Plex Sans",sans-serif`;
    for (const v of vals) ctx.fillText(fmt(v), x0 + dx, this.wy(v) + 10);
  }

  /* Data module: categories at x = 1..n */
  bars(values, color = cssVar('--g-curve-1'), w = 0.6) {
    const { ctx } = this;
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const x0 = this.wx(i + 1 - w / 2), x1 = this.wx(i + 1 + w / 2);
      const y0 = this.wy(0), y1 = this.wy(v);
      ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
    });
  }
  series(values, color = cssVar('--g-curve-1'), lw = 3) {
    const { ctx } = this;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    values.forEach((v, i) => i ? ctx.lineTo(this.wx(i + 1), this.wy(v))
                               : ctx.moveTo(this.wx(i + 1), this.wy(v)));
    ctx.stroke();
    values.forEach((v, i) => this.dot(i + 1, v, color, 7));
  }
  labelsX(labels, dy = 38, size = 28) {
    const { ctx } = this;
    ctx.fillStyle = cssVar('--c-muted'); ctx.textAlign = 'center';
    ctx.font = `${size}px "IBM Plex Sans KR","IBM Plex Sans",sans-serif`;
    labels.forEach((t, i) => ctx.fillText(t, this.wx(i + 1), this.wy(0) + dy));
  }
}

/* ---------- Deck-specific graphs (edit here) ---------- */

/* Graph 확장: 선분·경로·다각형·호·화살표·상자·첨자 라벨 (모두 Graph 좌표계 사용) */
class DeckGraph extends Graph {
  get s() { return this.W / (this.xMax - this.xMin); }
  line(x0, y0, x1, y1, color, lw = 2, dash = null) {
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(this.wx(x0), this.wy(y0)); ctx.lineTo(this.wx(x1), this.wy(y1));
    ctx.stroke(); ctx.restore();
  }
  path(pts, color, lw = 3, dash = null) {
    if (!pts.length) return;
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(this.wx(x), this.wy(y)) : ctx.moveTo(this.wx(x), this.wy(y)));
    ctx.stroke(); ctx.restore();
  }
  fillPoly(pts, color, alpha = 1) {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(this.wx(x), this.wy(y)) : ctx.moveTo(this.wx(x), this.wy(y)));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  circle(x, y, r, color, alpha = 1) {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(this.wx(x), this.wy(y), r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  /* 중심 (cx, cy), 반지름 r, 각 a0 → a1 (반시계) */
  arc(cx, cy, r, a0, a1, color, lw = 3, dash = null) {
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.arc(this.wx(cx), this.wy(cy), r * this.s, -a0, -a1, true);
    ctx.stroke(); ctx.restore();
  }
  sector(cx, cy, r, a0, a1, color, alpha = 1) {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(this.wx(cx), this.wy(cy));
    ctx.arc(this.wx(cx), this.wy(cy), r * this.s, -a0, -a1, true);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  arrow(x0, y0, x1, y1, color, lw = 4) {
    const { ctx } = this;
    const X0 = this.wx(x0), Y0 = this.wy(y0), X1 = this.wx(x1), Y1 = this.wy(y1);
    const t = Math.atan2(Y1 - Y0, X1 - X0), L = 22;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(X0, Y0);
    ctx.lineTo(X1 - L * 0.8 * Math.cos(t), Y1 - L * 0.8 * Math.sin(t)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X1, Y1);
    ctx.lineTo(X1 - L * Math.cos(t - 0.42), Y1 - L * Math.sin(t - 0.42));
    ctx.lineTo(X1 - L * Math.cos(t + 0.42), Y1 - L * Math.sin(t + 0.42));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  box(x0, y0, x1, y1, fill, stroke, lw = 3) {
    const { ctx } = this;
    const X = this.wx(Math.min(x0, x1)), Y = this.wy(Math.max(y0, y1));
    const w = Math.abs(this.wx(x1) - this.wx(x0)), h = Math.abs(this.wy(y1) - this.wy(y0));
    ctx.save(); ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(X, Y, w, h, 16) : ctx.rect(X, Y, w, h);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
  }
  label(x, y, str, color = cssVar('--c-ink'), size = 30, weight = 400, align = 'center') {
    const { ctx } = this;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.font = `${weight} ${size}px "IBM Plex Sans KR","IBM Plex Sans",sans-serif`;
    ctx.fillText(str, this.wx(x), this.wy(y));
    ctx.textBaseline = 'alphabetic';
  }
  /* 기울임 글자 + 아래 첨자 (예: P_a), 가운데 정렬 */
  labelSub(x, y, base, sub, color = cssVar('--c-ink')) {
    const { ctx } = this;
    const fb = 'italic 600 34px "IBM Plex Sans",sans-serif', fs = 'italic 600 28px "IBM Plex Sans",sans-serif';
    ctx.font = fb; const wb = ctx.measureText(base).width;
    ctx.font = fs; const ws = sub ? ctx.measureText(sub).width + 2 : 0;
    const X = this.wx(x) - (wb + ws) / 2, Y = this.wy(y);
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = fb; ctx.fillText(base, X, Y);
    if (sub) { ctx.font = fs; ctx.fillText(sub, X + wb + 2, Y + 12); }
    ctx.textBaseline = 'alphabetic';
  }
}

const $ = id => document.getElementById(id);
const CURVES = () => ['--g-curve-1', '--g-curve-2', '--g-curve-3'].map(cssVar);

/* ----- 단위원 공통: 가로세로 비율 1:1 ----- */
function unitGraph(id) {
  const c = $(id); if (!c) return null;
  const W = +(c.dataset.w || c.width), H = +(c.dataset.h || c.height);
  const xMin = -0.16, xMax = 1.34, yMin = -0.16;
  return new DeckGraph(id, { xMin, xMax, yMin, yMax: yMin + (xMax - xMin) * H / W });
}
function unitBase(g) {
  const axis = cssVar('--g-axis'), ref = cssVar('--g-ref');
  g.clear();
  g.line(0, 0, g.xMax - 0.04, 0, axis, 2);
  g.line(0, 0, 0, g.yMax - 0.04, axis, 2);
  g.arc(0, 0, 1, 0, Math.PI / 2, ref, 2, [10, 8]);
}
function unitMarks(g, x, { angle = true, P = 'P', A = true } = {}) {
  const ink = cssVar('--c-ink'), muted = cssVar('--c-muted');
  if (angle) {
    g.arc(0, 0, 0.17, 0, x, muted, 2);
    g.label(0.25 * Math.cos(x / 2), 0.25 * Math.sin(x / 2), 'x', muted, 30, 600);
  }
  g.circle(0, 0, 6, ink);
  g.label(-0.07, -0.07, 'O', ink, 30, 600);
  if (A) g.label(1.02, -0.08, 'A', ink, 30, 600);
  if (P) g.label(1.1 * Math.cos(x), 1.1 * Math.sin(x), P, ink, 30, 600);
}

/* ===== 넓이 비교 (정석의 그림) ===== */
function drawArea(x = 0.7) {
  const g = unitGraph('g-area'); if (!g) return;
  const [c1, c2, c3] = CURVES();
  const P = [Math.cos(x), Math.sin(x)], T = [1, Math.tan(x)];
  unitBase(g);
  g.fillPoly([[0, 0], [1, 0], T], c3, 0.08);
  g.sector(0, 0, 1, 0, x, c2, 0.10);
  g.fillPoly([[0, 0], [1, 0], P], c1, 0.12);
  g.path([[0, 0], [1, 0], T, [0, 0]], c3, 3);
  g.path([[0, 0], [1, 0], P, [0, 0]], c1, 3);
  g.arc(0, 0, 1, 0, x, c2, 5);
  unitMarks(g, x, { P: null });
  g.label(1.1 * Math.cos(x + 0.1), 1.1 * Math.sin(x + 0.1), 'P', cssVar('--c-ink'), 30, 600);
  g.label(1.08, T[1], 'T', cssVar('--c-ink'), 30, 600);
}
function initArea() {
  const s = $('area-slider'); if (!s) return;
  const upd = () => {
    const x = +s.value;
    $('area-value').textContent = x.toFixed(2);
    drawArea(x);
    $('area-info').innerHTML = `sin x / x = <strong>${(Math.sin(x) / x).toFixed(3)}</strong>`;
  };
  s.addEventListener('input', upd); upd();
}

/* ===== 사분원의 넓이 ===== */
function drawQuarter() {
  const g = unitGraph('g-quarter'); if (!g) return;
  const [c1] = CURVES();
  unitBase(g);
  const pts = [[0, 0]];
  for (let i = 0; i <= 200; i++) { const x = i / 200; pts.push([x, Math.sqrt(1 - x * x)]); }
  g.fillPoly(pts, c1, 0.16);
  g.path(pts.slice(1), c1, 4);
  g.circle(0, 0, 6, cssVar('--c-ink'));
  g.label(-0.07, -0.07, 'O', cssVar('--c-ink'), 30, 600);
  g.label(1, -0.08, '1', cssVar('--g-tick'), 30);
  g.label(-0.07, 1, '1', cssVar('--g-tick'), 30);
  g.label(0.82, 0.86, 'y = √(1 − x²)', c1, 32, 600, 'left');
  g.label(0.38, 0.38, 'π / 4', c1, 40, 600);
}

/* ===== 근거의 연쇄 ===== */
const CYCLE_NODES = [
  [260, 450, '(sin x)′ = cos x'],
  [870, 450, 'lim  sin x / x = 1'],
  [1480, 450, '부채꼴 넓이  ½r²θ'],
  [1480, 130, '원의 넓이  πr²'],
  [870, 130, '정적분  ∫ √(1 − x²) dx'],
  [260, 130, '치환  x = sin θ'],
];
/* 끊을 수 있는 고리: 화살표 번호(i → i+1) → 표시 번호 */
const CYCLE_CUTS = { 1: '①', 2: '②', 3: '③' };
function drawCycleOn(id, withCuts) {
  const g = new DeckGraph(id, { xMin: 0, xMax: 1740, yMin: 0, yMax: 580 });
  if (!g.canvas) return;
  const ink = cssVar('--c-ink'), white = cssVar('--c-white'), border = cssVar('--c-border');
  const c1 = cssVar('--g-curve-1'), red = cssVar('--c-red'), point = cssVar('--g-point');
  const BW = 230, BH = 62;
  g.clear();
  CYCLE_NODES.forEach(([ax, ay], i) => {
    const [bx, by] = CYCLE_NODES[(i + 1) % 6], col = i === 5 ? red : c1;
    let p0, p1;
    if (ay === by) {
      const d = Math.sign(bx - ax);
      p0 = [ax + d * (BW + 8), ay]; p1 = [bx - d * (BW + 14), by];
    } else {
      const d = Math.sign(by - ay);
      p0 = [ax, ay + d * (BH + 8)]; p1 = [bx, by - d * (BH + 14)];
    }
    g.arrow(p0[0], p0[1], p1[0], p1[1], col, 4);
    if (withCuts && CYCLE_CUTS[i]) {
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const s = 16;
      g.line(mx - s, my - s, mx + s, my + s, point, 6);
      g.line(mx - s, my + s, mx + s, my - s, point, 6);
      if (ay === by) g.label(mx, my + 44, CYCLE_CUTS[i], point, 40, 600);
      else g.label(mx - 44, my, CYCLE_CUTS[i], point, 40, 600);
    }
  });
  g.label(290, 290, 'dx = cos θ dθ', red, 32, 600, 'left');
  CYCLE_NODES.forEach(([x, y, t], i) => {
    g.box(x - BW, y - BH, x + BW, y + BH, white, i === 0 ? red : border, i === 0 ? 4 : 2);
    g.label(x, y, t, ink, 36, 600);
  });
}

/* ===== 새 근거의 연쇄: 되돌아오는 화살표 없음 ===== */
const CHAIN_NODES = ['(sin x)′ = cos x', 'lim  sin x / x = 1', 'sin x < x ≤ tan x', '호의 길이 정의'];
const CHAIN_TOOLS = ['합을 곱으로', '조임 정리', '삼각부등식 · 덧셈정리'];
function drawChain() {
  const g = new DeckGraph('g-chain', { xMin: 0, xMax: 1740, yMin: 0, yMax: 440 });
  if (!g.canvas) return;
  const ink = cssVar('--c-ink'), white = cssVar('--c-white'), border = cssVar('--c-border');
  const muted = cssVar('--c-muted'), c1 = cssVar('--g-curve-1'), green = cssVar('--c-green');
  const BW = 185, BH = 62, gap = (1740 - 8 * BW - 20) / 3, y = 270;
  const cx = i => 10 + BW + i * (2 * BW + gap);
  g.clear();
  for (let i = 0; i < 3; i++) {
    g.arrow(cx(i) + BW + 8, y, cx(i + 1) - BW - 12, y, c1, 4);
    g.label((cx(i) + cx(i + 1)) / 2, y - BH - 50, CHAIN_TOOLS[i], muted, 30, 600);
  }
  CHAIN_NODES.forEach((t, i) => {
    const last = i === 3;
    g.box(cx(i) - BW, y - BH, cx(i) + BW, y + BH, white, last ? green : border, last ? 4 : 2);
    g.label(cx(i), y, t, ink, 34, 600);
  });
  g.label(cx(3), y + BH + 48, '정의 (출발점)', green, 30, 600);
}

/* ===== 호의 길이: 꺾은선 n조각 (슬라이더) ===== */
const ARC_X = 1;
function drawArcDef(n) {
  const g = unitGraph('g-arcdef'); if (!g) return;
  const c1 = cssVar('--g-curve-1');
  unitBase(g);
  g.arc(0, 0, 1, 0, ARC_X, cssVar('--c-ink'), 5);
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push([Math.cos(k * ARC_X / n), Math.sin(k * ARC_X / n)]);
  g.path(pts, c1, 4);
  pts.forEach(([a, b]) => g.circle(a, b, n > 12 ? 5 : 7, c1));
  unitMarks(g, ARC_X, { angle: false });
}
function initArcDef() {
  const s = $('arc-slider'); if (!s) return;
  const btns = [...document.querySelectorAll('.preset-btn[data-arc]')];
  const upd = () => {
    const n = +s.value;
    $('arc-value').textContent = n;
    drawArcDef(n);
    btns.forEach(b => b.classList.toggle('active', +b.dataset.arc === n));
    const L = 2 * n * Math.sin(ARC_X / (2 * n));
    $('arc-info').innerHTML = `꺾은선 길이 = <strong>${L.toFixed(4)}</strong><br>호의 길이 x = <strong>${ARC_X.toFixed(4)}</strong>`;
  };
  btns.forEach(b => b.addEventListener('click', () => { s.value = b.dataset.arc; upd(); }));
  s.addEventListener('input', upd); upd();
}

/* ===== sin x < x ===== */
function drawSinX() {
  const x = 0.8;
  const g = unitGraph('g-sinx'); if (!g) return;
  const [c1, c2, c3] = CURVES();
  const ink = cssVar('--c-ink'), muted = cssVar('--c-muted');
  const P = [Math.cos(x), Math.sin(x)], H = [Math.cos(x), 0];
  unitBase(g);
  g.line(0, 0, P[0], P[1], muted, 2);
  g.arc(0, 0, 1, 0, x, c3, 5);
  g.line(1, 0, P[0], P[1], c2, 4);
  g.line(H[0], 0, P[0], P[1], c1, 5);
  const q = 0.04;
  g.path([[H[0] - q, 0], [H[0] - q, q], [H[0], q]], muted, 2);
  unitMarks(g, x);
  g.label(H[0], -0.08, 'H', ink, 30, 600);
  g.label(H[0] - 0.13, P[1] / 2, 'sin x', c1, 30, 600);
  g.label(1.05 * Math.cos(x / 2) + 0.07, 1.05 * Math.sin(x / 2) + 0.03, '호 x', c3, 30, 600);
}

/* ===== 접선으로의 투영 (슬라이더: 조각 수 n) ===== */
const PROJ_X = 0.9;
const SUB = k => String(k).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('');
function drawProj(n) {
  const x = PROJ_X;
  const g = unitGraph('g-proj'); if (!g) return;
  const [c1, c2] = CURVES();
  const ref = cssVar('--g-ref'), ink = cssVar('--c-ink');
  unitBase(g);
  g.line(1, -0.06, 1, g.yMax - 0.04, ref, 2);
  const P = [], Q = [];
  for (let k = 0; k <= n; k++) {
    const t = k * x / n;
    P.push([Math.cos(t), Math.sin(t)]); Q.push([1, Math.tan(t)]);
  }
  Q.forEach(([a, b]) => g.line(0, 0, a, b, ref, 1.5, [8, 8]));
  Q.forEach(([a, b], k) => { if (k) g.line(1, Q[k - 1][1], a, b, c2, 7); });
  g.path(P, c1, 4);
  const r = n > 8 ? 5 : 7;
  P.forEach(([a, b]) => g.circle(a, b, r, c1));
  Q.forEach(([a, b]) => g.circle(a, b, r, c2));
  unitMarks(g, x, { angle: false, P: null, A: false });
  if (n <= 4) {
    for (let k = 1; k < n; k++) {
      const t = k * x / n;
      g.labelSub(0.86 * Math.cos(t) - 0.02, 0.86 * Math.sin(t), 'P', String(k), c1);
      g.labelSub(1.12, Math.tan(t), 'Q', String(k), c2);
    }
    g.labelSub(1.1 * Math.cos(x) - 0.04, 1.1 * Math.sin(x), 'P', String(n), c1);
    g.label(1.04, Math.tan(x), 'T = Q' + SUB(n), ink, 30, 600, 'left');
    g.label(1.04, -0.08, 'A = Q₀', ink, 30, 600, 'left');
  } else {
    g.label(1.04, Math.tan(x), 'T', ink, 30, 600, 'left');
    g.label(1.04, -0.08, 'A', ink, 30, 600, 'left');
  }
}
function initProj() {
  const s = $('proj-slider'); if (!s) return;
  const upd = () => {
    const n = +s.value;
    $('proj-value').textContent = n;
    drawProj(n);
    const L = 2 * n * Math.sin(PROJ_X / (2 * n));
    $('proj-info').innerHTML = `꺾은선 길이 = <strong>${L.toFixed(4)}</strong>`
      + `<br>호의 길이 x = <strong>${PROJ_X.toFixed(4)}</strong>`
      + `<br>그림자 합 tan x = <strong>${Math.tan(PROJ_X).toFixed(4)}</strong>`;
  };
  s.addEventListener('input', upd); upd();
}

/* ===== 조각 하나 확대 ===== */
function drawPiece() {
  const a = 0.3, b = 0.85, m = (a + b) / 2;
  const g = unitGraph('g-piece'); if (!g) return;
  const [c1, c2] = CURVES();
  const ref = cssVar('--g-ref'), muted = cssVar('--c-muted'), ink = cssVar('--c-ink');
  const Pa = [Math.cos(a), Math.sin(a)], Pb = [Math.cos(b), Math.sin(b)];
  const Qa = [1, Math.tan(a)], Qb = [1, Math.tan(b)];
  const M = [(Pa[0] + Pb[0]) / 2, (Pa[1] + Pb[1]) / 2];
  unitBase(g);
  g.line(1, -0.06, 1, g.yMax - 0.04, ref, 2);
  g.line(0, 0, Qa[0], Qa[1], muted, 2);
  g.line(0, 0, Qb[0], Qb[1], muted, 2);
  g.line(0, 0, M[0], M[1], muted, 2, [8, 8]);
  /* M에서의 직각 표시 */
  const u = [Math.cos(m), Math.sin(m)], v = [-Math.sin(m), Math.cos(m)], q = 0.035;
  g.path([[M[0] - u[0] * q, M[1] - u[1] * q], [M[0] - u[0] * q + v[0] * q, M[1] - u[1] * q + v[1] * q],
          [M[0] + v[0] * q, M[1] + v[1] * q]], muted, 2);
  g.line(Qa[0], Qa[1], Qb[0], Qb[1], c2, 7);
  g.line(Pa[0], Pa[1], Pb[0], Pb[1], c1, 5);
  [Pa, Pb].forEach(p => g.circle(p[0], p[1], 7, c1));
  [Qa, Qb].forEach(p => g.circle(p[0], p[1], 7, c2));
  /* 각 a, h, h */
  g.arc(0, 0, 0.16, 0, a, muted, 2);
  g.label(0.24 * Math.cos(a / 2), 0.24 * Math.sin(a / 2), 'a', muted, 30, 600);
  g.arc(0, 0, 0.3, a, m, muted, 2);
  g.arc(0, 0, 0.34, m, b, muted, 2);
  g.label(0.4 * Math.cos((a + m) / 2), 0.4 * Math.sin((a + m) / 2), 'h', muted, 30, 600);
  g.label(0.44 * Math.cos((m + b) / 2), 0.44 * Math.sin((m + b) / 2), 'h', muted, 30, 600);
  g.circle(0, 0, 6, ink);
  g.label(-0.07, -0.07, 'O', ink, 30, 600);
  g.labelSub(Pa[0] - 0.1, Pa[1] - 0.05, 'P', 'a', c1);
  g.labelSub(Pb[0] - 0.1, Pb[1] + 0.02, 'P', 'b', c1);
  g.labelSub(1.12, Qa[1], 'Q', 'a', c2);
  g.labelSub(1.12, Qb[1], 'Q', 'b', c2);
  g.label(M[0] - 0.08, M[1] - 0.03, 'M', ink, 30, 600);
}

function drawAllGraphs() {
  initArea(); drawQuarter(); drawCycleOn('g-cycle', false); drawCycleOn('g-cut', true); drawChain();
  initArcDef(); drawSinX(); initProj(); drawPiece();
}

/* ---------- Init ---------- */
async function init() {
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false, strict: false,
    });
  }
  try { await document.fonts.ready; } catch (e) {}
  requestAnimationFrame(drawAllGraphs);
}
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

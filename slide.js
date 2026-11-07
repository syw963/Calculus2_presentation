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
/* 단위원 그림: 가로세로 축척이 같도록 x 범위를 캔버스 비율로 정한다 */
function circleGraph(id, yMax) {
  const c = document.getElementById(id);
  if (!c) return null;
  const W = +(c.dataset.w || c.width), H = +(c.dataset.h || c.height);
  const yMin = -0.16, xMin = -0.16;
  return new Graph(id, { xMin, xMax: xMin + (yMax - yMin) * W / H, yMin, yMax });
}
const pt = a => [Math.cos(a), Math.sin(a)];
function gLine(g, p, q, color, lw = 3, dash = false) {
  const { ctx } = g;
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  if (dash) ctx.setLineDash([12, 8]);
  ctx.moveTo(g.wx(p[0]), g.wy(p[1])); ctx.lineTo(g.wx(q[0]), g.wy(q[1]));
  ctx.stroke(); ctx.setLineDash([]);
}
function gPath(g, pts, color, lw = 3) {
  const { ctx } = g;
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  pts.forEach((p, i) => i ? ctx.lineTo(g.wx(p[0]), g.wy(p[1])) : ctx.moveTo(g.wx(p[0]), g.wy(p[1])));
  ctx.stroke();
}
function gFill(g, pts, color, alpha) {
  const { ctx } = g;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(g.wx(p[0]), g.wy(p[1])) : ctx.moveTo(g.wx(p[0]), g.wy(p[1])));
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function gArc(g, r, a0, a1, color, lw = 3) {
  const { ctx } = g, R = g.wx(r) - g.wx(0);
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.arc(g.wx(0), g.wy(0), R, -a1, -a0); ctx.stroke();
}
function gSector(g, r, a0, a1, color, alpha) {
  const { ctx } = g, R = g.wx(r) - g.wx(0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(g.wx(0), g.wy(0)); ctx.arc(g.wx(0), g.wy(0), R, -a1, -a0); ctx.closePath();
  ctx.fill(); ctx.restore();
}
const fmt3 = v => v.toFixed(3), fmt4 = v => v.toFixed(4);

/* 3. 넓이 비교 (슬라이더: 중심각 x) */
function drawArea(X) {
  const g = circleGraph('g-area', 1.7); if (!g) return;
  const O = [0, 0], A = [1, 0], P = pt(X), T = [1, Math.tan(X)], H = [P[0], 0];
  const c1 = cssVar('--g-curve-1'), c2 = cssVar('--g-curve-2'), c3 = cssVar('--g-curve-3');
  const ink = cssVar('--c-ink');
  g.clear();
  gFill(g, [O, A, T], c2, 0.14);
  gSector(g, 1, 0, X, c3, 0.22);
  gFill(g, [O, A, P], c1, 0.30);
  gArc(g, 1, 0, Math.PI / 2, cssVar('--g-axis'), 2);
  gPath(g, [O, A, T, O], c2, 3);
  gArc(g, 1, 0, X, c3, 4);
  gPath(g, [O, P, A], c1, 3);
  gLine(g, P, H, cssVar('--g-ref'), 3, true);
  gArc(g, 0.16, 0, X, ink, 2);
  g.text(0, 0, 'O', ink, -34, 36);
  g.text(1, 0, 'A', ink, 10, 36);
  g.text(P[0], P[1], 'P', ink, -38, -14);
  g.text(T[0], T[1], 'T', ink, 14, 10);
  g.text(1, T[1] / 2, 'tan x', c2, 14, 10);
  const m = pt(X / 2);
  g.text(m[0] * 0.2, m[1] * 0.2, 'x', ink, 6, 10);
  g.dot(1, 0, ink, 7); g.dot(T[0], T[1], ink, 7);
  g.dot(P[0], P[1], cssVar('--g-point'));
}
function initArea() {
  const s = document.getElementById('area-slider'); if (!s) return;
  const v = document.getElementById('area-value'), info = document.getElementById('area-info');
  const upd = () => {
    const X = +s.value;
    v.textContent = X.toFixed(2);
    drawArea(X);
    info.innerHTML = `½ sin x = <strong>${fmt3(Math.sin(X) / 2)}</strong>`
      + `<br>½ x = <strong>${fmt3(X / 2)}</strong>`
      + `<br>½ tan x = <strong>${fmt3(Math.tan(X) / 2)}</strong>`
      + `<br>sin x / x = <strong>${fmt3(Math.sin(X) / X)}</strong>`;
  };
  s.addEventListener('input', upd); upd();
}

/* 11. 호의 길이 (슬라이더: 꺾은선 조각 수 n) */
const ARC_X = 1.2;
function drawArcLen(n) {
  const g = circleGraph('g-arc', 1.12); if (!g) return;
  const c1 = cssVar('--g-curve-1'), ink = cssVar('--c-ink'), ax = cssVar('--g-axis');
  g.clear();
  gLine(g, [0, 0], [1, 0], ax, 2); gLine(g, [0, 0], pt(ARC_X), ax, 2);
  gArc(g, 1, 0, ARC_X, cssVar('--g-ref'), 3);
  const pts = Array.from({ length: n + 1 }, (_, k) => pt(ARC_X * k / n));
  gPath(g, pts, c1, 4);
  pts.forEach(p => g.dot(p[0], p[1], c1, n > 12 ? 5 : 8));
  const P = pt(ARC_X);
  g.text(0, 0, 'O', ink, -34, 36);
  g.text(1, 0, 'A', ink, 10, 36);
  g.text(P[0], P[1], 'P', ink, -12, -22);
}
function initArcLen() {
  const s = document.getElementById('arc-slider'); if (!s) return;
  const v = document.getElementById('arc-value'), info = document.getElementById('arc-info');
  const btns = [...document.querySelectorAll('.preset-btn[data-arc]')];
  const upd = () => {
    const n = +s.value;
    v.textContent = n;
    drawArcLen(n);
    btns.forEach(b => b.classList.toggle('active', +b.dataset.arc === n));
    const L = 2 * n * Math.sin(ARC_X / (2 * n));
    info.innerHTML = `꺾은선 길이 = <strong>${fmt4(L)}</strong>`
      + `<br>호의 길이 x = <strong>${fmt4(ARC_X)}</strong>`;
  };
  btns.forEach(b => b.addEventListener('click', () => { s.value = b.dataset.arc; upd(); }));
  s.addEventListener('input', upd); upd();
}

/* 12. sin x < x (정적 그림) */
function drawSinIneq() {
  const X = 0.9, g = circleGraph('g-sin', 1.12); if (!g) return;
  const O = [0, 0], A = [1, 0], P = pt(X), H = [P[0], 0];
  const c1 = cssVar('--g-curve-1'), c2 = cssVar('--g-curve-2'), c3 = cssVar('--g-curve-3');
  const ink = cssVar('--c-ink'), ax = cssVar('--g-axis');
  g.clear();
  gArc(g, 1, 0, Math.PI / 2, ax, 2);
  gPath(g, [P, O, A], cssVar('--g-branch'), 3);
  gArc(g, 1, 0, X, c3, 5);
  gLine(g, P, A, c2, 5);
  gLine(g, P, H, c1, 5);
  const s = 0.05;
  gPath(g, [[H[0] + s, 0], [H[0] + s, s], [H[0], s]], ink, 2);
  gArc(g, 0.16, 0, X, ink, 2);
  const m = pt(X / 2);
  g.text(m[0] * 0.2, m[1] * 0.2, 'x', ink, 6, 10);
  g.text(0, 0, 'O', ink, -34, 36);
  g.text(1, 0, 'A', ink, 10, 36);
  g.text(H[0], 0, 'H', ink, -10, 36);
  g.text(P[0], P[1], 'P', ink, -38, -14);
  g.text(H[0], P[1] / 2, 'sin x', c1, -100, 10);
  g.text((P[0] + 1) / 2, P[1] / 2, 'AP', c2, -64, 4);
  g.text(m[0], m[1], '호 x', c3, 16, -4);
  g.dot(P[0], P[1], cssVar('--g-point'));
}

/* 13. x ≤ tan x (슬라이더: 꺾은선 조각 수 n) */
const SH_X = 1.0;
function drawShadow(n) {
  const g = circleGraph('g-shadow', 1.7); if (!g) return;
  const c1 = cssVar('--g-curve-1'), c2 = cssVar('--g-curve-2');
  const ink = cssVar('--c-ink'), ax = cssVar('--g-axis'), ref = cssVar('--g-ref');
  g.clear();
  gArc(g, 1, 0, Math.PI / 2, ax, 2);
  gLine(g, [0, 0], [1, 0], cssVar('--g-branch'), 3);
  gLine(g, [1, 0], [1, 1.66], ax, 2);
  const angs = Array.from({ length: n + 1 }, (_, k) => SH_X * k / n);
  const P = angs.map(pt), Q = angs.map(a => [1, Math.tan(a)]);
  Q.forEach(q => gLine(g, [0, 0], q, ref, 2, true));
  gLine(g, [1, 0], [1, Math.tan(SH_X)], c2, 6);
  gPath(g, P, c1, 4);
  const r = n > 10 ? 5 : 7;
  Q.forEach(q => g.dot(q[0], q[1], c2, r));
  P.forEach(p => g.dot(p[0], p[1], c1, r));
  g.text(0, 0, 'O', ink, -34, 36);
  g.text(1, 0, 'A', ink, 10, 36);
  g.text(1, Math.tan(SH_X), 'T', ink, 16, 10);
  const E = P[n];
  g.text(E[0], E[1], 'P', ink, -40, -12);
}
function initShadow() {
  const s = document.getElementById('shadow-slider'); if (!s) return;
  const v = document.getElementById('shadow-value'), info = document.getElementById('shadow-info');
  const upd = () => {
    const n = +s.value;
    v.textContent = n;
    drawShadow(n);
    const L = 2 * n * Math.sin(SH_X / (2 * n));
    info.innerHTML = `꺾은선 길이 = <strong>${fmt4(L)}</strong>`
      + `<br>호의 길이 x = <strong>${fmt4(SH_X)}</strong>`
      + `<br>그림자 합 tan x = <strong>${fmt4(Math.tan(SH_X))}</strong>`;
  };
  s.addEventListener('input', upd); upd();
}

function drawAllGraphs() {
  initArea(); initArcLen(); drawSinIneq(); initShadow();
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

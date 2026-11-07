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

/* Graph 확장: 사각형·선분·경로·원·가운데 정렬 텍스트 (모두 Graph 좌표계 사용) */
class DeckGraph extends Graph {
  rect(x0, y0, x1, y1, color, alpha = 1) {
    const { ctx } = this;
    const X0 = this.wx(Math.min(x0, x1)), X1 = this.wx(Math.max(x0, x1));
    const Y0 = this.wy(Math.max(y0, y1)), Y1 = this.wy(Math.min(y0, y1));
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0); ctx.restore();
  }
  frame(x0, y0, x1, y1, color, lw = 1.5, alpha = 1) {
    const { ctx } = this;
    const X0 = this.wx(Math.min(x0, x1)), X1 = this.wx(Math.max(x0, x1));
    const Y0 = this.wy(Math.max(y0, y1)), Y1 = this.wy(Math.min(y0, y1));
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0); ctx.restore();
  }
  line(x0, y0, x1, y1, color, lw = 2, dash = null) {
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(this.wx(x0), this.wy(y0)); ctx.lineTo(this.wx(x1), this.wy(y1));
    ctx.stroke(); ctx.restore();
  }
  path(pts, color, lw = 3) {
    if (!pts.length) return;
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(this.wx(x), this.wy(y)) : ctx.moveTo(this.wx(x), this.wy(y)));
    ctx.stroke(); ctx.restore();
  }
  circle(x, y, r, color, alpha = 1) {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(this.wx(x), this.wy(y), r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  label(x, y, str, color = cssVar('--c-ink'), size = 28, weight = 400, align = 'center') {
    const { ctx } = this;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.font = `${weight} ${size}px "IBM Plex Sans KR","IBM Plex Sans",sans-serif`;
    ctx.fillText(str, this.wx(x), this.wy(y));
    ctx.textBaseline = 'alphabetic';
  }
}

const frac = x => x - Math.floor(x);
const fmt = n => n.toLocaleString('ko-KR');
const $ = id => document.getElementById(id);
const LOG_LABELS = ['1', '10', '100', '1천', '1만', '10만'];

/* 슬라이더: 드래그 후 포커스를 풀어 방향키로 슬라이드를 넘길 수 있게 함 */
function bindSlider(id, draw) {
  const el = $(id);
  el.addEventListener('input', draw);
  el.addEventListener('pointerup', () => el.blur());
  return el;
}
/* 로그 눈금 슬라이더(0–1000) → 1 … nMax */
const logN = (v, nMax) => Math.max(1, Math.round(Math.pow(nMax, v / 1000)));

/* 재생 버튼: 슬라이더를 끝까지 자동으로 움직임 */
function bindPlayer(btnId, sliderId, draw, stepFn) {
  const btn = $(btnId), sl = $(sliderId);
  let timer = null;
  const stop = () => { cancelAnimationFrame(timer); timer = null; btn.textContent = '재생'; btn.classList.remove('active'); };
  btn.addEventListener('click', () => {
    btn.blur();
    if (timer) return stop();
    if (+sl.value >= +sl.max) sl.value = sl.min;
    btn.textContent = '정지'; btn.classList.add('active');
    const tick = () => {
      const v = Math.min(+sl.max, +sl.value + stepFn(+sl.value));
      sl.value = v; draw();
      if (v >= +sl.max) return stop();
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  });
}
/* 프리셋 버튼 묶음 */
function bindPresets(groupId, onPick) {
  const btns = [...$(groupId).querySelectorAll('.preset-btn')];
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.toggle('active', x === b));
    b.blur(); onPick(b);
  }));
}

/* ===== 3. 정적분과 급수의 합: 직사각형 n개 ===== */
function drawRiemann() {
  const n = +$('riemann-slider').value;
  $('riemann-value').textContent = n;
  const g = new DeckGraph('g-riemann', { xMin: -0.1, xMax: 1.06, yMin: -0.13, yMax: 1.08 });
  if (!g.canvas) return;
  const c1 = cssVar('--g-curve-1');
  g.clear(); g.drawGrid(0.25, 0.25);
  let s = 0;
  for (let k = 1; k <= n; k++) {
    const x = k / n, y = x * x; s += y;
    g.rect((k - 1) / n, 0, x, y, c1, 0.16);
    if (n <= 40) g.frame((k - 1) / n, 0, x, y, c1, 1.5, 0.6);
  }
  g.drawAxes();
  g.drawCurve(x => (x >= 0 && x <= 1) ? x * x : NaN, c1, 4);
  if (n <= 30) for (let k = 1; k <= n; k++) g.circle(k / n, (k / n) ** 2, 6, c1);
  g.ticksX([0.5, 1]); g.ticksY([0.5, 1]);
  g.label(0.72, 0.86, 'y = x²', c1, 32, 600);
  $('riemann-info').innerHTML =
    `합: <strong>${(s / n).toFixed(4)}</strong><br>정적분: 1/3 ≈ 0.3333`;
}

/* ===== 7. nα의 소수 부분: 수직선 + 10칸 막대 ===== */
const ALPHAS = { sqrt2: Math.SQRT2, pi: Math.PI, half: 0.5 };
let naAlpha = 'sqrt2';
function drawNAlpha() {
  const N = +$('na-slider').value, a = ALPHAS[naAlpha];
  $('na-value').textContent = fmt(N);
  const c1 = cssVar('--g-curve-1'), axis = cssVar('--g-axis'), tick = cssVar('--g-tick');
  const pts = [], bins = new Array(10).fill(0), uniq = new Set();
  for (let n = 1; n <= N; n++) {
    const x = frac(n * a); pts.push(x);
    bins[Math.min(9, Math.floor(x * 10))]++; uniq.add(x.toFixed(9));
  }
  /* 수직선 */
  const L = new DeckGraph('g-line', { xMin: -0.05, xMax: 1.05, yMin: 0, yMax: 1 });
  if (!L.canvas) return;
  L.clear();
  L.line(0, 0.6, 1, 0.6, axis, 2);
  for (let t = 0; t <= 10; t++) L.line(t / 10, 0.52, t / 10, 0.68, axis, t % 5 ? 1.5 : 2.5);
  [0, 0.5, 1].forEach(v => L.label(v, 0.22, String(v), tick));
  pts.forEach(x => L.circle(x, 0.6, 7, c1, N > 300 ? 0.35 : 0.6));
  if (N) L.dot(pts[N - 1], 0.6, cssVar('--g-point'), 10);
  /* 10칸 비율 */
  const H = new DeckGraph('g-hist', { xMin: -0.75, xMax: 10.6, yMin: -0.1, yMax: 0.62 });
  H.clear(); H.drawGrid(100, 0.1); H.drawAxes();
  H.bars(bins.map(b => b / N), c1, 0.7);
  H.drawDash(() => 0.1);
  H.labelsX(bins.map((_, i) => (i / 10).toFixed(1)));
  H.ticksY([0.1, 0.5], v => v.toFixed(1));
  const r = bins.map(b => b / N);
  $('na-info').innerHTML =
    `서로 다른 점: <strong>${fmt(uniq.size)}</strong>개<br>` +
    `구간 비율: <strong>${Math.min(...r).toFixed(3)}</strong> ~ <strong>${Math.max(...r).toFixed(3)}</strong>`;
}

/* ===== 9. x²의 평균: √2 배수 vs 0.5 배수 ===== */
const AVG_MAX = 10000;
let AVG = null;
function avgData() {
  if (AVG) return AVG;
  const A = [0], B = [0]; let sa = 0, sb = 0;
  for (let n = 1; n <= AVG_MAX; n++) {
    sa += frac(n * Math.SQRT2) ** 2; sb += frac(n * 0.5) ** 2;
    A.push(sa / n); B.push(sb / n);
  }
  return (AVG = { A, B });
}
/* 로그 x축용 표본점 */
function logSamples(N, count = 700) {
  const out = []; let last = 0;
  for (let i = 0; i <= count; i++) {
    const n = Math.max(1, Math.round(Math.pow(N, i / count)));
    if (n !== last) { out.push(n); last = n; }
  }
  return out;
}
function drawAvg() {
  const N = logN(+$('avg-slider').value, AVG_MAX);
  $('avg-value').textContent = fmt(N);
  const { A, B } = avgData();
  const g = new DeckGraph('g-avg', { xMin: -0.3, xMax: 4.15, yMin: -0.05, yMax: 0.55 });
  if (!g.canvas) return;
  const c1 = cssVar('--g-curve-1'), c2 = cssVar('--g-curve-2');
  g.clear(); g.drawGrid(1, 0.1); g.drawAxes();
  g.drawDash(() => 1 / 3);
  const S = logSamples(N);
  g.path(S.map(n => [Math.log10(n), B[n]]), c2, 3);
  g.path(S.map(n => [Math.log10(n), A[n]]), c1, 3);
  g.dot(Math.log10(N), B[N], c2, 8); g.dot(Math.log10(N), A[N], c1, 8);
  g.ticksX([0, 1, 2, 3, 4], v => LOG_LABELS[v]);
  g.ticksY([0.1, 0.2, 0.3, 0.4, 0.5], v => v.toFixed(1));
  $('avg-info').innerHTML =
    `√2: <strong>${A[N].toFixed(5)}</strong><br>0.5: <strong>${B[N].toFixed(5)}</strong>`;
}

/* ===== 10. 계단함수의 경우 ===== */
function drawStep() {
  const N = +$('step-slider').value;
  $('step-value').textContent = fmt(N);
  const g = new DeckGraph('g-step', { xMin: -0.08, xMax: 1.04, yMin: -1.25, yMax: 6.1 });
  if (!g.canvas) return;
  const c1 = cssVar('--g-curve-1'), ref = cssVar('--g-ref');
  g.clear(); g.drawGrid(0.1, 1);
  g.rect(0, 0, 0.3, 2, c1, 0.14); g.rect(0.3, 0, 1, 5, c1, 0.14);
  g.drawAxes();
  g.line(0.3, 2, 0.3, 5, ref, 3, [12, 8]);
  g.line(0, 2, 0.3, 2, c1, 4); g.line(0.3, 5, 1, 5, c1, 4);
  g.ticksX([0.3, 1]); g.ticksY([2, 5]);
  let lo = 0;
  for (let n = 1; n <= N; n++) {
    const x = frac(n * Math.SQRT2);
    if (x < 0.3) lo++;
    g.circle(x, -0.85, 6, c1, N > 300 ? 0.3 : 0.6);
  }
  const p = lo / N, q = 1 - p;
  $('step-info').innerHTML =
    `[0, 0.3): <strong>${p.toFixed(3)}</strong><br>[0.3, 1]: <strong>${q.toFixed(3)}</strong><br>` +
    `평균: <strong>${(2 * p + 5 * q).toFixed(3)}</strong>`;
}

/* ===== 14. 숫자 빈도: π / 0123456789 반복, 1자리 / 2자리 ===== */
const DIGIT_MAX = 100000;
const REP_DIGITS = '0123456789'.repeat(DIGIT_MAX / 10);
let digitSrc = 'pi', digitUnit = 1;
function drawDigits() {
  const D = Math.max(100, logN(+$('digit-slider').value * 0.6 + 400, DIGIT_MAX));
  $('digit-value').textContent = fmt(D);
  const s = digitSrc === 'pi' ? PI_DIGITS : REP_DIGITS;
  const m = digitUnit === 1 ? 10 : 100;
  const cnt = new Array(m).fill(0); let total = 0;
  if (m === 10) { for (let i = 0; i < D; i++) cnt[s.charCodeAt(i) - 48]++; total = D; }
  else { for (let i = 0; i < D - 1; i++) cnt[(s.charCodeAt(i) - 48) * 10 + s.charCodeAt(i + 1) - 48]++; total = D - 1; }
  const r = cnt.map(c => c / total), e = 1 / m;
  const yMax = Math.max(2 * e, Math.max(...r) * 1.15);
  const g = new DeckGraph('g-digits', { xMin: m === 10 ? -0.6 : -7, xMax: m + 0.7, yMin: -yMax * 0.13, yMax });
  if (!g.canvas) return;
  g.clear();
  g.line(g.xMin, 0, g.xMax, 0, cssVar('--g-axis'), 1.5);
  g.bars(r, cssVar('--g-curve-1'), m === 10 ? 0.65 : 0.7);
  g.drawDash(() => e);
  g.labelsX(m === 10 ? r.map((_, i) => String(i)) : r.map((_, i) => i % 10 ? '' : String(i).padStart(2, '0')));
  const ticks = m === 10 ? [0.1, 0.2] : (yMax > 0.1 ? [0.01, 0.1] : [0.01, 0.02]);
  g.ticksY(ticks.filter(t => t <= yMax * 0.9), v => String(v));
  const zero = cnt.filter(c => c === 0).length;
  $('digit-info').innerHTML =
    `비율: <strong>${Math.min(...r).toFixed(4)}</strong> ~ <strong>${Math.max(...r).toFixed(4)}</strong><br>` +
    `기댓값: ${e}<br>나타나지 않은 ${m === 10 ? '숫자' : '묶음'}: <strong>${zero}</strong>개`;
}

/* ===== 15. 10배와 자릿수 이동 ===== */
function drawShift() {
  const k = +$('shift-slider').value;
  $('shift-value').textContent = k;
  const g = new DeckGraph('g-shift', { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  if (!g.canvas) return;
  const ink = cssVar('--c-ink'), faint = cssVar('--c-faint'), c1 = cssVar('--g-curve-1');
  const muted = cssVar('--c-muted'), axis = cssVar('--g-axis');
  g.clear();
  /* 자릿수 행 */
  const SHOW = 19, x0 = 0.175, dx = 0.0385;
  g.label(0.03, 0.84, 'x  =', muted, 40, 400, 'left');
  g.label(0.13, 0.84, '0.', ink, 44, 400);
  for (let i = 0; i < SHOW; i++) {
    const X = x0 + i * dx;
    if (i === k) g.rect(X - dx / 2 + 0.002, 0.77, X + dx / 2 - 0.002, 0.91, c1, 0.15);
    g.label(X, 0.84, PI_DIGITS[i], i < k ? faint : (i === k ? c1 : ink), 44, i === k ? 600 : 400);
  }
  g.label(x0 + SHOW * dx - 0.005, 0.84, '…', muted, 44);
  /* {10^k x} 행 */
  const tail = PI_DIGITS.substr(k, 14);
  const sup = String(k).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('');
  g.label(0.03, 0.6, `{10${sup}x}  =  0.${tail}…`, ink, 40, 400, 'left');
  /* 수직선 */
  const nx = v => 0.06 + 0.88 * v, yL = 0.25;
  const d = +PI_DIGITS[k], val = parseFloat('0.' + tail);
  g.rect(nx(d / 10), yL - 0.06, nx((d + 1) / 10), yL + 0.06, c1, 0.18);
  g.line(nx(0), yL, nx(1), yL, axis, 2.5);
  for (let t = 0; t <= 10; t++) {
    g.line(nx(t / 10), yL - 0.035, nx(t / 10), yL + 0.035, axis, 2);
    g.label(nx(t / 10), yL - 0.12, t === 0 ? '0' : t === 10 ? '1' : (t / 10).toFixed(1), cssVar('--g-tick'), 28);
  }
  g.dot(nx(val), yL, cssVar('--g-point'), 11);
  $('shift-info').innerHTML =
    `​${k + 1}번째 자리: <strong>${d}</strong><br>구간: <strong>[0.${d}, ${d === 9 ? '1' : '0.' + (d + 1)})</strong>`;
}

/* ===== 18. 자릿수로 계산한 정적분: π vs 챔퍼나운 상수 ===== */
const PI_N = 99980;
let PIAVG = null;
function piData() {
  if (PIAVG) return PIAVG;
  let ch = '', i = 1;
  while (ch.length < PI_N + 20) ch += String(i++);
  const run = s => {
    const out = [0]; let sum = 0;
    for (let k = 0; k < PI_N; k++) { const x = parseFloat('0.' + s.substr(k, 15)); sum += x * x; out.push(sum / (k + 1)); }
    return out;
  };
  return (PIAVG = { P: run(PI_DIGITS), C: run(ch) });
}
function drawPiAvg() {
  const N = logN(+$('pi-slider').value, PI_N);
  $('pi-value').textContent = fmt(N);
  const { P, C } = piData();
  const g = new DeckGraph('g-pi', { xMin: -0.35, xMax: 5.2, yMin: -0.05, yMax: 0.55 });
  if (!g.canvas) return;
  const c1 = cssVar('--g-curve-1'), c2 = cssVar('--g-curve-2');
  g.clear(); g.drawGrid(1, 0.1); g.drawAxes();
  g.drawDash(() => 1 / 3);
  const S = logSamples(N);
  g.path(S.map(n => [Math.log10(n), C[n]]), c2, 3);
  g.path(S.map(n => [Math.log10(n), P[n]]), c1, 3);
  g.dot(Math.log10(N), C[N], c2, 8); g.dot(Math.log10(N), P[N], c1, 8);
  g.ticksX([0, 1, 2, 3, 4, 5], v => LOG_LABELS[v]);
  g.ticksY([0.1, 0.2, 0.3, 0.4, 0.5], v => v.toFixed(1));
  $('pi-info').innerHTML =
    `π: <strong>${P[N].toFixed(5)}</strong><br>챔퍼나운: <strong>${C[N].toFixed(5)}</strong>` +
    `<br><span class="txt-muted txt-sm">π의 정규성은 미증명</span>`;
}

/* ===== 이벤트 연결 (한 번만) ===== */
let deckBound = false;
function bindDeck() {
  if (deckBound) return; deckBound = true;
  bindSlider('riemann-slider', drawRiemann);
  bindPlayer('riemann-play', 'riemann-slider', drawRiemann, () => 1);
  bindSlider('na-slider', drawNAlpha);
  bindPlayer('na-play', 'na-slider', drawNAlpha, v => Math.max(1, Math.round(v / 40)));
  bindPresets('alpha-presets', b => { naAlpha = b.dataset.alpha; drawNAlpha(); });
  bindSlider('avg-slider', drawAvg);
  bindPlayer('avg-play', 'avg-slider', drawAvg, () => 4);
  bindSlider('step-slider', drawStep);
  bindPlayer('step-play', 'step-slider', drawStep, v => Math.max(1, Math.round(v / 40)));
  bindSlider('digit-slider', drawDigits);
  bindPlayer('digit-play', 'digit-slider', drawDigits, () => 5);
  bindPresets('digit-src', b => { digitSrc = b.dataset.src; drawDigits(); });
  bindPresets('digit-unit', b => { digitUnit = +b.dataset.unit; drawDigits(); });
  bindSlider('shift-slider', drawShift);
  bindSlider('pi-slider', drawPiAvg);
  bindPlayer('pi-play', 'pi-slider', drawPiAvg, () => 4);
}

function drawAllGraphs() {
  bindDeck();
  drawRiemann(); drawNAlpha(); drawAvg(); drawStep();
  drawDigits(); drawShift(); drawPiAvg();
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

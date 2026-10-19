// Графики на чистом SVG, адаптивные по ширине контейнера (перерисовка по ResizeObserver).
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

function toTime(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  const t = new Date(String(x).length <= 10 ? x + 'T00:00:00' : x).getTime();
  return isNaN(t) ? 0 : t;
}

function fmtDate(t) {
  const d = new Date(t);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

function fmtNum(v) {
  const r = Math.round(v * 10) / 10;
  return String(r).replace('.', ',');
}

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

function mount(el, draw) {
  if (el._chartRO) el._chartRO.disconnect();
  let last = 0;
  const render = () => {
    const w = Math.max(200, Math.floor(el.clientWidth || 300));
    if (w === last && el.firstChild) return;
    last = w;
    el.textContent = '';
    el.appendChild(draw(w));
  };
  render();
  if (typeof ResizeObserver !== 'undefined') {
    el._chartRO = new ResizeObserver(render);
    el._chartRO.observe(el);
  }
}

function frame(w, hgt, label) {
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: '100%', height: hgt, role: 'img', 'aria-label': label || 'график', class: 'chart-svg' });
  svg.style.display = 'block';
  return svg;
}

function empty(w, msg) {
  const svg = frame(w, 120, msg);
  svg.appendChild(s('text', { x: w / 2, y: 64, 'text-anchor': 'middle', fill: '#8a8a8a', 'font-size': 14 }, msg));
  return svg;
}

const M = { l: 40, r: 12, t: 26, b: 26 };

function yAxis(svg, w, hgt, lo, hi, ticks, yLabel) {
  const ph = hgt - M.t - M.b;
  const yOf = v => M.t + ph - ((v - lo) / (hi - lo)) * ph;
  for (const t of ticks) {
    const y = yOf(t);
    svg.appendChild(s('line', { x1: M.l, x2: w - M.r, y1: y, y2: y, stroke: '#222', 'stroke-width': 1 }));
    svg.appendChild(s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end', fill: '#8a8a8a', 'font-size': 11 }, fmtNum(t)));
  }
  if (yLabel) svg.appendChild(s('text', { x: M.l, y: 11, fill: '#8a8a8a', 'font-size': 11 }, yLabel));
  return yOf;
}

/** lineChart(el, {points:[{x:Date|string,y:number}], yLabel, color}) */
export function lineChart(el, opts = {}) {
  const pts = (opts.points || []).filter(p => p && p.y != null && !isNaN(p.y)).map(p => ({ t: toTime(p.x), y: +p.y })).sort((a, b) => a.t - b.t);
  const color = opts.color || '#3ddc84';
  const hgt = opts.height || 200;
  mount(el, w => {
    if (!pts.length) return empty(w, 'Нет данных');
    const ys = pts.map(p => p.y);
    const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys));
    const svg = frame(w, hgt, opts.yLabel);
    const yOf = yAxis(svg, w, hgt, lo, hi, ticks, opts.yLabel);
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const pw = w - M.l - M.r - 8;
    const xOf = t => M.l + 4 + (t1 === t0 ? pw / 2 : ((t - t0) / (t1 - t0)) * pw);
    // подписи X: первая и последняя (и средняя при достаточной ширине)
    const labelPts = pts.length === 1 ? [pts[0]] : [pts[0], pts[pts.length - 1]];
    labelPts.forEach((p, i) => svg.appendChild(s('text', {
      x: xOf(p.t), y: hgt - 8, fill: '#8a8a8a', 'font-size': 11,
      'text-anchor': pts.length === 1 ? 'middle' : (i === 0 ? 'start' : 'end')
    }, fmtDate(p.t))));
    if (pts.length > 1) {
      svg.appendChild(s('polyline', {
        points: pts.map(p => `${xOf(p.t).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }
    pts.forEach((p, i) => {
      const c = s('circle', { cx: xOf(p.t), cy: yOf(p.y), r: 4, fill: '#000', stroke: color, 'stroke-width': 2 });
      c.appendChild(s('title', {}, `${fmtDate(p.t)}: ${fmtNum(p.y)}`));
      svg.appendChild(c);
      if (i === pts.length - 1) {
        const left = xOf(p.t) > w - 40;
        svg.appendChild(s('text', { x: xOf(p.t) + (left ? 0 : 0), y: Math.max(13, yOf(p.y) - 9), fill: color, 'font-size': 12, 'font-weight': 700, 'text-anchor': left ? 'end' : 'middle' }, fmtNum(p.y)));
      }
    });
    return svg;
  });
}

/** barChart(el, {points:[{x:label|Date,y:number}], yLabel, color}) */
export function barChart(el, opts = {}) {
  const pts = (opts.points || []).filter(p => p && p.y != null && !isNaN(p.y)).map(p => ({
    x: p.x instanceof Date ? fmtDate(p.x.getTime()) : String(p.x), y: +p.y
  }));
  const color = opts.color || '#3ddc84';
  const hgt = opts.height || 200;
  mount(el, w => {
    if (!pts.length) return empty(w, 'Нет данных');
    const { lo, hi, ticks } = niceTicks(0, Math.max(...pts.map(p => p.y), 1));
    const svg = frame(w, hgt, opts.yLabel);
    const yOf = yAxis(svg, w, hgt, lo, hi, ticks, opts.yLabel);
    const pw = w - M.l - M.r;
    const slot = pw / pts.length;
    const bw = Math.max(4, Math.min(40, slot * 0.7));
    const every = Math.ceil(36 / slot);
    pts.forEach((p, i) => {
      const cx = M.l + slot * (i + 0.5);
      const y = yOf(p.y), y0 = yOf(0);
      const r = s('rect', { x: cx - bw / 2, y, width: bw, height: Math.max(1, y0 - y), rx: 3, fill: color });
      r.appendChild(s('title', {}, `${p.x}: ${fmtNum(p.y)}`));
      svg.appendChild(r);
      if (i % every === 0 || i === pts.length - 1) {
        svg.appendChild(s('text', { x: cx, y: hgt - 8, 'text-anchor': 'middle', fill: '#8a8a8a', 'font-size': 11 }, p.x));
      }
    });
    return svg;
  });
}

export default { lineChart, barChart };

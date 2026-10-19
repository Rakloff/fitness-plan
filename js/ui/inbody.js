// Экран «InBody»: ежемесячный замер, график, сравнение «было → стало».
import { h } from '../dom.js';

const METRICS = [
  { key: 'weightKg', label: 'Вес', unit: 'кг', color: '#3ddc84', digits: 1, goodUp: true },
  { key: 'smmKg', label: 'SMM', unit: 'кг', color: '#4fc3f7', digits: 1, goodUp: true },
  { key: 'fatPct', label: 'Жир %', unit: '%', color: '#ffb74d', digits: 1, goodUp: false },
];

const FIELDS = [
  { key: 'weightKg', label: 'Вес, кг', min: 30, max: 200, required: true },
  { key: 'fatPct', label: 'Жир, %', min: 1, max: 60, required: true },
  { key: 'fatKg', label: 'Жир, кг', min: 0.5, max: 100, required: true },
  { key: 'smmKg', label: 'Скелетная мускулатура (SMM), кг', min: 10, max: 80, required: true },
  { key: 'bmr', label: 'BMR (базовый обмен), ккал', min: 800, max: 4000, required: true },
  { key: 'visceral', label: 'Висцеральный жир (необязательно)', min: 1, max: 30, required: false },
];

const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ruDate = s => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : s; };

export function mount(root, ctx) {
  const { store, charts } = ctx;
  let metric = METRICS[0];

  const formCard = h('div', { class: 'card ib-form' });
  const compareCard = h('div', { class: 'card' });
  const chartCard = h('div', { class: 'card' });
  const listCard = h('div', { class: 'card' });
  const helpCard = h('details', { class: 'acc' },
    h('summary', null, 'Какой темп набора реалистичен'),
    h('div', { class: 'acc-body' },
      h('p', null, 'Реалистичный набор для натурального атлета: 0,5–1 кг в месяц. Быстрее почти всегда означает лишний жир.'),
      h('p', null, 'Небольшой рост жира при наборе массы нормален: умеренный профицит калорий даёт часть прибавки в жире. Смотрите на тренд за 2–3 замера, а не на один.'),
      h('p', { class: 'muted' }, 'Замеряйтесь раз в месяц, в одно время суток, натощак.')));

  root.append(h('h1', null, 'InBody'), compareCard, chartCard, formCard, listCard, helpCard);

  // ---------- форма ----------
  const inputs = {};
  const dateInput = h('input', { class: 'input', type: 'date', value: today(), max: today() });
  const msg = h('p', { class: 'danger', role: 'alert', style: { display: 'none' } });
  const form = h('form', { novalidate: true, onsubmit: onSubmit },
    h('h2', null, 'Новый замер'),
    h('label', { class: 'field' }, h('span', null, 'Дата'), dateInput));
  for (const f of FIELDS) {
    const inp = h('input', { class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: f.required ? '' : 'можно пропустить' });
    inputs[f.key] = inp;
    form.append(h('label', { class: 'field' }, h('span', null, f.label), inp));
  }
  form.append(msg, h('button', { class: 'btn primary block', type: 'submit' }, 'Сохранить замер'));
  formCard.append(form);

  function parse(s) {
    const t = String(s).trim().replace(',', '.');
    if (t === '') return null;
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return parseFloat(t);
  }
  function showMsg(t) { msg.textContent = t; msg.style.display = t ? '' : 'none'; }

  function onSubmit(e) {
    e.preventDefault();
    const date = dateInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showMsg('Укажите дату замера.');
    const rec = { date };
    for (const f of FIELDS) {
      const v = parse(inputs[f.key].value);
      if (v === null) {
        if (f.required) { inputs[f.key].focus(); return showMsg(`Заполните поле «${f.label}».`); }
        rec[f.key] = null; continue;
      }
      if (isNaN(v) || v < f.min || v > f.max) {
        inputs[f.key].focus();
        return showMsg(`«${f.label}»: введите число от ${String(f.min).replace('.', ',')} до ${f.max}.`);
      }
      rec[f.key] = v;
    }
    if (store.listInbody().some(r => r.date === date) && !confirm('Замер за ' + ruDate(date) + ' уже есть. Заменить?')) return;
    try { store.addInbody(rec); } catch (err) { return showMsg('Не удалось сохранить: ' + err.message); }
    showMsg('');
    for (const f of FIELDS) inputs[f.key].value = '';
    render();
  }

  // ---------- сравнение ----------
  function renderCompare(list) {
    compareCard.textContent = '';
    compareCard.append(h('h2', null, 'Было → стало'));
    if (!list.length) { compareCard.append(h('p', { class: 'muted' }, 'Пока нет замеров.')); return; }
    const first = list[0], last = list[list.length - 1];
    compareCard.append(h('p', { class: 'muted' }, list.length > 1
      ? `Первый замер ${ruDate(first.date)} → последний ${ruDate(last.date)}`
      : `Стартовый замер ${ruDate(first.date)}. Добавьте следующий через месяц.`));
    const rows = [
      ['Вес', 'weightKg', 'кг', 1, true], ['Жир', 'fatPct', '%', 1, false], ['Жир', 'fatKg', 'кг', 1, false],
      ['SMM', 'smmKg', 'кг', 1, true], ['BMR', 'bmr', 'ккал', 0, true],
    ];
    if (first.visceral != null && last.visceral != null) rows.push(['Висц. жир', 'visceral', '', 0, false]);
    const tbody = h('tbody');
    for (const [name, key, unit, d, goodUp] of rows) {
      const a = first[key], b = last[key];
      const diff = (a != null && b != null) ? b - a : null;
      const nonzero = diff != null && Math.abs(diff) >= 0.05;
      tbody.append(h('tr', null,
        h('td', null, name),
        h('td', null, `${fmt(a, d)} → ${fmt(b, d)}${unit ? ' ' + unit : ''}`),
        h('td', { class: nonzero && list.length > 1 ? (goodUp === (diff > 0) ? 'accent' : 'muted') : 'muted' },
          list.length > 1 && diff != null ? signed(diff, d) : '')));
    }
    compareCard.append(h('table', null, tbody));
  }

  // ---------- график ----------
  function renderChart(list) {
    chartCard.textContent = '';
    const tabs = h('div', { class: 'row ib-tabs', role: 'tablist' }, METRICS.map(m =>
      h('button', {
        class: ['btn', 'grow', m === metric ? 'primary' : ''], type: 'button', role: 'tab', 'aria-selected': m === metric ? 'true' : 'false',
        onclick: () => { metric = m; renderChart(list); },
      }, m.label)));
    const box = h('div', { class: 'chart' });
    chartCard.append(h('h2', null, 'Динамика'), tabs, box);
    charts.lineChart(box, {
      points: list.map(r => ({ x: r.date, y: r[metric.key] })),
      yLabel: metric.label + ', ' + metric.unit, color: metric.color,
    });
  }

  // ---------- список ----------
  function renderList(list) {
    listCard.textContent = '';
    listCard.append(h('h2', null, 'Замеры'));
    if (!list.length) { listCard.append(h('p', { class: 'muted' }, 'Нет замеров.')); return; }
    for (const r of list.slice().reverse()) {
      listCard.append(h('div', { class: 'ib-item' },
        h('div', { class: 'grow' },
          h('strong', null, ruDate(r.date)),
          h('div', { class: 'muted ib-sub' },
            `${fmt(r.weightKg)} кг · жир ${fmt(r.fatPct)} % (${fmt(r.fatKg)} кг) · SMM ${fmt(r.smmKg)} кг · BMR ${fmt(r.bmr, 0)}` +
            (r.visceral != null ? ` · висц. ${fmt(r.visceral, 0)}` : ''))),
        h('button', {
          class: 'btn danger', type: 'button', 'aria-label': 'Удалить замер ' + ruDate(r.date),
          onclick: () => { if (confirm('Удалить замер за ' + ruDate(r.date) + '?')) { store.deleteInbody(r.date); render(); } },
        }, '✕')));
    }
  }

  function render() {
    const list = store.listInbody();
    renderCompare(list); renderChart(list); renderList(list);
  }
  render();
}

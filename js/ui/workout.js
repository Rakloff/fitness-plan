// Экран «Тренировка».
import { h } from '../dom.js';

const STATUS = {
  calibrate: { label: 'Калибровка', cls: '' },
  increase: { label: 'Прибавь', cls: 'accent' },
  hold: { label: 'Держи вес', cls: '' },
  decrease: { label: 'Снизь', cls: 'danger' },
};
const DAY_SHORT = { d1: 'Д1', d2: 'Д2', d3: 'Д3' };
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtNum = n => String(Math.round(n * 100) / 100).replace('.', ',');
const parseNum = s => {
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

let wakeCtx = null;

export function mount(root, ctx) {
  const { store, program, techniques, progression } = ctx;
  wakeCtx = ctx;
  root.textContent = '';
  if (!store || !program) {
    root.append(h('div', { class: 'placeholder' }, 'Не загружены данные программы.'));
    return;
  }
  try { ctx.wakeLock && ctx.wakeLock.enable(); } catch (_) {}

  const today = new Date();
  const todayStr = isoDate(today);
  let dateStr = todayStr;
  const settings = store.getSettings();

  // ----- неделя плана -----
  const weekFor = (today) => {
    const m = String(settings.planStartDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const weeks = program.weeks || [];
    if (!m) return { n: 1, week: weeks[0], note: '' };
    const start = new Date(+m[1], +m[2] - 1, +m[3]);
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((t0 - start) / 86400000);
    let n = Math.floor(diff / 7) + 1, note = '';
    if (diff < 0) { n = 1; note = `План стартует ${pad(start.getDate())}.${pad(start.getMonth() + 1)}`; }
    if (n > weeks.length) { n = weeks.length; note = 'План из 8 недель завершён'; }
    return { n, week: weeks.find(w => w.n === n) || weeks[0], note };
  };
  let weekInfo = weekFor(today);

  // ----- выбор дня по умолчанию -----
  function defaultDayId() {
    const mine = store.listSessions().filter(s => s.date === todayStr && !s.finishedAt);
    if (mine.length) return mine[mine.length - 1].dayId;
    const undone = undoneBase();
    if (undone.length) return undone[0].id;
    return 'd3';
  }

  // неделя пн-вс, в которую попадает сегодня; день считается сделанным, если есть завершённая сессия за эту неделю
  const wdIdx = d => (d.getDay() + 6) % 7; // пн = 0
  const weekRange = (() => {
    const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - wdIdx(today));
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return [isoDate(mon), isoDate(sun)];
  })();
  function undoneBase() {
    const fin = store.listSessions().filter(s => s.finishedAt && s.date >= weekRange[0] && s.date <= weekRange[1]);
    return program.days.filter(d => !d.optional && !fin.some(s => s.dayId === d.id));
  }
  // подсказка: день плана уже прошёл по расписанию, а не сделан
  function missedHint() {
    const d = dayOf();
    if (!d || d.optional || dateStr !== todayStr) return '';
    if (!undoneBase().some(x => x.id === d.id)) return '';
    const planned = d.weekdays[0];
    if (planned == null || ((planned + 6) % 7) >= wdIdx(today)) return '';
    return `${DAY_SHORT[d.id] || d.title} пропущена (${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][planned]}) — сделай её сегодня`;
  }

  const parseDateStr = s => { const m = s.split('-').map(Number); return new Date(m[0], m[1] - 1, m[2]); };
  const hasData = s => !!s && (s.warmupDone || Object.values(s.exercises || {}).some(e =>
    (e.note && e.note.trim()) || (e.sets || []).some(x => x.done || x.weight != null || x.reps != null)));
  function changeDate(nd) {
    const max = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd) || nd > max) { render(); return; }
    if (nd === dateStr) return;
    const cur = store.getSession(dateStr, dayId);
    const target = store.getSession(nd, dayId);
    if (hasData(cur) && !target) {
      const f = s => s.split('-').reverse().slice(0, 2).join('.');
      if (confirm(`Перенести эту тренировку (${f(dateStr)}) на ${f(nd)}? ОК — перенести со всеми данными, Отмена — оставить на старой дате и открыть новую.`)) {
        const moved = { ...cur, id: `${nd}_${dayId}`, date: nd, weekN: weekFor(parseDateStr(nd)).n };
        store.saveSession(moved);
        store.deleteSession(cur.id || `${dateStr}_${dayId}`);
      }
    }
    dateStr = nd;
    render();
  }

  let dayId = defaultDayId();
  let session = null;
  let recs = {};
  const refs = { cards: [] };

  const wrap = h('div', { class: 'wk' });
  root.append(wrap);

  function newSession() {
    return {
      id: `${dateStr}_${dayId}`, date: dateStr, dayId, weekN: weekInfo.n, warmupDone: false,
      startedAt: new Date().toISOString(), finishedAt: null, exercises: {},
    };
  }
  function save() {
    if (!session._persisted) { session._persisted = true; }
    const { _persisted, ...clean } = session;
    store.saveSession(clean);
  }
  function ensureEx(ex) {
    const data = session.exercises[ex.id] || (session.exercises[ex.id] = { sets: [], note: '' });
    while (data.sets.length < setsOf(ex)) data.sets.push({ weight: null, reps: null, done: false });
    return data;
  }
  // неделя с пониженным объёмом: подходов меньше пропорционально (вверх, минимум 2); сохранённые данные не трогаем
  function setsOf(ex) {
    const vp = weekInfo.week && weekInfo.week.volumePct;
    if (typeof vp === 'number' && vp < 100) return Math.min(ex.sets, Math.max(2, Math.ceil(ex.sets * vp / 100)));
    return ex.sets;
  }
  const stepOf = ex => {
    const v = progression.stepFor ? progression.stepFor(ex, settings) : ex.stepKg;
    return v > 0 ? v : 0;
  };
  const shortName = n => String(n).replace(/\s*\([^)]*\)/g, '');
  const rangeOf = ex => ex.repMin === ex.repMax ? String(ex.repMin) : `${ex.repMin}–${ex.repMax}`;

  function dayOf() { return program.days.find(d => d.id === dayId); }
  function allExercises(day) { return day.blocks.flatMap(b => b.exercises); }

  function computeRecs(day) {
    const history = store.listSessions().filter(s => s.id !== `${dateStr}_${dayId}`);
    const out = {};
    for (const ex of allExercises(day)) {
      try { out[ex.id] = progression.recommend(ex, history, settings, weekInfo.week); }
      catch (e) { console.warn('recommend', ex.id, e); out[ex.id] = null; }
    }
    return out;
  }

  // ----- оценка оставшегося времени -----
  function remaining(day) {
    // без чередований: подход 40 с, отдых между подходами, 1,5 мин на переход к тренажёру (если упражнение не начато)
    let sets = 0, total = 0, sec = 0;
    for (const ex of allExercises(day)) {
      const data = session.exercises[ex.id];
      let left = 0, started = false;
      for (let i = 0; i < setsOf(ex); i++) {
        total++;
        const done = data && data.sets[i] && data.sets[i].done;
        if (done) started = true; else left++;
      }
      if (left) { sets += left; sec += left * 40 + (left - 1) * (ex.restSec || 60) + (started ? 0 : 90); }
    }
    return { left: sets, total, min: Math.round(sec / 60) };
  }

  function render() {
    const day = dayOf();
    const prevId = `${dateStr}_${dayId}`;
    session = store.getSession(dateStr, dayId) || newSession();
    session.id = prevId;
    recs = computeRecs(day);
    refs.cards = [];
    weekInfo = weekFor(parseDateStr(dateStr));
    wrap.textContent = '';

    // --- шапка ---
    const wk = weekInfo.week || {};
    const dayTabs = h('div', { class: 'wk-days', role: 'tablist' }, program.days.map(d =>
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': d.id === dayId ? 'true' : 'false',
        class: ['wk-day', d.id === dayId && 'on'],
        onclick: () => { if (d.id !== dayId) { dayId = d.id; render(); } },
      }, h('b', null, DAY_SHORT[d.id] || d.title), h('small', null, d.optional ? 'опц.' : ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.weekdays[0]]))
    ));

    const statusEl = h('span', { class: 'wk-status' });
    const bar = h('i');
    const progEl = h('div', { class: 'progress wk-prog' }, bar);
    refs.statusEl = statusEl; refs.bar = bar;

    const warm = h('input', {
      type: 'checkbox', class: 'check', id: 'wk-warm', checked: !!session.warmupDone,
      onchange: e => { session.warmupDone = e.target.checked; save(); },
    });

    wrap.append(
      h('div', { class: 'card wk-head' },
        dayTabs,
        h('label', { class: 'check-row wk-warmrow', for: 'wk-warm' }, warm,
          h('span', null, `Разминка ${program.warmup ? program.warmup.minutes : 10} мин`)),
        h('details', { class: 'wk-chip' },
          h('summary', null, statusEl),
          h('div', { class: 'wk-detail' },
            h('div', { class: 'row wk-meta' },
              h('span', { class: 'badge' }, `${WD[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]}`),
              h('span', { class: 'badge accent' }, `Неделя ${weekInfo.n}${wk.phase ? ' · ' + wk.phase : ''}`)),
            h('div', { class: 'wk-datebar' },
              h('input', {
                type: 'date', class: 'input wk-date', value: dateStr, 'aria-label': 'Дата тренировки',
                max: isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
                onchange: e => changeDate(e.target.value),
              }),
              h('button', { type: 'button', class: 'btn wk-today', onclick: () => changeDate(todayStr) }, 'Сегодня')),
            h('div', { class: 'muted wk-sub' }, day.subtitle),
            weekInfo.note ? h('div', { class: 'muted' }, weekInfo.note) : null,
            wk.loadNote ? h('div', { class: 'wk-note' }, wk.loadNote) : null)),
        missedHint() ? h('div', { class: 'wk-hintm' }, missedHint()) : null,
        dateStr !== todayStr ? h('div', { class: 'wk-hintm' }, `Дата тренировки: ${dateStr.split('-').reverse().join('.')}`) : null,
        progEl)
    );

    // --- блоки ---
    day.blocks.forEach(block => wrap.append(renderBlock(block)));

    // --- завершение ---
    const finishBtn = h('button', { type: 'button', class: 'btn primary block wk-finish', onclick: finish },
      session.finishedAt ? 'Тренировка завершена, скачать .md снова' : 'Завершить тренировку');
    refs.finishBtn = finishBtn;
    wrap.append(h('div', { class: 'wk-end' }, finishBtn,
      h('div', { class: 'muted wk-hint' }, 'Файл .md сохранится в «Загрузки». Всё остальное сохраняется автоматически.')));
    updateStatus();
  }

  function updateStatus() {
    const day = dayOf();
    const r = remaining(day);
    const doneN = r.total - r.left;
    refs.statusEl.textContent = '';
    const wn = weekInfo.n;
    refs.statusEl.append(
      h('b', null, `Нед ${wn} · ${doneN}/${r.total}`),
      h('span', { class: 'muted' }, r.left === 0 ? ' · всё сделано' : ` · ~${r.min} мин`));
    refs.bar.style.width = (r.total ? doneN / r.total * 100 : 0) + '%';
  }

  function renderBlock(block) {
    const el = h('section', { class: 'wk-block' });
    el.append(h('h2', { class: 'wk-bt' }, block.title,
      h('span', { class: 'muted wk-bsub' }, ` · ${block.exercises.length} ${block.exercises.length === 1 ? 'упражнение' : 'упражнения'}, по порядку`)));
    block.exercises.forEach(ex => el.append(renderExercise(ex)));
    return el;
  }

  const isFull = ex => ensureEx(ex).sets.slice(0, setsOf(ex)).every(s => s.done);
  function updateCurrent() {
    let cur = null;
    for (const c of refs.cards) {
      if (!cur && !isFull(c.ex)) cur = c;
      c.el.classList.toggle('cur', c === cur);
    }
  }

  function summaryLine(ex, data) {
    const ss = data.sets.slice(0, setsOf(ex));
    const ws = ss.map(s => s.weight).filter(v => v != null);
    const rs = ss.map(s => s.reps).filter(v => v != null);
    const span = a => a.length ? (Math.min(...a) === Math.max(...a) ? fmtNum(Math.min(...a)) : `${fmtNum(Math.min(...a))}–${fmtNum(Math.max(...a))}`) : '?';
    const parts = [`${ss.length}`];
    if (ex.kind !== 'bodyweight') parts.push(span(ws));
    parts.push(span(rs));
    return `✓ ${shortName(ex.nameRu)} · ${parts.join('×')}`;
  }

  function renderExercise(ex) {
    const rec = recs[ex.id];
    const data = ensureEx(ex);
    const st = rec ? (STATUS[rec.status] || STATUS.hold) : null;
    const step = stepOf(ex);
    const card = h('div', { class: 'card wk-ex' });
    refs.cards.push({ ex, el: card });
    let expanded = false, detOpen = false;

    const buildDetails = () => {
      const body = h('div', { class: 'acc-body wk-exb' });
      body.append(h('div', { class: 'muted wk-en' }, ex.nameEn));
      if (rec) {
        const tr = rec.targetReps || { min: ex.repMin, max: ex.repMax };
        let line;
        if (ex.kind === 'bodyweight') line = `Цель: ${tr.min === tr.max ? tr.min : tr.min + '–' + tr.max} повт.`;
        else if (rec.weightKg == null) line = 'Вес: выбери сам';
        else line = `Рекомендуемый вес: ${fmtNum(rec.weightKg)} кг`;
        body.append(
          h('div', { class: ['wk-rec', st.cls] }, h('b', null, st.label + ' · ' + line)),
          h('div', { class: 'muted wk-reason' }, rec.reason));
      }
      if (ex.kind === 'smith') {
        body.append(h('div', { class: 'muted wk-reason' },
          `Вес: блины на оба борта, без грифа; гриф ${fmtNum(Number(settings.smithBarKg) || 0)} кг учтён.`));
      }
      if (ex.kind !== 'bodyweight' && step > 0) body.append(h('div', { class: 'muted wk-reason' }, `Шаг веса: ${fmtNum(step)} кг.`));
      if (ex.focus) body.append(h('div', { class: 'wk-focus' }, ex.focus));

      const note = h('textarea', {
        class: 'input wk-notei', rows: 2, placeholder: 'Заметка к упражнению', 'aria-label': 'Заметка: ' + ex.nameRu,
        oninput: e => { const d = ensureEx(ex); d.note = e.target.value; save(); },
      });
      note.value = data.note || '';
      body.append(note);
      const tech = techniques && techniques[ex.id];
      if (tech) body.append(renderTech(ex, tech));
      const det = h('details', { class: 'acc wk-more' }, h('summary', null, 'Подробнее'), body);
      det.open = detOpen;
      det.addEventListener('toggle', () => { detOpen = det.open; });
      return det;
    };

    const draw = () => {
      card.textContent = '';
      const full = isFull(ex);
      card.classList.toggle('full', full);
      if (full && !expanded) {
        card.append(h('button', { type: 'button', class: 'wk-rdone', onclick: () => { expanded = true; draw(); } },
          summaryLine(ex, data)));
        updateCurrent();
        return;
      }
      card.append(h('div', { class: 'wk-eh' },
        h('b', { class: 'wk-name' }, shortName(ex.nameRu)),
        full ? h('button', { type: 'button', class: 'wk-rfold', onclick: () => { expanded = false; draw(); } }, 'Свернуть ✓') : null));
      card.append(h('div', { class: 'muted wk-range' },
        `${setsOf(ex)}×${rangeOf(ex)} · отдых ~${ex.restSec || 60} с` + (ex.kind === 'smith' ? ' · блины, без грифа' : '')));
      for (let i = 0; i < setsOf(ex); i++) card.append(renderSet(ex, i, () => {
        updateStatus();
        if (isFull(ex)) { expanded = false; draw(); } else updateCurrent();
      }));
      card.append(buildDetails());
      updateCurrent();
    };
    draw();
    return card;
  }

  function renderTech(ex, t) {
    const body = h('div', { class: 'acc-body wk-tech' });
    if (t.svg) body.append(h('div', { class: 'wk-svg', html: t.svg }));
    if (t.steps && t.steps.length) {
      body.append(h('ol', { class: 'wk-steps' }, t.steps.map(s => h('li', null, h('b', null, s.title + '. '), s.text))));
    }
    if (t.mistakes && t.mistakes.length) {
      body.append(h('h3', null, 'Частые ошибки'), h('ul', { class: 'wk-steps' }, t.mistakes.map(m => h('li', null, m))));
    }
    if (t.tip) body.append(h('p', { class: 'wk-tip' }, h('b', null, 'Совет: '), t.tip));
    body.append(h('a', {
      class: 'btn block', target: '_blank', rel: 'noopener noreferrer',
      href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ex.youtubeQuery || ex.nameEn),
    }, 'Видео на YouTube'));
    return h('details', { class: 'acc wk-acc' }, h('summary', null, 'Как делать'), body);
  }

  function renderSet(ex, i, onChange) {
    const data = ensureEx(ex);
    const s = data.sets[i];
    const rec = recs[ex.id];
    const bw = ex.kind === 'bodyweight';
    const row = h('div', { class: ['wk-set', s.done && 'done', bw && 'bw'] });
    const step = stepOf(ex);

    const mk = (value, ph, label, mode, onin) => {
      const inp = h('input', {
        class: 'input wk-in', type: 'text', inputmode: mode, autocomplete: 'off', placeholder: ph, 'aria-label': label,
      });
      inp.value = value == null ? '' : fmtNum(value);
      inp.addEventListener('input', () => onin(inp));
      return inp;
    };

    const label = `${ex.nameRu}, подход ${i + 1}`;
    const recW = rec && rec.weightKg != null ? rec.weightKg : null;
    let w = null, wEl = null;
    if (!bw) {
      const inp = mk(s.weight, recW != null ? fmtNum(recW) : 'кг', 'Вес, кг. ' + label, 'decimal',
        inp => { s.weight = parseNum(inp.value); save(); });
      w = { inp };
      const bump = dir => {
        const st = step || 1;
        const base = s.weight != null ? s.weight : (recW != null ? recW : 0);
        const v = Math.max(0, Math.round((base + dir * st) * 100) / 100);
        s.weight = v; inp.value = fmtNum(v); save();
      };
      const mkBtn = (txt, dir, lab) => h('button', {
        type: 'button', class: 'wk-pm', 'aria-label': `${lab} ${fmtNum(step || 1)} кг. ${label}`, onclick: () => bump(dir),
      }, txt);
      wEl = h('div', { class: 'wk-wgt' }, mkBtn('−', -1, 'Минус'), inp, mkBtn('+', 1, 'Плюс'));
    }
    const rp = { inp: mk(s.reps, rangeOf(ex), 'Повторения. ' + label, 'numeric',
      inp => { const v = parseNum(inp.value); s.reps = v == null ? null : Math.round(v); save(); }) };

    const chk = h('input', {
      type: 'checkbox', class: 'check', checked: !!s.done, 'aria-label': 'Подход выполнен. ' + label,
      onchange: e => {
        s.done = e.target.checked;
        if (s.done) {
          // подставить вес/повторения из предыдущего подхода, если поля пустые
          const prev = i > 0 ? data.sets[i - 1] : null;
          if (w && s.weight == null) {
            const v = prev && prev.weight != null ? prev.weight : recW;
            if (v != null) { s.weight = v; w.inp.value = fmtNum(v); }
          }
          if (s.reps == null && prev && prev.reps != null) { s.reps = prev.reps; rp.inp.value = String(prev.reps); }
        }
        row.classList.toggle('done', s.done);
        save();
        if (onChange) onChange();
      },
    });

    let badge = null;
    if (bw) badge = h('span', { class: 'badge wk-rb' }, `цель ${rangeOf(ex)}`);
    else if (recW != null) badge = h('span', { class: 'badge accent wk-rb' }, `${fmtNum(recW)} кг`);

    row.append(
      h('div', { class: 'wk-sl' }, h('span', { class: 'wk-sn' }, `Подход ${i + 1}`), badge),
      h('div', { class: 'wk-inputs' }, wEl, rp.inp, chk));
    return row;
  }


  function finish() {
    const day = dayOf();
    allExercises(day).forEach(ensureEx);
    if (!session.finishedAt) session.finishedAt = new Date().toISOString();
    save();
    const recMap = {};
    for (const [id, r] of Object.entries(recs)) if (r) recMap[id] = { weightKg: r.weightKg };
    let md;
    try {
      const { _persisted, ...clean } = session;
      md = store.sessionToMarkdown(clean, program, { recommendations: recMap, settings });
    } catch (e) { console.error(e); alert('Не удалось сформировать файл: ' + e.message); return; }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `trenirovka_${session.date}_${session.dayId}.md` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    refs.finishBtn.textContent = 'Тренировка завершена, скачать .md снова';
  }

  render();
}

export function unmount() {
  try { wakeCtx && wakeCtx.wakeLock && wakeCtx.wakeLock.disable(); } catch (_) {}
}
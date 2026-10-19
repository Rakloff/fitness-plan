// Экран «Прогресс»: графики по упражнению, рекорд, рекомендации, сводка недели.

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');
const shortDate = s => { const d = parseISO(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); };
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const STATUS = {
  calibrate: { label: 'Калибровка', cls: 'st-calibrate' },
  increase: { label: 'Прибавь', cls: 'st-increase' },
  hold: { label: 'Оставь', cls: 'st-hold' },
  decrease: { label: 'Снизь', cls: 'st-decrease' },
};

function weekInfoFor(program, planStart, date) {
  const weeks = program.weeks || [];
  if (!weeks.length) return null;
  const diff = Math.floor((parseISO(iso(date)) - parseISO(planStart)) / 86400000);
  const n = Math.min(weeks.length, Math.max(1, Math.floor(diff / 7) + 1));
  return weeks.find(w => w.n === n) || weeks[0];
}

function doneSets(session, exId) {
  const ex = session.exercises && session.exercises[exId];
  if (!ex || !Array.isArray(ex.sets)) return [];
  return ex.sets.filter(s => s && s.done && Number.isFinite(s.reps) && s.reps > 0);
}

function hasWork(session) {
  return Object.values(session.exercises || {}).some(e => e && Array.isArray(e.sets) && e.sets.some(s => s && s.done));
}

function exerciseStats(ex, sessions) {
  const bw = ex.kind === 'bodyweight';
  const rows = [];
  for (const s of sessions) {
    const sets = doneSets(s, ex.id);
    if (!sets.length) continue;
    if (bw) {
      rows.push({ date: s.date, top: Math.max(...sets.map(t => t.reps)), vol: sets.reduce((a, t) => a + t.reps, 0), topReps: null });
    } else {
      const withW = sets.filter(t => Number.isFinite(t.weight) && t.weight > 0);
      if (!withW.length) continue;
      const top = Math.max(...withW.map(t => t.weight));
      const topReps = Math.max(...withW.filter(t => t.weight === top).map(t => t.reps));
      rows.push({ date: s.date, top, topReps, vol: withW.reduce((a, t) => a + t.weight * t.reps, 0) });
    }
  }
  return rows;
}

function allExercises(program) {
  const seen = new Set(), out = [];
  for (const d of program.days) for (const b of d.blocks) for (const ex of b.exercises) {
    if (!seen.has(ex.id)) { seen.add(ex.id); out.push({ ex, day: d }); }
  }
  return out;
}

function nextTrainingDate(program, sessions, today) {
  const days = program.days.filter(d => !d.optional && d.weekdays && d.weekdays.length);
  const wi = (today.getDay() + 6) % 7;
  const m0 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - wi));
  const s0 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - wi + 6));
  const fin = sessions.filter(s => s.date >= m0 && s.date <= s0 && (s.finishedAt || hasWork(s)));
  const undone = days.find(d => !fin.some(s => s.dayId === d.id));
  if (undone) return { date: today, day: undone };
  for (let i = 1; i < 9; i++) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const day = days.find(d => d.weekdays.includes(dt.getDay()));
    if (day) return { date: dt, day };
  }
  return { date: today, day: days[0] };
}
export function mount(root, ctx) {
  const { store, program, progression, charts, h } = ctx;
  root.textContent = '';
  if (!store || !program || !progression) {
    root.append(h('div', { class: 'placeholder' }, 'Данные недоступны.'));
    return;
  }
  const sessions = store.listSessions();
  const settings = store.getSettings();
  const today = new Date();
  const exList = allExercises(program);
  const withHistory = new Set(exList.filter(({ ex }) => exerciseStats(ex, sessions).length).map(({ ex }) => ex.id));
  let selected = (exList.find(({ ex }) => withHistory.has(ex.id)) || exList[0]).ex.id;

  const view = h('div', { class: 'pg-view' });
  const select = h('select', { class: 'input pg-select', 'aria-label': 'Упражнение' },
    program.days.map(d => {
      const g = h('optgroup', { label: d.title + ': ' + d.subtitle });
      d.blocks.forEach(b => b.exercises.forEach(ex => {
        if (exList.find(x => x.ex.id === ex.id).day === d) {
          g.append(h('option', { value: ex.id, selected: ex.id === selected }, ex.nameRu + (withHistory.has(ex.id) ? '' : ' (нет данных)')));
        }
      }));
      return g;
    }));
  select.addEventListener('change', () => { selected = select.value; renderExercise(); });

  // ---- сводка недели ----
  function weekSummary() {
    const wi = (today.getDay() + 6) % 7; // пн = 0
    const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - wi);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const [m0, s0] = [iso(mon), iso(sun)];
    const todayIso = iso(today);
    // тренировка засчитывается за свой день независимо от фактической даты внутри недели
    const base = program.days.filter(d => !d.optional);
    const info = base.map(d => {
      const s = sessions.filter(x => x.dayId === d.id && x.date >= m0 && x.date <= s0 && (x.finishedAt || hasWork(x)))
        .sort((p, q) => String(p.date).localeCompare(String(q.date)))[0];
      return { d, s };
    });
    const undone = info.filter(x => !x.s);
    const daysLeft = 7 - wi; // включая сегодня
    // не помещается в оставшиеся дни -> пропущено (раньше запланированные дни считаем пропущенными первыми)
    const missedN = Math.max(0, undone.length - daysLeft);
    const missedIds = new Set(undone.slice(0, missedN).map(x => x.d.id));
    let done = 0, missed = 0, upcoming = 0;
    const chips = [];
    for (const { d, s } of info) {
      const planned = d.weekdays && d.weekdays[0] != null ? WD[d.weekdays[0]] : '';
      let st, label;
      if (s) { done++; st = 'ok'; label = 'сделана ' + shortDate(s.date); }
      else if (missedIds.has(d.id)) { missed++; st = 'miss'; label = 'пропущена'; }
      else { upcoming++; st = 'soon'; label = (planned && d.weekdays[0] === today.getDay()) ? 'сегодня' : 'впереди' + (planned ? ' (план: ' + planned + ')' : ''); }
      chips.push(h('li', { class: 'pg-chip ' + st }, h('b', null, d.title), ' · ' + label));
    }
    return h('section', { class: 'card' },
      h('h2', null, 'Эта неделя'),
      h('p', { class: 'pg-big' },
        h('span', { class: 'accent' }, 'Сделано: ' + done), ' · ',
        h('span', { class: missed ? 'danger' : 'muted' }, 'Пропущено: ' + missed),
        upcoming ? h('span', { class: 'muted' }, ' · Впереди: ' + upcoming) : null),
      h('ul', { class: 'pg-chips' }, chips));
  }
  // ---- рекомендации ----
  function recommendations() {
    const { date, day } = nextTrainingDate(program, sessions, today);
    const wk = weekInfoFor(program, settings.planStartDate || iso(today), date);
    const items = [];
    day.blocks.forEach(b => b.exercises.forEach(ex => {
      let r;
      try { r = progression.recommend(ex, sessions, settings, wk); } catch (e) { r = null; }
      if (!r) return;
      const st = STATUS[r.status] || STATUS.hold;
      const target = r.targetReps ? `${r.targetReps.min}–${r.targetReps.max} повт.` : '';
      const what = ex.kind === 'bodyweight' ? target
        : (r.weightKg == null ? 'вес подбери сам · ' + target : `${fmt(r.weightKg)} кг · ${target}`);
      items.push(h('li', { class: 'pg-rec' },
        h('div', { class: 'pg-rec-head' },
          h('span', { class: 'pg-rec-name' }, ex.nameRu),
          h('span', { class: 'pg-badge ' + st.cls }, st.label)),
        h('div', { class: 'pg-rec-what' }, what),
        h('div', { class: 'muted pg-rec-why' }, r.reason)));
    }));
    return h('section', { class: 'card' },
      h('h2', null, 'Рекомендация на следующую тренировку'),
      h('p', { class: 'muted' }, `${day.title}, ${WD[date.getDay()]} ${shortDate(iso(date))}` + (wk ? ` · неделя ${wk.n}, ${wk.phase}` : '')),
      h('ul', { class: 'pg-list' }, items));
  }

  // ---- блок выбранного упражнения ----
  const exBox = h('div');
  function renderExercise() {
    exBox.textContent = '';
    const ex = exList.find(x => x.ex.id === selected).ex;
    const rows = exerciseStats(ex, sessions);
    if (!rows.length) {
      exBox.append(h('div', { class: 'card pg-empty' },
        h('h3', null, 'Пока нет истории'),
        h('p', null, 'Проведи первую тренировку — это калибровка. Подбери вес, с которым легко делаются 10 повторений и остаются 2–3 в запасе.')));
      return;
    }
    const bw = ex.kind === 'bodyweight';
    let pr = rows[0];
    rows.forEach(r => { if (r.top > pr.top || (r.top === pr.top && (r.topReps || 0) > (pr.topReps || 0))) pr = r; });
    exBox.append(h('div', { class: 'card accent-border pg-pr' },
      h('div', { class: 'muted' }, 'Личный рекорд'),
      h('div', { class: 'pg-pr-val' }, bw ? `${pr.top} повт.` : `${fmt(pr.top)} кг × ${pr.topReps}`),
      h('div', { class: 'muted' }, shortDate(pr.date) + ' · тренировок: ' + rows.length)));

    const c1 = h('div', { class: 'chart' });
    const c2 = h('div', { class: 'chart' });
    exBox.append(
      h('div', { class: 'card' }, h('h3', null, bw ? 'Лучший подход, повторения' : 'Рабочий вес, кг'),
        h('p', { class: 'muted pg-hint' }, bw ? 'Максимум повторений за подход.' : 'Максимальный вес, отмеченный как выполненный (то, что стоит на тренажёре).'), c1),
      h('div', { class: 'card' }, h('h3', null, bw ? 'Объём: сумма повторений' : 'Объём: вес × повторы, кг'), c2));
    charts.lineChart(c1, { points: rows.map(r => ({ x: r.date, y: r.top })), yLabel: bw ? 'повт.' : 'кг', color: '#3ddc84' });
    charts.barChart(c2, { points: rows.map(r => ({ x: shortDate(r.date), y: r.vol })), yLabel: bw ? 'повт.' : 'кг', color: '#4aa8ff' });
  }

  const exportMsg = h('p', { class: 'muted', role: 'status' });
  const exportMd = () => {
    try {
      const blob = new Blob([store.progressToMarkdown(program)], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const name = 'fitness-progress_' + iso(new Date()) + '.md';
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      exportMsg.className = 'accent'; exportMsg.textContent = 'Сохранено: ' + name;
    } catch (e) { exportMsg.className = 'danger'; exportMsg.textContent = 'Не удалось создать файл: ' + e.message; }
  };

  root.append(h('div', { class: 'pg' },
    h('h1', null, 'Прогресс'),
    weekSummary(),
    recommendations(),
    h('section', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, 'Упражнение'), select)),
    exBox,
    h('section', { class: 'card' },
      h('button', { class: 'btn block', type: 'button', onclick: exportMd }, 'Экспорт всего прогресса (.md)'),
      exportMsg)));
  renderExercise();
}

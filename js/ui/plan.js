// Экран «План»: расписание, 8 недель, общий прогресс, дата старта.

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const WD_NAMES = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };

export function mount(root, ctx) {
  const { store, program, h } = ctx;
  root.textContent = '';
  if (!store || !program) { root.append(h('div', { class: 'placeholder' }, 'Данные недоступны.')); return; }

  const box = h('div', { class: 'pl' });
  root.append(box);

  function render() {
    box.textContent = '';
    const settings = store.getSettings();
    const startStr = settings.planStartDate || iso(new Date());
    const start = parseISO(startStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.floor((today - start) / 86400000);
    const total = program.weeks.length;
    const started = diff >= 0;
    const curN = started ? Math.min(total, Math.floor(diff / 7) + 1) : 0;
    const finished = diff >= total * 7;
    const pct = Math.max(0, Math.min(100, Math.round(diff / (total * 7) * 100)));

    // расписание
    const sched = program.days.map(d => h('li', { class: 'pl-sched-item' },
      h('b', { class: 'pl-wd' }, d.weekdays.map(w => WD_NAMES[w]).join('/')),
      h('span', { class: 'pl-sched-text' }, d.title + ': ' + d.subtitle)));
    box.append(h('h1', null, 'План'),
      h('section', { class: 'card' }, h('h2', null, 'Расписание'),
        h('ul', { class: 'pl-sched' }, sched),
        h('p', { class: 'muted pl-note' }, `Перед каждой тренировкой разминка ${program.warmup.minutes} мин.`)));

    // общий прогресс + дата старта
    const status = !started ? `План начнётся ${fmtDate(start)} (через ${-diff} дн.)`
      : finished ? 'План завершён. Сделай замер InBody и пересмотри программу.'
      : `Неделя ${curN} из ${total} · день ${diff + 1} из ${total * 7}`;
    const dateInput = h('input', { type: 'date', class: 'input', value: startStr, 'aria-label': 'Дата начала плана' });
    const msg = h('p', { class: 'muted pl-note', role: 'status' });
    const save = h('button', { type: 'button', class: 'btn', onclick: () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) { msg.textContent = 'Выбери дату.'; return; }
      store.saveSettings({ planStartDate: dateInput.value });
      render();
      const m = box.querySelector('.pl-msg'); if (m) m.textContent = 'Дата старта сохранена.';
    } }, 'Сохранить');
    msg.classList.add('pl-msg');
    box.append(h('section', { class: 'card' },
      h('h2', null, 'Прогресс плана'),
      h('p', null, status),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
        h('i', { style: { width: pct + '%' } })),
      h('p', { class: 'muted pl-note' }, pct + '%'),
      h('label', { class: 'field' }, h('span', null, 'Дата начала плана'), h('div', { class: 'pl-date' }, dateInput, save)),
      msg));

    // недели
    const cards = program.weeks.map(w => {
      const ws = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w.n - 1) * 7);
      const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
      const cur = w.n === curN;
      const deload = w.loadPct < 100;
      return h('article', { class: ['card', 'pl-week', cur && 'current', deload && 'deload', started && w.n < curN && 'past'], 'aria-current': cur ? 'step' : null },
        h('div', { class: 'pl-week-head' },
          h('h3', null, 'Неделя ' + w.n),
          h('span', { class: ['badge', cur && 'accent'] }, cur ? 'Сейчас · ' + w.phase : w.phase)),
        h('div', { class: 'muted' }, fmtDate(ws) + ' – ' + fmtDate(we) + (cur ? ' · текущая' : '')),
        h('p', { class: 'pl-goal' }, w.loadNote),
        h('ul', { class: 'pl-stats' },
          h('li', null, h('span', { class: 'muted' }, 'Запас повторений'), h('b', null, String(w.repsInReserve))),
          h('li', null, h('span', { class: 'muted' }, 'Вес'), h('b', null, w.loadPct + '%')),
          h('li', null, h('span', { class: 'muted' }, 'Объём'), h('b', null, w.volumePct + '%'))));
    });
    box.append(h('h2', null, '8 недель'), ...cards,
      h('section', { class: 'card accent-border' },
        h('h3', null, 'Неделя 8 и InBody'),
        h('p', null, 'На 8 неделе разгрузка (deload): веса примерно на 15 % ниже, подходов меньше на треть. Организм восстанавливается и закрепляет результат.'),
        h('p', { class: 'muted' }, 'После недели 8 сделай замер InBody (вкладка «InBody») и пересмотри программу.')));
  }
  render();
}

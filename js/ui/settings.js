// Экран «Настройки»: гриф Смита, экран, шаги веса, бэкап, справка, обновление.
import { h } from '../dom.js';

const APP_VERSION = '1.0';

function parseNum(s) {
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return parseFloat(t);
}
const fmt = v => String(v).replace('.', ',');

export function mount(root, ctx) {
  const { store, program } = ctx;
  const st = () => store.getSettings();

  root.append(h('h1', null, 'Настройки'));

  // ---- гриф Смита ----
  const barMsg = h('p', { class: 'muted ss-msg', role: 'status' });
  const barInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: fmt(st().smithBarKg || 0) });
  barInput.addEventListener('change', () => {
    const v = parseNum(barInput.value);
    if (v == null || isNaN(v) || v > 40) {
      barMsg.textContent = 'Введите число от 0 до 40 кг.'; barMsg.className = 'danger ss-msg'; return;
    }
    store.saveSettings({ smithBarKg: v });
    barInput.value = fmt(v);
    barMsg.textContent = 'Сохранено.'; barMsg.className = 'accent ss-msg';
  });
  root.append(h('div', { class: 'card' },
    h('h2', null, 'Гриф Смита'),
    h('label', { class: 'field' }, h('span', null, 'Вес грифа, кг'), barInput),
    barMsg,
    h('p', { class: 'muted' }, 'Как проверить: подбери минимальный вес на блинах, при котором гриф стоит, не едет вниз/вверх. Этот вес блинов (на оба борта) и есть эквивалент грифа. Если гриф уравновешен и сам стоит без блинов, оставь 0.'),
    h('p', { class: 'muted' }, 'В тренировке ты вводишь только блины; к итоговому весу гриф добавляется автоматически.')));

  // ---- переключатели ----
  const toggle = (key, label, hint) => {
    const cb = h('input', { class: 'check', type: 'checkbox', checked: st()[key] !== false, id: 'ss-' + key });
    cb.addEventListener('change', () => {
      store.saveSettings({ [key]: cb.checked });
      if (key === 'wakeLock' && ctx.wakeLock) { try { cb.checked ? ctx.wakeLock.enable() : ctx.wakeLock.disable(); } catch (_) {} }
    });
    return h('label', { class: 'check-row ss-toggle', for: 'ss-' + key }, cb,
      h('span', { class: 'grow' }, label, hint ? h('small', { class: 'muted ss-hint' }, hint) : null));
  };
  root.append(h('div', { class: 'card' },
    h('h2', null, 'Экран'),
    toggle('wakeLock', 'Не гасить экран во время тренировки', ctx.wakeLock && !ctx.wakeLock.supported ? 'Не поддерживается этим браузером' : null)));

  // ---- шаги веса ----
  const exercises = [];
  const seen = new Set();
  for (const d of (program && program.days) || []) for (const b of d.blocks || []) for (const e of b.exercises || []) {
    if (!seen.has(e.id)) { seen.add(e.id); exercises.push(e); }
  }
  const stepCard = h('div', { class: 'card' },
    h('h2', null, 'Шаг веса по упражнениям'),
    h('p', { class: 'muted' }, 'На сколько кг приложение предлагает повышать вес. Пустое поле — шаг по умолчанию. Для упражнений с собственным весом шаг не нужен.'));
  for (const e of exercises) {
    if (e.kind === 'bodyweight') continue;
    const ov = (st().stepOverrides || {})[e.id];
    const inp = h('input', { class: 'input ss-step', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: fmt(e.stepKg), value: ov != null ? fmt(ov) : '', 'aria-label': 'Шаг веса: ' + e.nameRu });
    inp.addEventListener('change', () => {
      const v = parseNum(inp.value);
      const cur = { ...(st().stepOverrides || {}) };
      if (v == null) delete cur[e.id];
      else if (isNaN(v) || v <= 0 || v > 50) { inp.value = cur[e.id] != null ? fmt(cur[e.id]) : ''; inp.focus(); return; }
      else cur[e.id] = v;
      store.saveSettings({ stepOverrides: cur });
      if (v != null) inp.value = fmt(v);
    });
    stepCard.append(h('div', { class: 'ss-step-row' },
      h('div', { class: 'grow ss-step-name' }, e.nameRu, h('small', { class: 'muted ss-hint' }, (e.kind === 'smith' ? 'блины на оба борта, ' : '') + 'по умолч. ' + fmt(e.stepKg) + ' кг')),
      inp));
  }
  root.append(stepCard);

  // ---- бэкап ----
  const bkMsg = h('p', { class: 'muted ss-msg', role: 'status' });
  const setBk = (t, cls) => { bkMsg.textContent = t; bkMsg.className = cls + ' ss-msg'; };
  const fileInput = h('input', { type: 'file', accept: '.json,.md,application/json,text/markdown,text/plain', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    let text;
    try { text = await f.text(); } catch (_) { return setBk('Не удалось прочитать файл.', 'danger'); }
    if (!confirm('Заменить ВСЕ текущие данные (тренировки, InBody, настройки) данными из файла «' + f.name + '»? Это действие нельзя отменить.')) return;
    const res = store.importBackup(text);
    if (res && res.ok) { setBk('Данные восстановлены. Перезагрузка…', 'accent'); setTimeout(() => location.reload(), 700); }
    else setBk('Ошибка: ' + ((res && res.error) || 'не удалось восстановить') + '. Текущие данные не изменены.', 'danger');
  });
  const saveBackup = () => {
    try {
      const blob = new Blob([store.exportBackup()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const name = 'fitness-backup-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setBk('Копия сохранена: ' + name, 'accent');
    } catch (e) { setBk('Не удалось создать копию: ' + e.message, 'danger'); }
  };
  const saveProgressMd = () => {
    try {
      const blob = new Blob([store.progressToMarkdown(program)], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const name = 'fitness-progress_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.md';
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setBk('Прогресс сохранён: ' + name, 'accent');
    } catch (e) { setBk('Не удалось создать файл: ' + e.message, 'danger'); }
  };
  root.append(h('div', { class: 'card' },
    h('h2', null, 'Резервная копия'),
    h('p', { class: 'muted' }, 'Данные хранятся только на этом устройстве. Делай копию раз в неделю и перед очисткой браузера.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', type: 'button', onclick: saveBackup }, 'Сохранить копию (.json)'),
      h('button', { class: 'btn block', type: 'button', onclick: saveProgressMd }, 'Экспорт всего прогресса (.md)'),
      h('button', { class: 'btn block', type: 'button', onclick: () => fileInput.click() }, 'Восстановить из файла (.json или .md)'),
      fileInput, bkMsg)));

  // ---- справка ----
  const acc = (title, ...body) => h('details', { class: 'acc' }, h('summary', null, title), h('div', { class: 'acc-body' }, ...body));
  root.append(
    h('h2', { class: 'ss-h' }, 'Справка'),
    acc('Питание',
      h('ul', { class: 'ss-list' },
        h('li', null, 'Калории: около 2400–2600 ккал в день (умеренный профицит +300–400 ккал).'),
        h('li', null, 'Белок: 110–120 г в день (1,8–2,0 г на кг веса).'),
        h('li', null, 'До тренировки (за 50–60 мин): шейк с протеином, овсяной мукой и бананом, без орехов и паст.'),
        h('li', null, 'После тренировки: приём на 25–28 г белка (например, сырники со сметаной или протеин).'),
        h('li', null, 'Креатин моногидрат: 5 г ежедневно, постоянно.'),
        h('li', null, 'Вода: 2–2,5 л в день.'))),
    acc('Сон',
      h('ul', { class: 'ss-list' },
        h('li', null, 'Рекомендация: 7–7,5 часа в сутки.'),
        h('li', null, 'Если спал меньше 5 часов: не гонись за рекордами, снизь рабочие веса или объём (например, на один подход меньше) и закончи тренировку раньше. Лучше сделать лёгкую, чем травмироваться.'))));

  // ---- версия и обновление ----
  const upMsg = h('p', { class: 'muted ss-msg', role: 'status' });
  const update = async () => {
    upMsg.textContent = 'Обновляю…';
    try {
      if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k).catch(() => false))); }
    } catch (_) {}
    try {
      if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister().catch(() => false))); }
    } catch (_) {}
    location.reload();
  };
  root.append(h('div', { class: 'card' },
    h('h2', null, 'О приложении'),
    h('p', { class: 'muted' }, 'Версия ' + APP_VERSION + '. Работает офлайн. Данные не покидают устройство.'),
    h('button', { class: 'btn block', type: 'button', onclick: update }, 'Обновить приложение'),
    upMsg));
}

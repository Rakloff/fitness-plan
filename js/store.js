// Хранилище: localStorage (ключ fp:v1) + запасной вариант в памяти. Синхронный API.

export const STORAGE_KEY = 'fp:v1';
export const SCHEMA_VERSION = 1;

let memRaw = null; // запасной вариант, если localStorage недоступен

function ls() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function pad(n) { return String(n).padStart(2, '0'); }
export function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function nextMonday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (8 - d.getDay()) % 7; // вс(0)->1, пн(1)->0, вт(2)->6 ...
  d.setDate(d.getDate() + add);
  return toISODate(d);
}

function defaultSettings() {
  return { smithBarKg: 0, vibrate: true, sound: true, wakeLock: true, planStartDate: nextMonday(), stepOverrides: {} };
}

function seedData() {
  return {
    schema: SCHEMA_VERSION,
    sessions: {},
    settings: defaultSettings(),
    inbody: [{ date: '2026-10-19', weightKg: 61.5, fatPct: 9.7, fatKg: 6.0, smmKg: 31.3, bmr: 1570, visceral: null }]
  };
}

// Миграции: обновляют данные до текущей версии схемы (пока заглушка).
export function migrate(data) {
  if (!data || typeof data !== 'object') return data;
  let v = Number(data.schema) || 1;
  // while (v < SCHEMA_VERSION) { switch (v) { case 1: ...; } v++; }
  data.schema = Math.max(v, SCHEMA_VERSION);
  return data;
}

function readRaw() {
  const s = ls();
  if (s) {
    try {
      return s.getItem(STORAGE_KEY); // хранилище работает: оно источник правды (null = пусто)
    } catch { /* падаем на память */ }
  }
  return memRaw;
}

function writeRaw(raw) {
  memRaw = raw;
  const s = ls();
  if (s) {
    try { s.setItem(STORAGE_KEY, raw); } catch { /* остаётся в памяти */ }
  }
}

function load() {
  const raw = readRaw();
  if (raw != null) {
    try {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        migrate(d);
        d.sessions = d.sessions && typeof d.sessions === 'object' ? d.sessions : {};
        d.inbody = Array.isArray(d.inbody) ? d.inbody : [];
        d.settings = { ...defaultSettings(), ...(d.settings || {}) };
        return d;
      }
    } catch { /* битые данные: не затираем, работаем с пустыми */ }
    return { ...seedData(), inbody: [], _corrupt: true };
  }
  const d = seedData();
  writeRaw(JSON.stringify(d));
  return d;
}

function save(d) {
  delete d._corrupt;
  writeRaw(JSON.stringify(d));
}

// --- сессии ---
export function getSession(date, dayId) {
  return load().sessions[`${date}_${dayId}`] || null;
}

export function saveSession(session) {
  if (!session || !session.date || !session.dayId) throw new Error('saveSession: нужны date и dayId');
  const d = load();
  const id = session.id || `${session.date}_${session.dayId}`;
  d.sessions[id] = { ...session, id };
  save(d);
}

export function listSessions() {
  return Object.values(load().sessions).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
}

export function deleteSession(id) {
  const d = load();
  delete d.sessions[id];
  save(d);
}

// --- настройки ---
export function getSettings() { return load().settings; }

export function saveSettings(patch) {
  const d = load();
  d.settings = { ...d.settings, ...(patch || {}) };
  save(d);
  return d.settings;
}

// --- InBody ---
export function listInbody() {
  return load().inbody.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function addInbody(rec) {
  if (!rec || !rec.date) throw new Error('addInbody: нужна date');
  const d = load();
  d.inbody = d.inbody.filter(r => r.date !== rec.date); // одна запись на дату
  d.inbody.push({ visceral: null, ...rec });
  save(d);
}

export function deleteInbody(date) {
  const d = load();
  d.inbody = d.inbody.filter(r => r.date !== date);
  save(d);
}

// --- бэкап ---
export function exportBackup() {
  const d = load();
  return JSON.stringify({
    app: 'fitness-plan',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: Object.values(d.sessions),
    settings: d.settings,
    inbody: d.inbody
  }, null, 2);
}

const MD_JSON_RE = /```json fitness-backup[ \t]*\r?\n([\s\S]*?)\r?\n```/;

export function importBackup(jsonString) {
  let o;
  let text = jsonString;
  // Экспорт прогресса (.md): достаём JSON-блок ```json fitness-backup
  if (typeof text === 'string' && !/^\s*[{[]/.test(text)) {
    const mm = MD_JSON_RE.exec(text);
    if (mm) text = mm[1];
  }
  try { o = JSON.parse(text); } catch { return { ok: false, error: 'Файл не похож на JSON' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'Неверная структура файла' };
  if (o.app !== 'fitness-plan') return { ok: false, error: 'Это не резервная копия приложения' };
  if (!Number.isFinite(o.schema) || o.schema > SCHEMA_VERSION) return { ok: false, error: 'Неизвестная версия данных' };
  if (!Array.isArray(o.sessions) || !Array.isArray(o.inbody) || !o.settings || typeof o.settings !== 'object' || Array.isArray(o.settings)) {
    return { ok: false, error: 'В файле не хватает разделов (sessions, settings, inbody)' };
  }
  const sessions = {};
  for (const s of o.sessions) {
    if (!s || typeof s.date !== 'string' || typeof s.dayId !== 'string' || !s.exercises || typeof s.exercises !== 'object') {
      return { ok: false, error: 'Одна из тренировок повреждена' };
    }
    for (const ex of Object.values(s.exercises)) {
      if (!ex || !Array.isArray(ex.sets)) return { ok: false, error: 'Одна из тренировок повреждена' };
    }
    sessions[s.id || `${s.date}_${s.dayId}`] = { ...s, id: s.id || `${s.date}_${s.dayId}` };
  }
  for (const r of o.inbody) {
    if (!r || typeof r.date !== 'string') return { ok: false, error: 'Одна из записей InBody повреждена' };
  }
  const data = migrate({
    schema: o.schema,
    sessions,
    settings: { ...defaultSettings(), ...o.settings },
    inbody: o.inbody
  });
  writeRaw(JSON.stringify(data));
  return { ok: true };
}

// --- вес ---
export function effectiveWeight(entered, exercise, settings) {
  const w = Number(entered) || 0;
  const bar = exercise && exercise.kind === 'smith' ? Number((settings || getSettings()).smithBarKg) || 0 : 0;
  return w + bar;
}

// --- Markdown ---
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function num(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
function cell(s) { return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }

/**
 * opts.recommendations: { [exerciseId]: { weightKg } } — рекомендованный вес (то, что выставлять на тренажёре).
 * opts.settings: переопределить настройки (по умолчанию getSettings()).
 */
export function sessionToMarkdown(session, program, opts = {}) {
  const settings = opts.settings || getSettings();
  const recs = opts.recommendations || {};
  const day = (program.days || []).find(x => x.id === session.dayId);
  const [y, m, dd] = String(session.date).split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, (m || 1) - 1, dd || 1).getDay()];
  const week = (program.weeks || []).find(w => w.n === session.weekN);

  const L = [];
  L.push(`# Тренировка ${session.date} (${wd}) — ${day ? `${day.title}: ${day.subtitle}` : session.dayId}`);
  L.push('');
  L.push(`- Неделя плана: ${session.weekN}${week ? ` — ${week.phase}` : ''}`);
  if (week && week.loadNote) L.push(`- Цель недели: ${week.loadNote}`);
  L.push(`- Разминка: ${session.warmupDone ? 'выполнена' : 'не отмечена'}`);
  if (settings.smithBarKg) L.push(`- Гриф Смита: ${num(settings.smithBarKg)} кг (добавляется к блинам)`);
  if (session.startedAt) L.push(`- Начало: ${session.startedAt}`);
  if (session.finishedAt) L.push(`- Конец: ${session.finishedAt}`);

  const notes = [];
  for (const block of (day ? day.blocks : [])) {
    for (const ex of block.exercises) {
      const data = (session.exercises || {})[ex.id] || { sets: [], note: '' };
      L.push('');
      L.push(`## ${block.title}: ${ex.nameRu}`);
      L.push('');
      L.push('| Подход | План | Факт | Готово |');
      L.push('|---|---|---|---|');
      const rec = recs[ex.id] && Number.isFinite(recs[ex.id].weightKg) ? recs[ex.id].weightKg : null;
      const plan = `${ex.repMin}–${ex.repMax} повт.` + (rec != null ? `, рек. ${num(rec)} кг` : '');
      const count = Math.max(ex.sets || 0, data.sets.length);
      for (let i = 0; i < count; i++) {
        const s = data.sets[i];
        let fact = '—';
        if (s && (s.weight != null || s.reps != null)) {
          const reps = s.reps != null ? s.reps : '?';
          if (ex.kind === 'bodyweight') {
            fact = `${reps} повт.`;
          } else if (s.weight == null) {
            fact = `? кг × ${reps}`;
          } else if (ex.kind === 'smith') {
            fact = `блины ${num(s.weight)} кг / итого ${num(effectiveWeight(s.weight, ex, settings))} кг × ${reps}`;
          } else {
            fact = `${num(s.weight)} кг × ${reps}`;
          }
        }
        L.push(`| ${i + 1} | ${cell(plan)} | ${cell(fact)} | ${s && s.done ? '✓' : '—'} |`);
      }
      if (data.note && data.note.trim()) notes.push(`- **${ex.nameRu}:** ${cell(data.note.trim())}`);
    }
  }

  L.push('');
  L.push('## Заметки');
  L.push('');
  if (notes.length) L.push(...notes); else L.push('Нет заметок.');
  L.push('');
  return L.join('\n');
}

/**
 * Полный экспорт прогресса в один .md: frontmatter, сводка, InBody, тренировки, JSON-блок для восстановления.
 * opts.now: Date (для тестов).
 */
export function progressToMarkdown(program, opts = {}) {
  const settings = opts.settings || getSettings();
  const sessions = listSessions();
  const inbody = listInbody();
  const days = (program && program.days) || [];
  const L = [];
  L.push('---');
  L.push('type: fitness-progress');
  L.push(`exported: ${toISODate(opts.now || new Date())}`);
  L.push(`sessions: ${sessions.length}`);
  L.push(`smith_bar_kg: ${Number(settings.smithBarKg) || 0}`);
  L.push(`schema: ${SCHEMA_VERSION}`);
  L.push('---');
  L.push('');
  L.push('# Прогресс тренировок');
  L.push('');

  // --- сводка по упражнениям ---
  L.push('## Сводка по упражнениям');
  L.push('');
  if (!sessions.length) {
    L.push('Тренировок пока нет.');
  } else {
    L.push('| Упражнение | Последняя тренировка | Рекорд (рабочий вес) | Тренировок |');
    L.push('|---|---|---|---|');
    const seen = new Set();
    for (const d of days) for (const b of d.blocks || []) for (const ex of b.exercises || []) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      const bw = ex.kind === 'bodyweight';
      const rows = [];
      for (const s of sessions) {
        const sets = (((s.exercises || {})[ex.id] || {}).sets || [])
          .filter(t => t && t.done && Number.isFinite(t.reps) && t.reps > 0);
        if (!sets.length) continue;
        if (bw) { rows.push({ date: s.date, top: Math.max(...sets.map(t => t.reps)), reps: null }); continue; }
        const w = sets.filter(t => Number.isFinite(t.weight) && t.weight > 0);
        if (!w.length) continue;
        const top = Math.max(...w.map(t => t.weight));
        rows.push({ date: s.date, top, reps: Math.max(...w.filter(t => t.weight === top).map(t => t.reps)) });
      }
      if (!rows.length) continue;
      const show = r => bw ? `${r.top} повт.` : `${num(effectiveWeight(r.top, ex, settings))} кг × ${r.reps}`;
      const last = rows[rows.length - 1];
      let pr = rows[0];
      for (const r of rows) if (r.top > pr.top || (r.top === pr.top && (r.reps || 0) > (pr.reps || 0))) pr = r;
      L.push(`| ${cell(ex.nameRu)} | ${last.date}, ${show(last)} | ${pr.date}, ${show(pr)} | ${rows.length} |`);
    }
    if (settings.smithBarKg) L.push('', `Веса в Смите указаны с грифом (${num(settings.smithBarKg)} кг).`);
  }
  L.push('');

  // --- InBody ---
  L.push('## InBody');
  L.push('');
  if (!inbody.length) {
    L.push('Замеров пока нет.');
  } else {
    L.push('| Дата | Вес, кг | Жир, % | Жир, кг | SMM, кг | BMR | Висцеральный |');
    L.push('|---|---|---|---|---|---|---|');
    const v = x => (x == null || x === '' ? '—' : num(x));
    for (const r of inbody) L.push(`| ${r.date} | ${v(r.weightKg)} | ${v(r.fatPct)} | ${v(r.fatKg)} | ${v(r.smmKg)} | ${v(r.bmr)} | ${v(r.visceral)} |`);
  }
  L.push('');

  // --- тренировки (от новых к старым) ---
  L.push('## Тренировки');
  L.push('');
  if (!sessions.length) {
    L.push('Тренировок пока нет.');
    L.push('');
  } else {
    for (const s of sessions.slice().reverse()) {
      const day = days.find(x => x.id === s.dayId);
      L.push(`## ${s.date} · ${day ? day.title : s.dayId} · неделя ${s.weekN}`);
      L.push('');
      // переиспользуем sessionToMarkdown: убираем его H1, понижаем заголовки
      const body = sessionToMarkdown(s, program, { settings, recommendations: opts.recommendations })
        .split('\n').slice(1)
        .map(line => (line.startsWith('## ') ? '#' + line : line));
      L.push(...body);
    }
  }

  // --- машиночитаемый блок ---
  L.push('## Данные для восстановления');
  L.push('');
  L.push('Не редактируйте блок ниже: из него приложение восстанавливает все данные («Восстановить из файла»).');
  L.push('');
  L.push('```json fitness-backup');
  L.push(exportBackup().replace(/`/g, '\\u0060'));
  L.push('```');
  L.push('');
  return L.join('\n');
}

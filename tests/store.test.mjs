import assert from 'node:assert/strict';

// Заглушка localStorage до импорта
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};

const store = await import('../js/store.js');

const program = {
  weeks: [{ n: 3, phase: 'Основная прогрессия', loadNote: 'Добавляй вес', repsInReserve: 2, loadPct: 100 }],
  days: [{ id: 'd1', title: 'День 1', subtitle: 'Смит', blocks: [{ id: 'd1a', title: 'Блок А', rounds: 2, exercises: [
    { id: 'smith-incline-press', nameRu: 'Жим в Смите', kind: 'smith', sets: 2, repMin: 8, repMax: 10, stepKg: 10 },
    { id: 'captain', nameRu: 'Капитанский стул', kind: 'bodyweight', sets: 1, repMin: 10, repMax: 15, stepKg: 0 }
  ] }] }]
};

const session = {
  id: '2026-10-20_d1', date: '2026-10-20', dayId: 'd1', weekN: 3, warmupDone: true,
  startedAt: '2026-10-20T18:00:00Z', finishedAt: null,
  exercises: {
    'smith-incline-press': { sets: [{ weight: 20, reps: 10, done: true }, { weight: 20, reps: 8, done: false }], note: 'Лёгкий вес | ок' },
    captain: { sets: [{ weight: null, reps: 12, done: true }], note: '' }
  }
};

// дефолты и seed
const st = store.getSettings();
assert.equal(st.smithBarKg, 0);
assert.match(st.planStartDate, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(new Date(st.planStartDate + 'T12:00:00').getDay(), 1, 'старт плана - понедельник');
assert.equal(store.listInbody().length, 1);
assert.equal(store.listInbody()[0].bmr, 1570);

// сессии
assert.equal(store.getSession('2026-10-20', 'd1'), null);
store.saveSession(session);
assert.deepEqual(store.getSession('2026-10-20', 'd1').exercises.captain.sets[0].reps, 12);
store.saveSession({ ...session, id: '2026-10-13_d1', date: '2026-10-13' });
assert.deepEqual(store.listSessions().map(s => s.date), ['2026-10-13', '2026-10-20']);
store.deleteSession('2026-10-13_d1');
assert.equal(store.listSessions().length, 1);

// настройки, InBody
store.saveSettings({ smithBarKg: 5, vibrate: false });
assert.equal(store.getSettings().smithBarKg, 5);
assert.equal(store.getSettings().sound, true);
store.addInbody({ date: '2026-11-19', weightKg: 62, fatPct: 9.5, fatKg: 5.9, smmKg: 31.6, bmr: 1580 });
assert.equal(store.listInbody().length, 2);
assert.equal(store.listInbody()[1].visceral, null);

// effectiveWeight
const smith = program.days[0].blocks[0].exercises[0];
assert.equal(store.effectiveWeight(20, smith, store.getSettings()), 25);
assert.equal(store.effectiveWeight(20, { kind: 'stack' }, store.getSettings()), 20);

// бэкап туда-обратно
const backup = store.exportBackup();
mem.clear();
const fresh = store.listSessions();
assert.equal(fresh.length, 0);
assert.deepEqual(store.importBackup(backup), { ok: true });
assert.equal(store.listSessions().length, 1);
assert.equal(store.getSettings().smithBarKg, 5);
assert.equal(store.listInbody().length, 2);
assert.equal(store.getSession('2026-10-20', 'd1').exercises['smith-incline-press'].note, 'Лёгкий вес | ок');

// ошибки импорта не затирают данные
for (const bad of ['не json', '[]', '{"app":"x"}', JSON.stringify({ app: 'fitness-plan', schema: 1, sessions: [{}], settings: {}, inbody: [] }),
  JSON.stringify({ app: 'fitness-plan', schema: 99, sessions: [], settings: {}, inbody: [] })]) {
  const r = store.importBackup(bad);
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(store.listSessions().length, 1);
  assert.equal(store.listInbody().length, 2);
}

// markdown
const md = store.sessionToMarkdown(session, program, { recommendations: { 'smith-incline-press': { weightKg: 20 } } });
assert.match(md, /^# Тренировка 2026-10-20 \(вторник\)/);
assert.match(md, /Неделя плана: 3 — Основная прогрессия/);
assert.match(md, /Разминка: выполнена/);
assert.match(md, /\| Подход \| План \| Факт \| Готово \|/);
assert.match(md, /8–10 повт\., рек\. 20 кг/);
assert.match(md, /блины 20 кг \/ итого 25 кг × 10 \| ✓/);
assert.match(md, /\| 2 \|.*× 8 \| — \|/);
assert.match(md, /12 повт\. \| ✓/);
assert.match(md, /Лёгкий вес \\\| ок/);

// экспорт всего прогресса
{
  store.saveSession({ ...session, id: '2026-10-13_d1', date: '2026-10-13', weekN: 2 });
  const pmd = store.progressToMarkdown(program, { now: new Date(2026, 9, 21) });
  assert.match(pmd, /^---\ntype: fitness-progress\nexported: 2026-10-21\nsessions: 2\nsmith_bar_kg: 5\nschema: 1\n---/);
  assert.match(pmd, /## Сводка по упражнениям/);
  assert.match(pmd, /\| Упражнение \| Последняя тренировка \| Рекорд \(рабочий вес\) \| Тренировок \|/);
  assert.match(pmd, /\| Жим в Смите \| 2026-10-20, 25 кг × 10 \| 2026-10-13, 25 кг × 10 \| 2 \|/);
  assert.match(pmd, /## InBody[\s\S]*\| 2026-10-19 \| 61,5 \| 9,7 \| 6 \| 31,3 \| 1570 \| — \|/);
  assert.ok(pmd.indexOf('## 2026-10-20 · День 1 · неделя 3') < pmd.indexOf('## 2026-10-13 · День 1 · неделя 2'), 'новые сверху');
  assert.match(pmd, /\| Подход \| План \| Факт \| Готово \|/);
  assert.match(pmd, /```json fitness-backup\n\{/);
  const jm = /```json fitness-backup\n([\s\S]*?)\n```/.exec(pmd);
  assert.ok(jm);
  assert.equal(JSON.parse(jm[1]).sessions.length, 2);
  mem.clear();
  assert.equal(store.listSessions().length, 0);
  assert.deepEqual(store.importBackup(jm[1]), { ok: true });
  assert.equal(store.listSessions().length, 2);
  mem.clear();
  assert.deepEqual(store.importBackup(pmd), { ok: true }, 'импорт целого .md');
  assert.equal(store.listSessions().length, 2);
  assert.equal(store.getSettings().smithBarKg, 5);
  assert.equal(store.getSession('2026-10-20', 'd1').exercises['smith-incline-press'].note, 'Лёгкий вес | ок');
  mem.clear();
  const empty = store.progressToMarkdown(program);
  assert.match(empty, /Тренировок пока нет/);
  assert.match(empty, /sessions: 0/);
}

// без localStorage: работает в памяти
delete globalThis.localStorage;
store.saveSettings({ smithBarKg: 7 });
assert.equal(store.getSettings().smithBarKg, 7);

console.log('store.test.mjs: OK');

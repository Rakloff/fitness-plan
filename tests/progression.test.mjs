import assert from 'node:assert/strict';
import { recommend } from '../js/progression.js';

const stack = { id: 'row', kind: 'stack', sets: 4, repMin: 8, repMax: 10, stepKg: 5 };
const smith = { id: 'press', kind: 'smith', sets: 4, repMin: 8, repMax: 10, stepKg: 10 };
const bw = { id: 'captain', kind: 'bodyweight', sets: 3, repMin: 10, repMax: 15, stepKg: 0 };
const normal = { n: 3, loadPct: 100 };

function sess(date, ex, weight, repsList) {
  return { id: date + '_d1', date, dayId: 'd1', exercises: { [ex.id]: {
    sets: repsList.map(r => ({ weight, reps: r, done: r !== null })), note: '' } } };
}

// калибровка
let r = recommend(stack, [], {}, normal);
assert.equal(r.status, 'calibrate');
assert.equal(r.weightKg, null);
assert.match(r.reason, /10 повторений/);
// неотмеченные подходы не считаются историей
r = recommend(stack, [{ date: '2026-10-01', exercises: { row: { sets: [{ weight: 30, reps: 10, done: false }] } } }], {}, normal);
assert.equal(r.status, 'calibrate');

// increase
r = recommend(stack, [sess('2026-10-01', stack, 40, [10, 10, 10, 10])], {}, normal);
assert.equal(r.status, 'increase');
assert.equal(r.weightKg, 45);
assert.deepEqual(r.targetReps, { min: 8, max: 10 });
assert.match(r.reason, /4×10/);
assert.match(r.reason, /5 кг/);

// не все подходы выполнены -> не increase
r = recommend(stack, [sess('2026-10-01', stack, 40, [10, 10, null, null])], {}, normal);
assert.equal(r.status, 'hold');

// hold
r = recommend(stack, [sess('2026-10-01', stack, 40, [10, 9, 9, 8])], {}, normal);
assert.equal(r.status, 'hold');
assert.equal(r.weightKg, 40);

// 1-й плохой -> hold, 2 подряд -> decrease
const bad1 = sess('2026-10-01', stack, 40, [7, 6, 6, 6]);
const bad2 = sess('2026-10-08', stack, 40, [7, 7, 6, 6]);
r = recommend(stack, [bad1], {}, normal);
assert.equal(r.status, 'hold');
assert.equal(r.weightKg, 40);
r = recommend(stack, [bad2, bad1], {}, normal);
assert.equal(r.status, 'decrease');
assert.equal(r.weightKg, 35);
// хорошая сессия между плохими сбрасывает счётчик
r = recommend(stack, [bad1, sess('2026-10-05', stack, 40, [9, 9, 9, 9]), bad2], {}, normal);
assert.equal(r.status, 'hold');
// вес не уходит ниже нуля
r = recommend(stack, [sess('2026-10-01', stack, 3, [5, 5, 5, 5]), sess('2026-10-08', stack, 3, [5, 5, 5, 5])], {}, normal);
assert.equal(r.status, 'decrease');
assert.equal(r.weightKg, 0);

// bodyweight: только повторения
r = recommend(bw, [sess('2026-10-01', bw, null, [15, 15, 15])], {}, normal);
assert.equal(r.status, 'increase');
assert.equal(r.weightKg, null);
assert.ok(r.targetReps.min >= 15);
r = recommend(bw, [sess('2026-10-01', bw, null, [12, 11, 10])], {}, normal);
assert.equal(r.status, 'hold');
assert.equal(r.weightKg, null);
r = recommend(bw, [], {}, normal);
assert.equal(r.status, 'calibrate');
assert.equal(r.weightKg, null);

// смит: шаг 10
r = recommend(smith, [sess('2026-10-01', smith, 20, [10, 10, 10, 10])], {}, normal);
assert.equal(r.weightKg, 30);
r = recommend(smith, [sess('2026-10-01', smith, 30, [6, 6, 5, 5]), sess('2026-10-08', smith, 30, [7, 6, 6, 5])].reverse(), {}, normal);
assert.equal(r.weightKg, 20);

// шаг из настроек
r = recommend(stack, [sess('2026-10-01', stack, 40, [10, 10, 10, 10])], { stepOverrides: { row: 2.5 } }, normal);
assert.equal(r.weightKg, 42.5);

// деload: 85% с округлением вниз до шага
r = recommend(stack, [sess('2026-10-01', stack, 40, [10, 10, 10, 10])], {}, { n: 8, loadPct: 85 });
assert.equal(r.weightKg, 30); // 34 -> 30
assert.equal(r.status, 'hold');
assert.match(r.reason, /разгрузки/);
r = recommend(smith, [sess('2026-10-01', smith, 30, [9, 9, 9, 9])], {}, { n: 8, loadPct: 85 });
assert.equal(r.weightKg, 20); // 25.5 -> 20
r = recommend(smith, [sess('2026-10-01', smith, 5, [9, 9, 9, 9])], {}, { n: 8, loadPct: 85 });
assert.equal(r.weightKg, 0);

console.log('progression.test.mjs: OK');

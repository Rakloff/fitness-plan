// Рекомендации весов: двойная прогрессия. Чистые функции, без DOM и localStorage.

const DEFAULT_STEP = { smith: 10, stack: 5, bodyweight: 0 };

export function stepFor(exercise, settings) {
  const o = settings && settings.stepOverrides && settings.stepOverrides[exercise.id];
  if (typeof o === 'number' && o >= 0) return o;
  if (typeof exercise.stepKg === 'number') return exercise.stepKg;
  return DEFAULT_STEP[exercise.kind] ?? 5;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

// Выполненные подходы упражнения в сессии (только done и с числом повторений).
function doneSets(session, exId) {
  const ex = session && session.exercises && session.exercises[exId];
  if (!ex || !Array.isArray(ex.sets)) return [];
  return ex.sets.filter(s => s && s.done && Number.isFinite(s.reps) && s.reps > 0);
}

function history(exercise, sessions) {
  const bw = exercise.kind === 'bodyweight';
  return (sessions || [])
    .map(s => ({ s, sets: doneSets(s, exercise.id) }))
    .filter(x => x.sets.length > 0 && (bw || x.sets.some(t => Number.isFinite(t.weight) && t.weight > 0)))
    .sort((a, b) => String(a.s.date).localeCompare(String(b.s.date)))
    .map(x => x.sets);
}

function isBad(sets, repMin) {
  const bad = sets.filter(t => t.reps < repMin).length;
  return bad * 2 >= sets.length; // хотя бы половина подходов ниже низа диапазона
}

function floorToStep(w, step) {
  return step > 0 ? Math.floor(w / step + 1e-9) * step : w;
}

export function recommend(exercise, sessions, settings, weekInfo) {
  const { repMin, repMax } = exercise;
  const bw = exercise.kind === 'bodyweight';
  const step = bw ? 0 : stepFor(exercise, settings);
  const range = { min: repMin, max: repMax };
  const hist = history(exercise, sessions);

  if (hist.length === 0) {
    return {
      status: 'calibrate',
      weightKg: null,
      targetReps: range,
      reason: bw
        ? `Первый раз: делай ${repMin}–${repMax} повторений, оставь 2–3 повтора в запасе.`
        : 'Первый раз: выбери вес, с которым легко делаются 10 повторений и остаются 2–3 в запасе.'
    };
  }

  const last = hist[hist.length - 1];
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  const plannedSets = exercise.sets || last.length;
  const n = last.length;
  const lastWeight = bw ? null : Math.max(...last.map(t => t.weight || 0));
  const allTop = n >= plannedSets && last.every(t => t.reps >= repMax);
  const bad = isBad(last, repMin);
  const prevBad = prev ? isBad(prev, repMin) : false;
  const lastText = last.every(t => t.reps === last[0].reps)
    ? `${n}×${last[0].reps}`
    : last.map(t => t.reps).join('/');

  let status = 'hold';
  let weight = lastWeight;
  let reason;
  let target = range;

  if (allTop) {
    status = 'increase';
    if (bw) {
      target = { min: repMax, max: repMax + 2 };
      reason = `Прошлый раз ${lastText} — отлично. Добавь повторения: ${target.min}–${target.max}.`;
    } else {
      weight = lastWeight + step;
      reason = `Прошлый раз ${lastText} — добавь ${fmt(step)} кг. Повторения снова с ${repMin}.`;
    }
  } else if (bad && prevBad) {
    if (bw) {
      reason = `Два раза подряд было тяжело (${lastText}). Не спеши: делай ${repMin}–${repMax} повторений с чистой техникой.`;
    } else {
      status = 'decrease';
      weight = Math.max(0, lastWeight - step);
      reason = `Два раза подряд не дошёл до ${repMin} повторений. Убери ${fmt(step)} кг и набери повторения заново.`;
    }
  } else if (bad) {
    reason = bw
      ? `Прошлый раз ${lastText} — маловато. Повтори и постарайся сделать хотя бы ${repMin}.`
      : `Прошлый раз ${lastText} — не хватило до ${repMin} повторений. Оставь ${fmt(lastWeight)} кг; если снова не выйдет, вес снизим.`;
  } else {
    reason = bw
      ? `Прошлый раз ${lastText}. Добирай повторения до ${repMax}.`
      : `Прошлый раз ${lastText} с ${fmt(lastWeight)} кг. Оставь вес и добирай повторения до ${repMax} в каждом подходе.`;
  }

  // Неделя разгрузки: берём прошлый рабочий вес × loadPct, вниз до шага; прибавки нет.
  const pct = weekInfo && Number.isFinite(weekInfo.loadPct) ? weekInfo.loadPct : 100;
  if (pct < 100 && !bw) {
    const deload = Math.max(0, floorToStep(lastWeight * pct / 100, step));
    weight = deload;
    status = 'hold';
    target = range;
    reason = `Неделя разгрузки: ${pct}% от прошлого веса (${fmt(lastWeight)} кг) — ставь ${fmt(deload)} кг и работай легко.`;
  } else if (pct < 100 && bw) {
    reason = `Неделя разгрузки: делай чуть меньше повторений и оставляй запас. ${reason}`;
  }

  if (weight !== null) weight = Math.max(0, weight);
  return { status, weightKg: weight, targetReps: target, reason };
}

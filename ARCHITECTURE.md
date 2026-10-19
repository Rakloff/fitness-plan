# Архитектура (контракт для всех модулей)

Источники правды: `../ТЗ.md` и `../контекст.md`. Здесь только интерфейсы. Чистый HTML/CSS/JS, ES-модули, **без сборки, без CDN, без npm-зависимостей в рантайме** (всё работает офлайн). UI-язык: русский. Целевая ширина: 344 px (внешний экран Z Fold 5), без горизонтального скролла, тач-цели ≥ 48 px, чёрный OLED фон.

## Файлы и владельцы
```
app/
  index.html, manifest.webmanifest, sw.js, icons/      (агент C)
  css/style.css                                         (агент C)
  js/app.js        роутер вкладок, монтирование экранов (агент C)
  js/charts.js     SVG-графики                          (агент C)
  js/dom.js        helper h(tag, attrs, ...children)    (агент C)
  js/data/program.js     программа, 8-недельный план    (агент A)
  js/data/techniques.js  техника упражнений             (агент A)
  js/store.js            хранение, бэкап, экспорт .md   (агент B)
  js/progression.js      рекомендации весов             (агент B)
  js/ui/workout.js, progress.js, plan.js, inbody.js, settings.js   (волна 2)
  tests/*.mjs      node-тесты логики                    (агент B)
```
Каждый экран экспортирует `export function mount(rootEl, ctx)`; `ctx = {store, program, techniques, progression, charts, h}`.

## data/program.js
```js
export const PROGRAM = {
  days: [ { id:'d1', title:'День 1', subtitle:'Смит / грудь / спина / ноги / пресс', optional:false, weekdays:[2],
            blocks:[ { id:'d1a', title:'Блок А', exercises:[ EXERCISE, ... ] } ] }, ... d2, d3 ],
  weeks: [ { n:1, phase:'Адаптация', loadNote:'...', repsInReserve:3, loadPct:100 }, ... 8 ],
  warmup: { minutes:10, note:'Беговая дорожка или орбитрек' }
};
// EXERCISE:
{ id:'smith-incline-press', nameRu:'Жим в Смите на наклонной скамье', nameEn:'Smith machine incline bench press',
  kind:'smith'|'stack'|'bodyweight', sets:4, repMin:8, repMax:10, restSec:60, stepKg:10, focus:'...',
  youtubeQuery:'smith machine incline bench press form' }
```
`stepKg`: для `smith` = 10 (блины по 5 кг на оба борта); для `stack` = 5 по умолчанию; для `bodyweight` = 0 (прогрессия только повторениями). Дни: d1 (вт), d2 (чт), d3 (опц., сб/вс). Состав упражнений — по `ТЗ.md` п.1. Время основной части каждого дня ≤ 40 мин (формула: подходы × 40 с + (подходы − 1) × restSec + 90 с на переход). **Суперсеты, круги (поле ounds) и таймер отдыха отменены по решению пользователя: подходы одного упражнения идут подряд, без таймера; estSec и ctx.rest — только справочный текст / удалены.** Settings.vibrate/sound остались в хранилище для совместимости, в UI не показываются. Экран «Тренировка»: дата тренировки меняется вручную (перенос сессии), день по умолчанию — первый несделанный базовый день текущей недели (пн–вс).

## data/techniques.js
```js
export const TECHNIQUES = { [exerciseId]: { steps:[{title,text}], mistakes:[...], tip:'...', svg:'<svg ...>' } }
```
Для каждого упражнения из program.js. SVG: схематичные 3 кадра (старт/середина/финиш), цвета через `currentColor` и CSS-переменные, viewBox ~ 0 0 300 120.

## store.js (localStorage, ключ `fp:v1`, JSON)
```js
// формы данных
Session  = { id:'YYYY-MM-DD_dayId', date:'YYYY-MM-DD', dayId, weekN, warmupDone:bool, startedAt, finishedAt|null,
             exercises:{ [exId]: { sets:[{weight:number|null, reps:number|null, done:bool}], note:'' } } }
// weight = то, что пользователь ВЫСТАВИЛ на тренажёре (для smith — суммарно блины на оба борта, без грифа)
Settings = { smithBarKg:0, vibrate:true, sound:true, wakeLock:true, planStartDate:'YYYY-MM-DD' }
Inbody   = { date, weightKg, fatPct, fatKg, smmKg, bmr, visceral|null }
// API (синхронный, без Promise)
getSession(date, dayId) -> Session|null;  saveSession(session);  listSessions() -> Session[] (по дате);  deleteSession(id)
getSettings() -> Settings (с дефолтами);  saveSettings(patch)
listInbody() -> Inbody[];  addInbody(rec);  deleteInbody(date)
exportBackup() -> string (JSON);  importBackup(jsonString) -> {ok, error?}
sessionToMarkdown(session, program) -> string   // метаданные даты, таблица «План vs Факт», заметки
effectiveWeight(entered, exercise, settings) -> number   // entered + (kind==='smith' ? smithBarKg : 0)
```
Первый запуск: `planStartDate` = ближайший понедельник или сегодня; seed InBody: 61.5 кг, 9.7 %, 6.0 кг, 31.3 кг, 1570 (дата 2026-10-19).

## progression.js (чистые функции, без DOM и localStorage)
```js
recommend(exercise, sessions, settings, weekInfo) -> { status:'calibrate'|'increase'|'hold'|'decrease',
  weightKg:number|null, targetReps:{min,max}, reason:'...ru, 1–2 фразы' }
```
Правила (двойная прогрессия): нет истории → `calibrate` (вес null, подсказка «выбери вес на 10 повторений с запасом 2–3»). Все рабочие подходы последней сессии дошли до `repMax` → `increase` на `stepKg`. Не дошёл до `repMin` хотя бы в половине подходов: 1-й раз `hold`, 2 сессии подряд → `decrease` на `stepKg`. Иначе `hold`. На неделе деload (loadPct<100) вес × loadPct с округлением вниз до шага. Для `bodyweight` меняются только повторения. Учитывать только done-подходы.

## charts.js
```js
lineChart(el, {points:[{x:Date|string,y:number}], yLabel, color}); barChart(...)
```
Чистый SVG, адаптивный по ширине контейнера, подписи ≥ 11 px.

## Хранилище стилей
CSS-переменные в `:root`: `--bg:#000; --fg:#f2f2f2; --muted:#8a8a8a; --accent:#3ddc84; --card:#111; --line:#222; --danger:#ff5252`. Без внешних шрифтов.

// Программа тренировок и 8-недельный план. Контракт: app/ARCHITECTURE.md.
// weekdays: нумерация JS Date.getDay() (0 = вс, 2 = вт, 4 = чт, 6 = сб).
//
// Допущения расчёта времени (основная часть, без разминки 10 мин). Суперсетов и кругов нет:
//   все подходы одного упражнения идут подряд, затем переход к следующему тренажёру.
//   время упражнения = подходы x 40 с + (подходы - 1) x restSec (после последнего подхода отдыха нет)
//                      + 90 с на переход к тренажёру и сборку веса.

const triceps = {
  id: 'triceps-pushdown', nameRu: 'Разгибания на трицепс на верхнем блоке (канат)', nameEn: 'Cable rope triceps pushdown',
  kind: 'stack', sets: 3, repMin: 10, repMax: 12, restSec: 45, stepKg: 5,
  focus: 'Локти прижаты к бокам, разгибай руки вниз до конца и разведи концы каната внизу.',
  youtubeQuery: 'cable rope triceps pushdown form',
};

const biceps = {
  id: 'cable-biceps-curl', nameRu: 'Сгибания на бицепс с нижнего блока', nameEn: 'Cable biceps curl',
  kind: 'stack', sets: 3, repMin: 10, repMax: 12, restSec: 60, stepKg: 5,
  focus: 'Локти неподвижны у корпуса, без раскачки: работает только бицепс.',
  youtubeQuery: 'low cable biceps curl form',
};

const pecDeck = {
  id: 'pec-deck-fly', nameRu: 'Сведения рук в тренажёре «Бабочка»', nameEn: 'Pec deck machine fly',
  kind: 'stack', sets: 3, repMin: 12, repMax: 15, restSec: 45, stepKg: 5,
  focus: 'Грудь: сводишь рукояти перед собой, в конце пауза 1 с и сжатие груди.',
  youtubeQuery: 'pec deck machine fly form',
};

export const PROGRAM = {
  days: [
    // ДЕНЬ 1 (секунды: подходы x 40 + (подходы - 1) x отдых + 90 переход):
    //  Жим в Смите 4x: 160 + 180 + 90 = 430;  Тяга верхнего блока 4x: 160 + 225 + 90 = 475
    //  Жим ногами 3x: 120 + 90 + 90 = 300;  Трицепс 3x: 300
    //  Капитанский стул 3x (отдых 30): 120 + 60 + 90 = 270;  Боковые скручивания 3x: 300
    //  Итого 2075 с = ~34,6 мин (<= 40), запас ~5 мин.
    {
      id: 'd1', title: 'День 1', subtitle: 'Смит / грудь / спина / ноги / пресс', optional: false, weekdays: [2],
      blocks: [
        { id: 'd1a', title: 'Блок А', exercises: [
          { id: 'smith-incline-press', nameRu: 'Жим в Смите на наклонной скамье (30°)', nameEn: 'Smith machine incline bench press',
            kind: 'smith', sets: 4, repMin: 8, repMax: 10, restSec: 60, stepKg: 10,
            focus: 'Верх груди: опускай гриф 2–3 с к ключицам, выжимай вверх уверенно.',
            youtubeQuery: 'smith machine incline bench press form' },
          { id: 'lat-pulldown', nameRu: 'Тяга верхнего блока к груди', nameEn: 'Lat pulldown',
            kind: 'stack', sets: 4, repMin: 8, repMax: 10, restSec: 75, stepKg: 5,
            focus: 'Широчайшие: широкий хват, тяни локти вниз и сведи лопатки внизу.',
            youtubeQuery: 'lat pulldown form beginner' },
        ] },
        { id: 'd1b', title: 'Блок Б', exercises: [
          { id: 'leg-press', nameRu: 'Жим ногами в тренажёре', nameEn: 'Leg press',
            kind: 'stack', sets: 3, repMin: 10, repMax: 12, restSec: 45, stepKg: 10,
            focus: 'Стопы на ширине плеч в середине платформы, колени в верхней точке не блокируй.',
            youtubeQuery: 'leg press machine form' },
          { ...triceps },
        ] },
        { id: 'd1c', title: 'Блок В', exercises: [
          { id: 'captain-chair-knee-raise', nameRu: 'Подъём коленей в «капитанском стуле»', nameEn: 'Captain\'s chair knee raise',
            kind: 'bodyweight', sets: 3, repMin: 10, repMax: 12, restSec: 30, stepKg: 0,
            focus: 'Нижний пресс: на выдохе подкручивай таз вверх к рёбрам, без раскачки.',
            youtubeQuery: 'captain\'s chair knee raise form' },
          { id: 'cable-side-crunch', nameRu: 'Боковые скручивания на блоке', nameEn: 'Standing cable side crunch',
            kind: 'stack', sets: 3, repMin: 12, repMax: 15, restSec: 45, stepKg: 5,
            focus: 'Косые мышцы: наклон строго вбок за счёт пресса, повторы на каждую сторону.',
            youtubeQuery: 'standing cable side crunch form' },
        ] },
      ],
    },

    // ДЕНЬ 2:
    //  Жим от груди 4x: 430;  Горизонтальная тяга 4x: 475
    //  Сгибание ног 3x (отдых 40): 120 + 80 + 90 = 290;  Бабочка 3x: 300;  Бицепс 3x (отдых 60): 120 + 120 + 90 = 330
    //  «Молитва» 3x (отдых 50): 120 + 100 + 90 = 310
    //  Итого 2135 с = ~35,6 мин (<= 40), запас ~4 мин.
    {
      id: 'd2', title: 'День 2', subtitle: 'Грудь / спина / задняя цепь / бицепс / пресс', optional: false, weekdays: [4],
      blocks: [
        { id: 'd2a', title: 'Блок А', exercises: [
          { id: 'chest-press-machine', nameRu: 'Жим от груди в тренажёре', nameEn: 'Chest press machine',
            kind: 'stack', sets: 4, repMin: 8, repMax: 10, restSec: 60, stepKg: 5,
            focus: 'Рукояти на уровне середины груди, выжимай вперёд без отрыва спины от спинки.',
            youtubeQuery: 'chest press machine form' },
          { id: 'seated-cable-row', nameRu: 'Горизонтальная тяга к поясу', nameEn: 'Seated cable row',
            kind: 'stack', sets: 4, repMin: 10, repMax: 12, restSec: 75, stepKg: 5,
            focus: 'Спина ровная, тяни рукоять к животу и сведи лопатки, не раскачивайся корпусом.',
            youtubeQuery: 'seated cable row form' },
        ] },
        { id: 'd2b', title: 'Блок Б', exercises: [
          { id: 'leg-curl', nameRu: 'Сгибание ног в тренажёре', nameEn: 'Seated leg curl',
            kind: 'stack', sets: 3, repMin: 10, repMax: 12, restSec: 40, stepKg: 5,
            focus: 'Задняя поверхность бедра: сгибай плавно, назад возвращай медленно.',
            youtubeQuery: 'seated leg curl machine form' },
          { ...pecDeck },
          { ...biceps },
        ] },
        { id: 'd2c', title: 'Блок В', exercises: [
          { id: 'cable-crunch', nameRu: '«Молитва» на блоке (на коленях)', nameEn: 'Kneeling cable crunch',
            kind: 'stack', sets: 3, repMin: 12, repMax: 15, restSec: 50, stepKg: 5,
            focus: 'Верх пресса: скручивай корпус, сжимая живот, бёдра остаются неподвижными.',
            youtubeQuery: 'kneeling cable crunch form' },
        ] },
      ],
    },

    // ДЕНЬ 3 (опционально):
    //  Face pulls 3x (отдых 40): 120 + 80 + 90 = 290;  Махи в стороны 2x: 80 + 45 + 90 = 215
    //  Трицепс 3x: 300;  Бицепс 3x: 330;  Бабочка 3x: 300;  «Дровосек» 3x: 300
    //  Итого 1735 с = ~28,9 мин (<= 40).
    {
      id: 'd3', title: 'День 3', subtitle: 'Детали: плечи / руки / грудь / кор (по самочувствию)', optional: true, weekdays: [6, 0],
      blocks: [
        { id: 'd3a', title: 'Блок А', exercises: [
          { id: 'face-pull', nameRu: 'Тяга каната к лицу (face pulls)', nameEn: 'Cable face pull',
            kind: 'stack', sets: 3, repMin: 12, repMax: 15, restSec: 40, stepKg: 5,
            focus: 'Задняя дельта и осанка: тяни канат к лицу, локти высоко и разведены в стороны.',
            youtubeQuery: 'cable face pull form' },
          { id: 'cable-lateral-raise', nameRu: 'Лёгкие махи в стороны на блоке', nameEn: 'Cable lateral raise',
            kind: 'stack', sets: 2, repMin: 12, repMax: 15, restSec: 45, stepKg: 5,
            focus: 'Лёгкий вес, поднимай руку до уровня плеча, без рывка. Повторы на каждую руку.',
            youtubeQuery: 'cable lateral raise form' },
        ] },
        { id: 'd3b', title: 'Блок Б', exercises: [
          { ...triceps },
          { ...biceps },
        ] },
        { id: 'd3c', title: 'Блок В', exercises: [
          { ...pecDeck },
          { id: 'cable-woodchopper', nameRu: '«Дровосек» на блоке', nameEn: 'Cable woodchopper',
            kind: 'stack', sets: 3, repMin: 12, repMax: 12, restSec: 45, stepKg: 5,
            focus: 'Косые и кор: вращай корпус по диагонали сверху вниз, руки почти прямые.',
            youtubeQuery: 'cable woodchopper form' },
        ] },
      ],
    },
  ],

  weeks: [
    { n: 1, phase: 'Адаптация', loadNote: 'Подбери рабочие веса: легко 10 повторений, остаётся запас 2–3. Учи технику, без отказа.', repsInReserve: 3, loadPct: 100, volumePct: 100 },
    { n: 2, phase: 'Адаптация', loadNote: 'Закрепи технику и уточни веса. Запас 2–3 повторения, без отказа.', repsInReserve: 3, loadPct: 100, volumePct: 100 },
    { n: 3, phase: 'Прогрессия', loadNote: 'Двойная прогрессия: дошёл до верха диапазона во всех подходах, добавь вес.', repsInReserve: 2, loadPct: 100, volumePct: 100 },
    { n: 4, phase: 'Прогрессия', loadNote: 'Продолжай прогрессию, запас около 2 повторений.', repsInReserve: 2, loadPct: 100, volumePct: 100 },
    { n: 5, phase: 'Прогрессия', loadNote: 'Продолжай прогрессию, следи за чистой техникой.', repsInReserve: 2, loadPct: 100, volumePct: 100 },
    { n: 6, phase: 'Прогрессия', loadNote: 'Последняя неделя основной прогрессии, запас 1–2 повторения.', repsInReserve: 1, loadPct: 100, volumePct: 100 },
    { n: 7, phase: 'Пик', loadNote: 'Пик нагрузки, если самочувствие хорошее. Запас около 1 повторения; при усталости оставь вес прежним.', repsInReserve: 1, loadPct: 100, volumePct: 100 },
    { n: 8, phase: 'Деload', loadNote: 'Разгрузка: веса −15 %, подходов примерно на 30 % меньше. После недели сделай замер InBody и пересмотри программу.', repsInReserve: 3, loadPct: 85, volumePct: 70 },
  ],

  warmup: { minutes: 10, note: 'Беговая дорожка или орбитрек, лёгкий темп. В основные 40 минут не входит.' },
};

// Оборудование зала DDX, ТЦ «Орион» (Бабушкинская, Москва).
// Подтверждено пользователем (ТЗ.md п.7): зал и адрес; Смит с блинами от 5 кг (мелких нет);
//   блочные тренажёры с пластинами и фиксатором, шаг равен одной пластине, добавочной пластины нет.
// НЕ подтверждено (интернет-поиск не выполнялся, фактов не выдумываю): наличие в этом зале конкретно
//   жима от груди, «бабочки», сгибания ног сидя, капитанского стула, скамьи с наклоном 30° для Смита,
//   кроссовера с канатом и верхним/нижним блоком. Если чего-то нет, замени упражнение
//   (например, «бабочка» на сведения в кроссовере, сгибание ног сидя на лёжа).

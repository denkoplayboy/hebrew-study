// Игровое поле «Шук»: кольцо из 20 клеток по мотивам монополии.
// Бросок кубика стоит росы (зарабатывается только на уроках). Участки покупаются, на них строятся здания —
// у каждого три уровня, и каждый уровень открывает что-то полезное для учёбы или оформления.

export type CellKind = "start" | "plot" | "mazal" | "ulpan" | "misrad" | "shabbat" | "arnona" | "shuk" | "airport";

export interface District {
  id: string;
  name: string;
  he: string;
  color: string;
}

export const DISTRICTS: District[] = [
  { id: "tlv", name: "Тель-Авив", he: "תל אביב", color: "#d99a52" },
  { id: "haifa", name: "Хайфа", he: "חיפה", color: "#5f9ea6" },
  { id: "galil", name: "Галилея", he: "הגליל", color: "#7fa365" },
  { id: "negev", name: "Негев", he: "הנגב", color: "#c27a55" },
  { id: "jlm", name: "Иерусалим", he: "ירושלים", color: "#b39a5c" },
];

export type BuildingKind = "design" | "premium" | "activity" | "lesson" | "ai";

export interface BuildingDef {
  id: string;
  name: string;
  he: string;
  icon: string; // иконка lucide
  kind: BuildingKind;
  pitch: string;
  levels: [string, string, string]; // что даёт каждый уровень
}

export const BUILDINGS: Record<string, BuildingDef> = {
  typography: {
    id: "typography",
    name: "Типография",
    he: "דְּפוּס",
    icon: "Type",
    kind: "design",
    pitch: "Шрифты для иврита — для крупных слов, примеров и карточек.",
    levels: ["Шрифт «Давид» — классика израильских книг", "Шрифты «Ното Серив» и «Ното Санс» — чёткие, с аккуратными огласовками", "Шрифты «Алеф» и «Мирьям» — для ценителей"],
  },
  gallery: {
    id: "gallery",
    name: "Галерея",
    he: "גָּלֶרְיָה",
    icon: "Palette",
    kind: "design",
    pitch: "Цветовые темы сада — акцентный цвет всего приложения.",
    levels: ["Темы «Оливковая роща» и «Средиземное море»", "Темы «Терракота Негева» и «Лаванда Галилеи»", "Темы «Гранатовый сад» и «Ночной Иерусалим»"],
  },
  bank: {
    id: "bank",
    name: "Банк",
    he: "בַּנְק",
    icon: "Landmark",
    kind: "premium",
    pitch: "Привилегии в самой игре: броски дешевле, бонус Старта больше.",
    levels: ["Каждый бросок на 2 росы дешевле", "Ещё −1 к цене броска и +5 росы за проход Старта", "Один бесплатный бросок каждый день"],
  },
  observatory: {
    id: "observatory",
    name: "Обсерватория",
    he: "מִצְפֶּה כּוֹכָבִים",
    icon: "Telescope",
    kind: "premium",
    pitch: "Премиум-статистика: видно будущее своей памяти.",
    levels: [
      "Прогноз нагрузки: сколько повторений ждёт в каждый из 14 дней",
      "Режим «На грани»: слова, которые вот-вот начнут увядать — успеть до жажды",
      "Экспорт словаря в CSV и TSV для Anki",
    ],
  },
  studio: {
    id: "studio",
    name: "Студия «Коль»",
    he: "אוּלְפַּן קוֹל",
    icon: "Headphones",
    kind: "activity",
    pitch: "Диктант: слышишь предложение из примеров своих слов — записываешь целиком.",
    levels: ["Открывает режим «Диктант»", "+1 роса за каждый диктант слово в слово", "+2 росы за диктант слово в слово и рента ×1.5"],
  },
  stadium: {
    id: "stadium",
    name: "Стадион",
    he: "אִצְטַדְיוֹן",
    icon: "Zap",
    kind: "activity",
    pitch: "Блиц: знакомые слова на скорость, рекорды.",
    levels: ["Открывает «Блиц» на 60 секунд", "Марафон на 120 секунд и дневной лимит росы за блиц ×1.5", "Дневной лимит росы за блиц ×2 и двойной бонус за рекорд"],
  },
  greenhouse: {
    id: "greenhouse",
    name: "Оранжерея",
    he: "חֲמָמָה",
    icon: "Flower2",
    kind: "design",
    pitch: "Новые виды деревьев для сада: слова растут в другие растения.",
    levels: ["Сад олив", "Сад финиковых пальм", "Гранатовый сад — с плодами на укоренившихся словах"],
  },
  cafe: {
    id: "cafe",
    name: "Кафе «Ход»",
    he: "בֵּית קָפֶה",
    icon: "Coffee",
    kind: "lesson",
    pitch: "Торгует эффектами для уроков. Купленный эффект действует в любой тренировке.",
    levels: [
      "«Двойная роса» — 20 минут вся роса за повторения ×2",
      "«Подсказка без штрафа» и «Вторая попытка» — жетоны для упражнений с вводом",
      "«Золотой час» — 60 минут +1 роса за каждый верный ответ; все эффекты на 20% дешевле",
    ],
  },
  storyteller: {
    id: "storyteller",
    name: "Кафе «Сиппур»",
    he: "סִפּוּר",
    icon: "BookHeart",
    kind: "ai",
    pitch: "ИИ пишет короткий рассказ из слов, которые пора повторить, с вопросами на понимание.",
    levels: ["Сказка за 40 росы", "Сказка за 30 росы", "Сказка за 20 росы"],
  },
  archive: {
    id: "archive",
    name: "Архив корней",
    he: "אַרְכִיּוֹן",
    icon: "Library",
    kind: "ai",
    pitch: "ИИ подбирает слова: пакет по теме или вся семья одного корня.",
    levels: ["Пакет слов по теме за 30 росы", "Семья корня за 25 росы", "Всё вдвое дешевле"],
  },
};

export interface Cell {
  i: number;
  kind: CellKind;
  name: string;
  short: string;
  he: string;
  district?: string;
  price?: number;
  building?: string;
  hint: string;
}

export const CELLS: Cell[] = [
  { i: 0, kind: "start", name: "Тахана мерказит", short: "Старт", he: "תחנה מרכזית", hint: "Проход — +10 росы, остановка точно здесь — +20." },
  { i: 1, kind: "plot", name: "Яффо", short: "Яффо", he: "יפו", district: "tlv", price: 40, building: "typography", hint: "" },
  { i: 2, kind: "mazal", name: "Мазаль", short: "Мазаль", he: "מזל", hint: "Карта удачи: подарок, вопрос со ставкой или маленькая неприятность." },
  { i: 3, kind: "plot", name: "Ротшильд", short: "Ротшильд", he: "רוטשילד", district: "tlv", price: 50, building: "gallery", hint: "" },
  { i: 4, kind: "ulpan", name: "Ульпан", short: "Ульпан", he: "אולפן", hint: "Три быстрых вопроса по твоим словам: +4 росы за каждый верный." },
  {
    i: 5,
    kind: "misrad",
    name: "Мисрад а-пним",
    short: "МВД",
    he: "משרד הפנים",
    hint: "Бюрократия: заплати 12 росы — или ответь на вопрос по глаголам и пройди бесплатно.",
  },
  { i: 6, kind: "plot", name: "Адар", short: "Адар", he: "הדר", district: "haifa", price: 60, building: "bank", hint: "" },
  { i: 7, kind: "plot", name: "Кармель", short: "Кармель", he: "הכרמל", district: "haifa", price: 70, building: "observatory", hint: "" },
  { i: 8, kind: "mazal", name: "Мазаль", short: "Мазаль", he: "מזל", hint: "Карта удачи." },
  { i: 9, kind: "plot", name: "Цфат", short: "Цфат", he: "צפת", district: "galil", price: 60, building: "studio", hint: "" },
  { i: 10, kind: "shabbat", name: "Шабат", short: "Шабат", he: "שבת", hint: "Шабат шалом: следующий бросок бесплатный." },
  { i: 11, kind: "plot", name: "Тверия", short: "Тверия", he: "טבריה", district: "galil", price: 70, building: "stadium", hint: "" },
  { i: 12, kind: "arnona", name: "Арнона", short: "Арнона", he: "ארנונה", hint: "Муниципальный налог: 6 росы." },
  { i: 13, kind: "plot", name: "Мицпе-Рамон", short: "Рамон", he: "מצפה רמון", district: "negev", price: 80, building: "greenhouse", hint: "" },
  { i: 14, kind: "plot", name: "Беэр-Шева", short: "Б.-Шева", he: "באר שבע", district: "negev", price: 90, building: "cafe", hint: "" },
  { i: 15, kind: "shuk", name: "Махане Иегуда", short: "Шук", he: "מחנה יהודה", hint: "Рынок: выбери один из трёх товаров дня — бесплатно." },
  { i: 16, kind: "plot", name: "Мамила", short: "Мамила", he: "ממילא", district: "jlm", price: 100, building: "storyteller", hint: "" },
  { i: 17, kind: "mazal", name: "Мазаль", short: "Мазаль", he: "מזל", hint: "Карта удачи." },
  { i: 18, kind: "plot", name: "Старый город", short: "Ст. город", he: "העיר העתיקה", district: "jlm", price: 110, building: "archive", hint: "" },
  { i: 19, kind: "airport", name: "Бен-Гурион", short: "Аэропорт", he: "נתב״ג", hint: "Лети на любую клетку за 8 росы — или оставайся." },
];

/** Цена улучшения здания до уровня 1..3. */
export function upgradePrice(plotPrice: number, toLevel: number) {
  return Math.round(plotPrice * [0, 1.2, 2, 3][toLevel]);
}

/** Рента при остановке на своём участке. */
export const RENT = [3, 8, 14, 22];

/** Позиция клетки на сетке 6×6 (по периметру, по часовой стрелке от левого нижнего угла). */
export function cellGridPos(i: number): { row: number; col: number } {
  // 0 — левый нижний угол; 0..5 вверх по левому краю? Удобнее: 0 — правый нижний, идём влево (как в монополии).
  if (i <= 5) return { row: 6, col: 6 - i }; // нижний ряд: справа налево
  if (i <= 10) return { row: 6 - (i - 5), col: 1 }; // левый столбец: снизу вверх
  if (i <= 15) return { row: 1, col: 1 + (i - 10) }; // верхний ряд: слева направо
  return { row: 1 + (i - 15), col: 6 }; // правый столбец: сверху вниз
}

// Эффекты для уроков (продаются в Кафе «Ход»)
export const EFFECTS = [
  { id: "dew_x2", name: "Двойная роса", hint: "20 минут вся роса за повторения ×2", price: 25, level: 1, minutes: 20 },
  { id: "hint", name: "Подсказка без штрафа ×3", hint: "Подсказка в «Вспомни сам» и «Контексте» не снижает оценку", price: 15, level: 2, uses: 3 },
  { id: "retry", name: "Вторая попытка ×3", hint: "После ошибки в упражнении с вводом можно попробовать ещё раз", price: 20, level: 2, uses: 3 },
  { id: "golden", name: "Золотой час", hint: "60 минут +1 роса за каждый верный ответ", price: 30, level: 3, minutes: 60 },
] as const;

export const HE_FONTS = [
  { id: "frank", name: "Франк Рюль", family: "Frank Ruhl Libre", level: 0 },
  { id: "david", name: "Давид", family: "David Libre", level: 1 },
  { id: "noto-serif", name: "Ното Серив", family: "Noto Serif Hebrew", level: 2 },
  { id: "noto-sans", name: "Ното Санс", family: "Noto Sans Hebrew", level: 2 },
  { id: "alef", name: "Алеф", family: "Alef", level: 3 },
  { id: "miriam", name: "Мирьям", family: "Miriam Libre", level: 3 },
];

export const ACCENTS = [
  { id: "sage", name: "Шалфей", light: "#5f7a58", level: 0 },
  { id: "olive", name: "Оливковая роща", light: "#6f6a3c", level: 1 },
  { id: "sea", name: "Средиземное море", light: "#3f7390", level: 1 },
  { id: "negev", name: "Терракота Негева", light: "#a8623f", level: 2 },
  { id: "lavender", name: "Лаванда Галилеи", light: "#77679a", level: 2 },
  { id: "rimon", name: "Гранатовый сад", light: "#9c3d4a", level: 3 },
  { id: "night", name: "Ночной Иерусалим", light: "#8a6d2f", level: 3 },
];

export const PLANT_STYLES = [
  { id: "classic", name: "Лиственный сад", level: 0 },
  { id: "olive", name: "Оливы", level: 1 },
  { id: "palm", name: "Финиковые пальмы", level: 2 },
  { id: "rimon", name: "Гранаты", level: 3 },
];

/** Что открыто постройками — вычисляется на сервере, клиент только показывает. */
export interface Perks {
  levels: Record<string, number>; // building id → уровень (0 — участок без здания или не куплен)
  fonts: string[];
  accents: string[];
  plants: string[];
  rollDiscount: number;
  startBonus: number;
  freeDailyRoll: boolean;
  forecast: boolean;
  edgeMode: boolean;
  csvExport: boolean;
  dictation: boolean;
  dictationBonus: number;
  blitz: boolean;
  blitzMarathon: boolean;
  blitzCapMult: number;
  effects: string[]; // какие эффекты продаёт кафе
  effectDiscount: number;
  storyPrice: number | null;
  seedsPrice: number | null;
  rootPrice: number | null;
}

export interface ActiveEffects {
  dew_x2_until: number;
  golden_until: number;
  hint: number;
  retry: number;
}

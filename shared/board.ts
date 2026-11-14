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
  port: {
    id: "port",
    name: "Порт Яффо",
    he: "נְמַל יָפוֹ",
    icon: "Anchor",
    kind: "premium",
    pitch: "Навсегда увеличивает всю росу, которую ты зарабатываешь на уроках. Лучшая долгосрочная инвестиция поля.",
    levels: ["+10% росы за все уроки — навсегда", "+20% росы за все уроки", "+30% росы за все уроки"],
  },
  design: {
    id: "design",
    name: "Дизайн-студия",
    he: "סְטוּדְיוֹ לְעִיצוּב",
    icon: "Palette",
    kind: "design",
    pitch: "Весь внешний вид сада: цветовые темы, шрифты иврита, породы деревьев.",
    levels: [
      "Темы «Оливковая роща» и «Средиземное море», шрифт «Давид», сад олив",
      "Темы «Терракота Негева» и «Лаванда», шрифты «Ното», сад финиковых пальм",
      "«Гранатовый сад» и «Ночной Иерусалим», шрифты «Алеф» и «Мирьям», гранаты с плодами, листопад при росте слов",
    ],
  },
  black: {
    id: "black",
    name: "Чёрный рынок",
    he: "שׁוּק שָׁחוֹר",
    icon: "Skull",
    kind: "lesson",
    pitch: "Мощные и нечестные эффекты для уроков — то, чего не продаст ни одно приличное кафе.",
    levels: [
      "«Пропуск» — пропустить упражнение без последствий; «Тройная роса» на 10 минут",
      "«Щит» — ошибка не засчитывается; «Сундук финиша» — сутки за каждый законченный урок сундук с призом",
      "«Джекпот» — роса за следующий законченный урок ×3; все товары на 25% дешевле",
    ],
  },
  girl: {
    id: "girl",
    name: "Кафе на Кармеле",
    he: "קָפֶה בַּכַּרְמֶל",
    icon: "Heart",
    kind: "ai",
    pitch:
      "За столиком у окна сидит незнакомая девушка. Можно заговорить с ней на иврите, дарить подарки, отдавать свою росу — и просить о чём угодно. Цену за просьбу она назначает сама, а после оплаты выполняет.",
    levels: [
      "Знакомство: разговоры, подарки, одна просьба в день",
      "Две просьбы в день, она уступает в цене 10%",
      "Три просьбы в день, скидка 20%, а когда вы подружитесь — её маленький подарок каждый день",
    ],
  },
  wheel: {
    id: "wheel",
    name: "Колесо Цфата",
    he: "גַּלְגַּל הַמַּזָּל",
    icon: "Disc3",
    kind: "activity",
    pitch: "Колесо фортуны: крутишь — выпадает приз, отвечаешь на вопрос по своим словам — забираешь его целиком.",
    levels: ["Один бесплатный оборот в день", "Два оборота в день и призы крупнее", "Три оборота в день и сектор «Джекпот» на 100 росы"],
  },
  arena: {
    id: "arena",
    name: "Арена Тверии",
    he: "זִירָה",
    icon: "Swords",
    kind: "activity",
    pitch: "Новые режимы тренировок: скорость и слух.",
    levels: ["Режим «Блиц» — знакомые слова на скорость, рекорды", "Режим «Диктант» — пишешь на слух целые предложения", "Марафон на 120 секунд, лимит росы за блиц ×2, двойной бонус за рекорд"],
  },
  hostel: {
    id: "hostel",
    name: "Хостел под звёздами",
    he: "אַכְסַנְיָה",
    icon: "BedDouble",
    kind: "premium",
    pitch: "Туристы платят каждый день — но приезжают только в живой сад: доход приходит после первого законченного урока дня.",
    levels: ["+8 росы каждый день после первого урока", "+15 росы каждый день", "+25 росы каждый день и шанс 30% на бесплатный бросок"],
  },
  cafe: {
    id: "cafe",
    name: "Кафе «Ход»",
    he: "בֵּית קָפֶה",
    icon: "Coffee",
    kind: "lesson",
    pitch: "Честные эффекты для уроков. А на третьем уровне — бесплатный утренний кофе.",
    levels: [
      "«Двойная роса» — 20 минут вся роса за повторения ×2",
      "Жетоны «Подсказка без штрафа» и «Вторая попытка»",
      "«Золотой час» и утренний кофе: первый урок дня сам включает двойную росу на 20 минут; всё на 20% дешевле",
    ],
  },
  storyteller: {
    id: "storyteller",
    name: "Кафе «Сиппур»",
    he: "סִפּוּר",
    icon: "BookHeart",
    kind: "ai",
    pitch: "ИИ пишет рассказы из твоих слов, которые пора повторить, с вопросами на понимание.",
    levels: ["Сказка за 40 росы", "Выбор темы и жанра, сказка за 30 росы", "Сериал: продолжение с теми же героями, сказка за 20 росы"],
  },
  archive: {
    id: "archive",
    name: "Архив корней",
    he: "אַרְכִיּוֹן",
    icon: "Library",
    kind: "ai",
    pitch: "ИИ подбирает новые слова: пакет по теме или вся семья одного корня.",
    levels: ["Пакет слов по теме за 30 росы", "Семья корня за 25 росы", "Всё вдвое дешевле и один подарок архивариуса бесплатно каждую неделю"],
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
  { i: 1, kind: "plot", name: "Яффо", short: "Яффо", he: "יפו", district: "tlv", price: 40, building: "port", hint: "" },
  { i: 2, kind: "mazal", name: "Мазаль", short: "Мазаль", he: "מזל", hint: "Карта удачи: подарок, вопрос со ставкой или маленькая неприятность." },
  { i: 3, kind: "plot", name: "Ротшильд", short: "Ротшильд", he: "רוטשילד", district: "tlv", price: 50, building: "design", hint: "" },
  { i: 4, kind: "ulpan", name: "Ульпан", short: "Ульпан", he: "אולפן", hint: "Три быстрых вопроса по твоим словам: +4 росы за каждый верный." },
  {
    i: 5,
    kind: "misrad",
    name: "Мисрад а-пним",
    short: "МВД",
    he: "משרד הפנים",
    hint: "Бюрократия: заплати 12 росы — или ответь на вопрос по глаголам и пройди бесплатно.",
  },
  { i: 6, kind: "plot", name: "Адар", short: "Адар", he: "הדר", district: "haifa", price: 60, building: "black", hint: "" },
  { i: 7, kind: "plot", name: "Кармель", short: "Кармель", he: "הכרמל", district: "haifa", price: 70, building: "girl", hint: "" },
  { i: 8, kind: "mazal", name: "Мазаль", short: "Мазаль", he: "מזל", hint: "Карта удачи." },
  { i: 9, kind: "plot", name: "Цфат", short: "Цфат", he: "צפת", district: "galil", price: 60, building: "wheel", hint: "" },
  { i: 10, kind: "shabbat", name: "Шабат", short: "Шабат", he: "שבת", hint: "Шабат шалом: следующий бросок бесплатный." },
  { i: 11, kind: "plot", name: "Тверия", short: "Тверия", he: "טבריה", district: "galil", price: 70, building: "arena", hint: "" },
  { i: 12, kind: "arnona", name: "Арнона", short: "Арнона", he: "ארנונה", hint: "Муниципальный налог: 6 росы." },
  { i: 13, kind: "plot", name: "Мицпе-Рамон", short: "Рамон", he: "מצפה רמון", district: "negev", price: 80, building: "hostel", hint: "" },
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

// Эффекты для уроков: Кафе «Ход» (честные) и Чёрный рынок (мощные)
export interface EffectDef {
  id: string;
  name: string;
  hint: string;
  price: number;
  level: number;
  shop: "cafe" | "black";
  minutes?: number;
  uses?: number;
}
export const EFFECTS: EffectDef[] = [
  { id: "dew_x2", name: "Двойная роса", hint: "20 минут вся роса за повторения ×2", price: 25, level: 1, shop: "cafe", minutes: 20 },
  { id: "hint", name: "Подсказка без штрафа ×3", hint: "Подсказка в «Вспомни сам» и «Контексте» не снижает оценку", price: 15, level: 2, shop: "cafe", uses: 3 },
  { id: "retry", name: "Вторая попытка ×3", hint: "После ошибки в упражнении с вводом можно попробовать ещё раз", price: 20, level: 2, shop: "cafe", uses: 3 },
  { id: "golden", name: "Золотой час", hint: "60 минут +1 роса за каждый верный ответ", price: 30, level: 3, shop: "cafe", minutes: 60 },
  { id: "skip", name: "Пропуск ×3", hint: "Пропустить упражнение: не засчитывается ни как ошибка, ни как ответ", price: 15, level: 1, shop: "black", uses: 3 },
  { id: "dew_x3", name: "Тройная роса", hint: "10 минут вся роса за повторения ×3", price: 35, level: 1, shop: "black", minutes: 10 },
  { id: "shield", name: "Щит ×3", hint: "После ошибки можно закрыться щитом: в историю памяти она не попадёт", price: 25, level: 2, shop: "black", uses: 3 },
  { id: "chest", name: "Сундук финиша", hint: "24 часа: за каждый законченный урок (8+ упражнений) — сундук с призом", price: 40, level: 2, shop: "black", minutes: 24 * 60 },
  { id: "jackpot", name: "Джекпот", hint: "Роса за следующий законченный урок утраивается", price: 50, level: 3, shop: "black", uses: 1 },
];

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
  celebration: boolean;
  dewBonus: number; // Порт: +доля росы за уроки
  effects: string[]; // какие эффекты продаются (кафе и чёрный рынок)
  cafeDiscount: number;
  blackDiscount: number;
  morningCoffee: boolean;
  girl: boolean;
  wishesPerDay: number; // просьб к ней в день
  wishDiscount: number;
  spinsPerDay: number;
  jackpotSlice: boolean;
  bigPrizes: boolean;
  blitz: boolean;
  dictation: boolean;
  blitzMarathon: boolean;
  blitzCapMult: number;
  hostelIncome: number;
  hostelRollChance: number;
  storyPrice: number | null;
  storyThemes: boolean;
  storySeries: boolean;
  seedsPrice: number | null;
  rootPrice: number | null;
  archiveWeeklyFree: boolean;
}

export interface ActiveEffects {
  dew_x2_until: number;
  dew_x3_until: number;
  golden_until: number;
  chest_until: number;
  hint: number;
  retry: number;
  skip: number;
  shield: number;
  jackpot: number;
}

// ───────── Незнакомка в кафе на Кармеле ─────────
export const GIRL_STAGES = [
  { min: 0, name: "Незнакомка", discount: 0 },
  { min: 40, name: "Знакомая", discount: 0.05 },
  { min: 120, name: "Приятельница", discount: 0.1 },
  { min: 300, name: "Подруга", discount: 0.2 },
  { min: 600, name: "Близкая подруга", discount: 0.3 },
];
export function girlStage(affinity: number) {
  let k = 0;
  GIRL_STAGES.forEach((st, i) => {
    if (affinity >= st.min) k = i;
  });
  return k;
}
export const GIRL_NAME = { ru: "Ноа", he: "נוֹעָה" };

export const GIFTS = [
  { id: "coffee", name: "Кофе с собой", he: "קָפֶה הָפוּךְ", price: 5, affinity: 4 },
  { id: "rugelach", name: "Ругелах из пекарни", he: "רוּגֶלַךְ", price: 10, affinity: 9 },
  { id: "anemones", name: "Букет анемонов", he: "כַּלָּנִיּוֹת", price: 20, affinity: 20 },
  { id: "poems", name: "Сборник стихов Рахели", he: "שִׁירֵי רָחֵל", price: 30, affinity: 32 },
  { id: "cinema", name: "Билеты в Синематеку", he: "סִינֵמָטֵק", price: 45, affinity: 50 },
  { id: "earrings", name: "Серёжки из Яффо", he: "עֲגִילִים", price: 80, affinity: 95 },
];

// Общие языковые утилиты и справочники — используются и сервером, и клиентом.

export type Lang = "he" | "ru" | "en";
export type StudyLang = "he" | "en";

// ───────────────────────── Нормализация ─────────────────────────

const NIKUD_RE = /[֑-ׇֽֿׁׂׅׄ]/g;
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const TO_FINAL: Record<string, string> = { "כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ" };

export function stripNikud(s: string): string {
  return (s || "").replace(NIKUD_RE, "").replace(/־/g, "-");
}

/** Иврит → только буквы, без огласовок, конечные формы заменены на обычные. */
export function normHe(s: string): string {
  return stripNikud(s)
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^א-ת ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Сравнение «без матрес лекционис» — чтобы поймать разницу כתיב מלא / חסר. */
export function looseHe(s: string): string {
  const n = normHe(s);
  // сохраняем первую букву, остальные י/ו убираем
  return n
    .split(" ")
    .map((w) => (w.length > 1 ? w[0] + w.slice(1).replace(/[יו]/g, "") : w))
    .join(" ");
}

export function normRu(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zа-я0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normEn(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\- ]/g, " ")
    .replace(/^(to|a|an|the) /, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function norm(lang: Lang, s: string): string {
  return lang === "he" ? normHe(s) : lang === "ru" ? normRu(s) : normEn(s);
}

export function fixFinals(word: string): string {
  // ставит конечные формы букв в конце слов
  return word.replace(/[כמנפצ](?=$|[\s\-.,!?;:])/g, (c) => TO_FINAL[c]);
}

export function detectLang(s: string): Lang | null {
  const he = (s.match(/[א-ת]/g) || []).length;
  const ru = (s.match(/[а-яё]/gi) || []).length;
  const en = (s.match(/[a-z]/gi) || []).length;
  const max = Math.max(he, ru, en);
  if (max === 0) return null;
  if (max === he) return "he";
  if (max === ru) return "ru";
  return "en";
}

/** Разбиение на слова (с учётом иврита). */
export function tokenize(text: string): { t: string; word: boolean }[] {
  const out: { t: string; word: boolean }[] = [];
  const re = /([א-ת֑-ׇ"״׳'’\-]+|[A-Za-z'’\-]+|[А-Яа-яЁё\-]+)|([^א-ת֑-ׇA-Za-zА-Яа-яЁё]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) out.push({ t: m[1], word: /[א-תA-Za-zА-Яа-яЁё]/.test(m[1]) });
    else out.push({ t: m[2], word: false });
  }
  return out;
}

// Однобуквенные приставки иврита: ו ה ב כ ל מ ש (и их сочетания).
const HE_PREFIXES = [
  "וכש", "וכשה", "ושה", "ושב", "ושל", "ושמ", "וכשמ", "כשה", "כשב", "כשל", "שכש", "מה", "מש", "שה", "שב", "של", "שמ", "שכ",
  "וה", "וב", "ול", "ומ", "וש", "וכ", "כש", "לכש", "בה", "לה", "כה",
  "ו", "ה", "ב", "כ", "ל", "מ", "ש",
];

/** Кандидаты лемм для словоформы иврита после отсечения приставок. */
export function hePrefixCandidates(token: string): string[] {
  const n = normHe(token);
  const set = new Set<string>([n]);
  for (const p of HE_PREFIXES) {
    if (n.startsWith(p) && n.length - p.length >= 2) {
      set.add(n.slice(p.length));
      // после ב/ל/כ артикль ה выпадает
    }
  }
  return [...set];
}

/** Простые английские кандидаты лемм. */
export function enLemmaCandidates(token: string): string[] {
  const n = normEn(token);
  const c = new Set<string>([n]);
  if (n.endsWith("ies")) c.add(n.slice(0, -3) + "y");
  if (n.endsWith("es")) c.add(n.slice(0, -2));
  if (n.endsWith("s")) c.add(n.slice(0, -1));
  if (n.endsWith("ed")) { c.add(n.slice(0, -2)); c.add(n.slice(0, -1)); }
  if (n.endsWith("ing")) { c.add(n.slice(0, -3)); c.add(n.slice(0, -3) + "e"); }
  if (n.endsWith("ly")) c.add(n.slice(0, -2));
  return [...c].filter((x) => x.length > 1);
}

// ───────────────────────── Сравнение ответов ─────────────────────────

export type AnswerVerdict = "exact" | "close" | "wrong";

/** Проверяет ответ на иврите/английском/русском. close = верно по сути, но с ошибкой написания (ктив мале/хасер, опечатка). */
export function checkAnswer(lang: Lang, given: string, accepted: string[]): AnswerVerdict {
  const g = norm(lang, given);
  if (!g) return "wrong";
  const acc = accepted.filter(Boolean);
  for (const a of acc) {
    // варианты через запятую/слэш
    for (const part of a.split(/[,/;]| или | or /)) {
      if (norm(lang, part) === g && g) return "exact";
    }
  }
  for (const a of acc) {
    for (const part of a.split(/[,/;]| или | or /)) {
      const p = norm(lang, part);
      if (!p) continue;
      if (lang === "he" && looseHe(p) === looseHe(g)) return "close";
      if (lang !== "he" && p.length >= 5 && levenshtein(p, g) <= 1) return "close";
    }
  }
  return "wrong";
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// ───────────────────────── Грамматика иврита ─────────────────────────

export const BINYANIM = [
  { id: "paal", he: "פָּעַל", plain: "פעל", ru: "пааль", hint: "базовый, действие" },
  { id: "nifal", he: "נִפְעַל", plain: "נפעל", ru: "нифъаль", hint: "пассив/возвратность к пааль" },
  { id: "piel", he: "פִּעֵל", plain: "פיעל", ru: "пиэль", hint: "интенсивное действие" },
  { id: "pual", he: "פֻּעַל", plain: "פועל", ru: "пуаль", hint: "пассив к пиэль" },
  { id: "hifil", he: "הִפְעִיל", plain: "הפעיל", ru: "хифъиль", hint: "каузатив" },
  { id: "hufal", he: "הֻפְעַל", plain: "הופעל", ru: "хуфъаль", hint: "пассив к хифъиль" },
  { id: "hitpael", he: "הִתְפַּעֵל", plain: "התפעל", ru: "хитпаэль", hint: "возвратность, взаимность" },
] as const;
export type Binyan = (typeof BINYANIM)[number]["id"];

export const GZAROT = [
  { id: "shlemim", he: "שלמים", ru: "полные (правильные)" },
  { id: "meruba", he: "מרובעים", ru: "четырёхбуквенные" },
  { id: "npn", he: "נפ\"ן", ru: "1-я корневая נ" },
  { id: "npyv", he: "נפ\"יו", ru: "1-я корневая י/ו" },
  { id: "npa", he: "נפ\"א", ru: "1-я корневая א" },
  { id: "nayv", he: "נע\"וי", ru: "2-я корневая ו/י (пустая)" },
  { id: "kfulim", he: "כפולים", ru: "2-я = 3-я (удвоенные)" },
  { id: "nla", he: "נל\"א", ru: "3-я корневая א" },
  { id: "nlh", he: "נל\"ה", ru: "3-я корневая ה (ל\"י)" },
  { id: "gronit", he: "גרוניות", ru: "с гортанными (א ה ח ע ר)" },
] as const;
export type Gizra = (typeof GZAROT)[number]["id"];

export const TENSES = [
  { id: "past", he: "עבר", ru: "прошедшее" },
  { id: "present", he: "הווה", ru: "настоящее" },
  { id: "future", he: "עתיד", ru: "будущее" },
  { id: "imperative", he: "ציווי", ru: "повелительное" },
  { id: "infinitive", he: "שם הפועל", ru: "инфинитив" },
] as const;
export type Tense = (typeof TENSES)[number]["id"];

export const PERSONS: Record<Tense, { id: string; he: string; ru: string }[]> = {
  past: [
    { id: "1s", he: "אני", ru: "я" },
    { id: "2ms", he: "אתה", ru: "ты (м)" },
    { id: "2fs", he: "את", ru: "ты (ж)" },
    { id: "3ms", he: "הוא", ru: "он" },
    { id: "3fs", he: "היא", ru: "она" },
    { id: "1p", he: "אנחנו", ru: "мы" },
    { id: "2mp", he: "אתם", ru: "вы (м)" },
    { id: "2fp", he: "אתן", ru: "вы (ж)" },
    { id: "3p", he: "הם/הן", ru: "они" },
  ],
  present: [
    { id: "ms", he: "אני/אתה/הוא", ru: "м. ед." },
    { id: "fs", he: "אני/את/היא", ru: "ж. ед." },
    { id: "mp", he: "אנחנו/אתם/הם", ru: "м. мн." },
    { id: "fp", he: "אנחנו/אתן/הן", ru: "ж. мн." },
  ],
  future: [
    { id: "1s", he: "אני", ru: "я" },
    { id: "2ms", he: "אתה", ru: "ты (м)" },
    { id: "2fs", he: "את", ru: "ты (ж)" },
    { id: "3ms", he: "הוא", ru: "он" },
    { id: "3fs", he: "היא", ru: "она" },
    { id: "1p", he: "אנחנו", ru: "мы" },
    { id: "2p", he: "אתם/אתן", ru: "вы" },
    { id: "3p", he: "הם/הן", ru: "они" },
  ],
  imperative: [
    { id: "ms", he: "(אתה)", ru: "ты (м)" },
    { id: "fs", he: "(את)", ru: "ты (ж)" },
    { id: "p", he: "(אתם/אתן)", ru: "вы" },
  ],
  infinitive: [{ id: "inf", he: "ל־", ru: "инфинитив" }],
};

export function tenseLabel(t: string) {
  return TENSES.find((x) => x.id === t) ?? { id: t, he: t, ru: t };
}
export function personLabel(t: string, p: string) {
  return PERSONS[t as Tense]?.find((x) => x.id === p) ?? { id: p, he: p, ru: p };
}
export function binyanLabel(b: string | null | undefined) {
  return BINYANIM.find((x) => x.id === b);
}
export function gizraLabel(g: string) {
  return GZAROT.find((x) => x.id === g);
}

// Английские формы глагола
export const EN_FORMS = [
  { id: "past", ru: "Past Simple" },
  { id: "pp", ru: "Past Participle" },
  { id: "ing", ru: "-ing" },
  { id: "3s", ru: "he/she/it" },
] as const;

export const POS = [
  { id: "noun", ru: "сущ." },
  { id: "verb", ru: "глагол" },
  { id: "adj", ru: "прил." },
  { id: "adv", ru: "нареч." },
  { id: "prep", ru: "предлог" },
  { id: "conj", ru: "союз" },
  { id: "pron", ru: "местоим." },
  { id: "phrase", ru: "выражение" },
  { id: "other", ru: "другое" },
] as const;
export function posLabel(p: string | null | undefined) {
  return POS.find((x) => x.id === p)?.ru ?? "";
}

// ───────────────────────── Ивритская раскладка ─────────────────────────

/** Стандартная израильская раскладка (SI-1452): латинская клавиша → буква иврита. */
export const HE_KEYMAP: Record<string, string> = {
  q: "/", w: "'", e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ", "/": ".",
};

/** Та же раскладка, но из русских клавиш (ЙЦУКЕН на тех же физических местах). */
export const RU_TO_LATIN: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p",
  ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";",
  я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: ".",
};

export function latinToHebrew(s: string): string {
  return [...s]
    .map((ch) => {
      const lower = ch.toLowerCase();
      const lat = RU_TO_LATIN[lower] ?? lower;
      return HE_KEYMAP[lat] ?? ch;
    })
    .join("");
}

export const HE_KEYBOARD_ROWS = [
  ["ק", "ר", "א", "ט", "ו", "ן", "ם", "פ"],
  ["ש", "ד", "ג", "כ", "ע", "י", "ח", "ל", "ך", "ף"],
  ["ז", "ס", "ב", "ה", "נ", "מ", "צ", "ת", "ץ"],
];

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BINYANIM, GZAROT, PERSONS, stripNikud, detectLang, type Tense } from "../../shared/lang.js";
import type { Example, Pack, PackItem, Word, WordDraft, WordForm } from "../../shared/types.js";

// Модель и «усилие» можно поменять переменными окружения на fly.io.
const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const EFFORT_OVERRIDE = process.env.AI_EFFORT as "low" | "medium" | "high" | undefined;
const MOCK = process.env.AI_MOCK === "1";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

export function aiEnabled(): boolean {
  return MOCK || !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN;
}
export function aiInfo() {
  return { enabled: aiEnabled(), model: MOCK ? "mock" : MODEL };
}

export class AIError extends Error {}

async function ask<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  if (!aiEnabled()) throw new AIError("ИИ не подключён: добавь ANTHROPIC_API_KEY в секреты fly.io");
  try {
    const res = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      // при отказе модели запрос автоматически повторится на запасной модели
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: {
        effort: EFFORT_OVERRIDE || opts.effort || "low",
        format: betaZodOutputFormat(opts.schema),
      },
      messages: [{ role: "user", content: opts.user }],
    });
    if (res.stop_reason === "refusal") throw new AIError("Модель отказалась отвечать на этот запрос");
    if (res.stop_reason === "max_tokens") throw new AIError("Ответ ИИ оказался слишком длинным — попробуй ещё раз");
    if (!res.parsed_output) throw new AIError("ИИ вернул ответ в неожиданном формате");
    return res.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("Неверный ANTHROPIC_API_KEY");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("Слишком много запросов к ИИ — подожди минуту");
    if (e instanceof Anthropic.BadRequestError) throw new AIError("ИИ отклонил запрос: " + e.message);
    if (e instanceof Anthropic.APIConnectionError) throw new AIError("Нет связи с ИИ, попробуй позже");
    if (e instanceof Anthropic.APIError) throw new AIError(`Ошибка ИИ (${e.status}): ${e.message}`);
    throw e;
  }
}

const LEARNER =
  "Ученик — русскоязычный взрослый, живёт в Израиле, учит иврит (уровень примерно ульпан алеф–гимель) и параллельно английский. " +
  "Все пояснения пиши по-русски, кратко и по делу.";

// ───────────────────────── анализ слова ─────────────────────────

const POS_IDS = ["noun", "verb", "adj", "adv", "prep", "conj", "pron", "phrase", "other"] as const;
const BINYAN_IDS = BINYANIM.map((b) => b.id) as [string, ...string[]];
const GIZRA_IDS = GZAROT.map((g) => g.id) as [string, ...string[]];

const DraftSchema = z.object({
  is_valid: z.boolean(),
  input_lang: z.enum(["he", "ru", "en"]),
  lemma_note: z.string(),
  he: z.string(),
  he_nikud: z.string(),
  translit: z.string(),
  ru: z.string(),
  ru_alt: z.string(),
  en: z.string(),
  en_alt: z.string(),
  pos: z.enum(POS_IDS),
  gender: z.enum(["m", "f", "mf"]).nullable(),
  plural: z.string().nullable(),
  plural_nikud: z.string().nullable(),
  root: z.string().nullable(),
  binyan: z.enum(BINYAN_IDS).nullable(),
  gizra: z.array(z.enum(GIZRA_IDS)),
  notes: z.string(),
  mnemonic: z.string(),
  tags: z.array(z.string()),
  he_examples: z.array(z.object({ text: z.string(), text_nikud: z.string(), target: z.string(), ru: z.string() })),
  en_examples: z.array(z.object({ text: z.string(), target: z.string(), ru: z.string() })),
  en_forms: z.array(z.object({ form_id: z.enum(["past", "pp", "ing", "3s", "plural"]), form: z.string() })),
});

const ANALYZE_SYSTEM = `Ты — лексикограф и преподаватель иврита и английского. ${LEARNER}

Пользователь вводит слово или короткое выражение на иврите, русском или английском — в ЛЮБОЙ форме: спряжённой, с приставками (ו, ה, ב, ל, מ, ש, כ), с местоимёнными суффиксами, во множественном числе, в сопряжённом состоянии (סמיכות), с опечаткой. Твоя задача — привести его к словарной форме и заполнить карточку на трёх языках.

Правила:
- Словарная форма на иврите: глагол → שם הפועל (נתפסתי → להיתפס); для פועל/הופעל без инфинитива → 3 л. м. р. ед. ч. прошедшего (הוזמן). Существительное → ед. ч., נפרד, без приставок и суффиксов. Прилагательное → м. р. ед. ч.
- he — כתיב מלא по правилам Академии, без огласовок. he_nikud — то же слово с полной огласовкой.
- Если ввод на русском или английском — выбери самый употребительный в современном израильском иврите эквивалент.
- ru — главный перевод (1–3 слова), ru_alt — другие значения через запятую. en / en_alt — аналогично по-английски (для глаголов без "to").
- translit — транскрипция кириллицей с ударением (знак ударения ́ над гласной), например «рэайя́».
- root — корень через дефис (ת-פ-ס), для заимствований без корня — null. binyan — только для глаголов. gizra — список групп (שלמים = shlemim; если корень с гортанной — добавь gronit).
- gender и plural — для существительных (plural с огласовкой в plural_nikud). Для прилагательных plural = форма м. р. мн. ч.
- he_examples — 3 простых естественных предложения на современном иврите (уровень ульпана), в каждом слово стоит в РАЗНЫХ формах, если это естественно. target — точная подстрока из text (без огласовок), в которой стоит слово. text_nikud — то же предложение с огласовкой. ru — перевод.
- en_examples — 2 примера на английском (target — точная подстрока), только если слово есть в английском.
- en_forms — для английских глаголов: past, pp, ing, 3s; для существительных с нерегулярным мн. ч. — plural. Иначе пустой список.
- lemma_note — если ввод был не в словарной форме, по-русски поясни, что это была за форма (например «נתפסתי — прош. вр., 1 л. ед. ч.»). Иначе пустая строка.
- notes — 1–3 коротких замечания: управление (с какой מילת יחס), устойчивые сочетания, регистр, омографы. mnemonic — короткая ассоциация на русском, если получается естественная; иначе пустая строка.
- tags — 1–3 тематические метки на русском (например «право», «эмоции»).
- is_valid = false, если это не слово ни одного из трёх языков.`;

export async function analyzeWord(input: string): Promise<WordDraft> {
  if (MOCK) return mockDraft(input);
  const r = await ask({
    system: ANALYZE_SYSTEM,
    user: `Ввод: «${input.trim()}»`,
    schema: DraftSchema,
    effort: "medium",
  });
  if (!r.is_valid) throw new AIError(`«${input}» не похоже на слово — проверь написание`);
  const examples: Example[] = [
    ...r.he_examples.map((e) => ({ lang: "he" as const, text: stripNikud(e.text), text_nikud: e.text_nikud, target: stripNikud(e.target), ru: e.ru })),
    ...r.en_examples.map((e) => ({ lang: "en" as const, text: e.text, text_nikud: "", target: e.target, ru: e.ru })),
  ];
  return {
    input,
    input_lang: r.input_lang,
    lemma_note: r.lemma_note,
    he: stripNikud(r.he),
    he_nikud: r.he_nikud,
    translit: r.translit,
    ru: r.ru,
    ru_alt: r.ru_alt,
    en: r.en,
    en_alt: r.en_alt,
    pos: r.pos,
    gender: r.gender,
    plural: r.plural ? stripNikud(r.plural) : null,
    plural_nikud: r.plural_nikud,
    root: r.root,
    binyan: r.binyan,
    gizra: r.gizra,
    notes: r.notes,
    mnemonic: r.mnemonic,
    tags: r.tags,
    study: r.input_lang === "en" ? ["en"] : ["he"],
    examples,
    en_forms: r.en_forms.map((f) => ({ lang: "en" as const, tense: f.form_id, person: "", form: f.form, nikud: f.form })),
    he_forms: [],
  };
}

// ───────────────────────── спряжение ─────────────────────────

const PERSON_IDS = ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "2p", "3p", "ms", "fs", "mp", "fp", "p", "inf"] as const;

const ConjSchema = z.object({
  forms: z.array(
    z.object({
      tense: z.enum(["past", "present", "future", "imperative", "infinitive"]),
      person: z.enum(PERSON_IDS),
      form: z.string(),
      nikud: z.string(),
    }),
  ),
  gizra: z.array(z.enum(GIZRA_IDS)),
  root: z.string(),
});

function personsSpec() {
  return (Object.keys(PERSONS) as Tense[])
    .map((t) => `${t}: ${PERSONS[t].map((p) => `${p.id} (${p.he})`).join(", ")}`)
    .join("\n");
}

export async function conjugate(w: Pick<Word, "he" | "he_nikud" | "root" | "binyan" | "ru">): Promise<{ forms: WordForm[]; gizra: string[]; root: string }> {
  if (MOCK) return mockConj(w);
  const passive = w.binyan === "pual" || w.binyan === "hufal";
  const r = await ask({
    system: `Ты — эксперт по морфологии иврита. Дай полную таблицу спряжения глагола в современном нормативном иврите.
Набор форм (tense: person):
${personsSpec()}
- form — כתיב מלא без огласовок по правилам Академии, nikud — та же форма с полной огласовкой.
- В будущем времени 2p и 3p — общая форма для м. и ж. р. (תכתבו, יכתבו), как в современном языке.
- ${passive ? "Это пассивный биньян: повелительного наклонения и инфинитива нет — не выдавай их." : "Выдай все 25 форм, включая инфинитив (person = inf)."}
- gizra — группы глагола (несколько, если корень относится к нескольким), root — корень через дефис.`,
    user: `Глагол: ${w.he_nikud || w.he} (${w.ru}). Корень: ${w.root || "?"}. Биньян: ${w.binyan || "определи сам"}.`,
    schema: ConjSchema,
    effort: "medium",
  });
  const seen = new Set<string>();
  const forms: WordForm[] = [];
  for (const f of r.forms) {
    const key = f.tense + ":" + f.person;
    if (seen.has(key) || !f.form) continue;
    if (!PERSONS[f.tense as Tense]?.some((p) => p.id === f.person)) continue;
    seen.add(key);
    forms.push({ lang: "he", tense: f.tense, person: f.person, form: stripNikud(f.form), nikud: f.nikud });
  }
  return { forms, gizra: r.gizra, root: r.root };
}

// ───────────────────────── проверка предложения ─────────────────────────

const SentenceSchema = z.object({
  uses_target: z.boolean(),
  form_used: z.string(),
  usage_correct: z.boolean(),
  grammar_ok: z.boolean(),
  corrected: z.string(),
  explanation: z.string(),
  naturalness: z.number().int(),
  other_lemmas: z.array(z.string()),
});
export type SentenceCheck = z.infer<typeof SentenceSchema>;

export async function checkSentence(opts: { target: string; meaning: string; lang: "he" | "en"; sentence: string }): Promise<SentenceCheck> {
  if (MOCK) {
    const uses = opts.sentence.includes(opts.target.slice(0, 3));
    return { uses_target: uses, form_used: uses ? opts.target : "", usage_correct: uses, grammar_ok: true, corrected: opts.sentence, explanation: "Мок-проверка.", naturalness: 4, other_lemmas: [] };
  }
  const langName = opts.lang === "he" ? "иврите" : "английском";
  return ask({
    system: `Ты — внимательный преподаватель. ${LEARNER}
Ученик тренирует активное употребление слова: сам составил предложение на ${langName}. Проверь:
- uses_target — использовано ли целевое слово (в любой грамматической форме, с приставками/суффиксами — считается). form_used — в какой форме.
- usage_correct — употреблено ли оно верно по смыслу и сочетаемости.
- grammar_ok — нет ли грамматических ошибок во всём предложении (огласовки не требуются, ошибки כתיב מלא/חסר не считаются).
- corrected — исправленный вариант (если всё верно — исходное предложение). Для иврита без огласовок.
- explanation — 1–3 предложения по-русски: что хорошо, что исправить и почему. Без воды и без похвалы ради похвалы.
- naturalness — от 1 до 5: насколько естественно звучит для носителя.
- other_lemmas — словарные формы остальных значимых слов предложения (на языке предложения).`,
    user: `Целевое слово: ${opts.target} — «${opts.meaning}».\nПредложение ученика: ${opts.sentence}`,
    schema: SentenceSchema,
    effort: "low",
  });
}

// ───────────────────────── дневник ─────────────────────────

const JournalSchema = z.object({
  corrected: z.string(),
  issues: z.array(z.object({ fragment: z.string(), fix: z.string(), why: z.string() })),
  comment: z.string(),
  lemmas: z.array(z.object({ surface: z.string(), lemma: z.string() })),
});
export type JournalCheck = z.infer<typeof JournalSchema>;

export async function reviewJournal(opts: { text: string; lang: "he" | "en"; prompt: string }): Promise<JournalCheck> {
  if (MOCK) return { corrected: opts.text, issues: [], comment: "Мок-разбор.", lemmas: [] };
  return ask({
    system: `Ты — преподаватель и редактор. ${LEARNER}
Ученик пишет свободный текст в дневник на ${opts.lang === "he" ? "иврите" : "английском"}. Исправь ошибки, сохраняя его стиль и мысль.
- corrected — исправленный текст целиком (для иврита без огласовок).
- issues — до 8 самых важных исправлений: fragment (как было), fix (как правильно), why (почему, по-русски, коротко). Ошибки כתיב מלא/חסר — только если искажают слово.
- comment — 1–2 предложения: что получилось хорошо и на что обратить внимание. Конкретно, без шаблонных похвал.
- lemmas — для КАЖДОГО значимого слова текста (существительные, глаголы, прилагательные, наречия): surface — как написано, lemma — словарная форма (для глаголов иврита — שם הפועל).`,
    user: `Тема: ${opts.prompt || "свободная"}\n\nТекст:\n${opts.text}`,
    schema: JournalSchema,
    effort: "low",
  });
}

// ───────────────────────── глоссы для читалки ─────────────────────────

const GlossSchema = z.object({
  tokens: z.array(z.object({ surface: z.string(), lemma: z.string(), lemma_nikud: z.string(), ru: z.string(), pos: z.enum(POS_IDS) })),
  translation: z.string(),
});

export async function glossText(text: string) {
  if (MOCK) return { tokens: [], translation: "(мок-перевод)" };
  const lang = detectLang(text) === "en" ? "английском" : "иврите";
  return ask({
    system: `Ты помогаешь читать тексты на ${lang}. ${LEARNER}
Для каждого значимого слова текста (без повторов): surface — как в тексте, lemma — словарная форма (глаголы иврита — שם הפועל), lemma_nikud — словарная форма с огласовкой (для английского — то же, что lemma), ru — значение именно в этом контексте, pos — часть речи. translation — перевод всего текста на русский.`,
    user: text.slice(0, 6000),
    schema: GlossSchema,
    effort: "low",
  });
}

// ───────────────────────── примеры ─────────────────────────

const ExamplesSchema = z.object({
  examples: z.array(z.object({ text: z.string(), text_nikud: z.string(), target: z.string(), ru: z.string() })),
});

export async function makeExamples(w: Word, lang: "he" | "en"): Promise<Example[]> {
  if (MOCK) return [];
  const r = await ask({
    system: `Ты составляешь учебные примеры. ${LEARNER}
Дай 3 коротких естественных предложения на ${lang === "he" ? "современном иврите" : "английском"} с этим словом — в разных формах, если это естественно. target — точная подстрока предложения, где стоит слово (без огласовок). text_nikud — ${lang === "he" ? "предложение с огласовкой" : "пустая строка"}. ru — перевод.`,
    user: `Слово: ${lang === "he" ? w.he_nikud || w.he : w.en} — «${w.ru}»`,
    schema: ExamplesSchema,
    effort: "low",
  });
  return r.examples.map((e) => ({
    lang,
    text: lang === "he" ? stripNikud(e.text) : e.text,
    text_nikud: e.text_nikud,
    target: lang === "he" ? stripNikud(e.target) : e.target,
    ru: e.ru,
  }));
}

// ───────────────────────── генерация наборов упражнений ─────────────────────────

const PackSchema = z.object({
  title: z.string(),
  description: z.string(),
  items: z.array(
    z.object({
      type: z.enum(["info", "choice", "fill", "translate", "order"]),
      title: z.string(),
      body: z.string(),
      prompt: z.string(),
      options: z.array(z.string()),
      answer_index: z.number().int(),
      answers: z.array(z.string()),
      tokens: z.array(z.string()),
      explain: z.string(),
    }),
  ),
});

export async function generatePack(opts: { topic: string; lang: "he" | "en"; count: number; words?: string[] }): Promise<Pack> {
  if (MOCK) {
    return {
      id: "ai-" + Date.now(),
      title: "Мок: " + opts.topic,
      description: "Тестовый набор",
      lang: opts.lang,
      source: "ai",
      items: [{ type: "choice", prompt: "2+2?", options: ["3", "4"], answer: 1, explain: "Просто." }],
    };
  }
  const r = await ask({
    system: `Ты — методист, составляешь короткий набор упражнений. ${LEARNER}
Язык упражнений: ${opts.lang === "he" ? "иврит" : "английский"}. Начни с 1 карточки type=info (title + body: сжатое правило по-русски, 3–6 строк, с примерами). Затем упражнения разных типов:
- choice: prompt, options (3–4), answer_index.
- fill: prompt с пропуском «___», answers — все допустимые варианты заполнения.
- translate: prompt — фраза по-русски, answers — допустимые переводы (2–4 варианта, короткие).
- order: tokens — слова предложения в ПЕРЕМЕШАННОМ порядке, answers — [правильное предложение].
explain — короткое пояснение по-русски к каждому упражнению. Неиспользуемые поля заполняй пустыми строками/списками, answer_index = -1.
Иврит — без огласовок, кроме случаев, когда огласовка — суть упражнения.`,
    user: `Тема: ${opts.topic}\nКоличество упражнений: ${opts.count}${opts.words?.length ? `\nПо возможности используй слова ученика: ${opts.words.join(", ")}` : ""}`,
    schema: PackSchema,
    effort: "medium",
  });
  const items: PackItem[] = r.items.map((it) => {
    switch (it.type) {
      case "info":
        return { type: "info", title: it.title, body: it.body };
      case "choice":
        return { type: "choice", prompt: it.prompt, options: it.options, answer: it.answer_index, explain: it.explain };
      case "order":
        return { type: "order", tokens: it.tokens, answers: it.answers, explain: it.explain, prompt: it.prompt };
      default:
        return { type: it.type, prompt: it.prompt, answers: it.answers, explain: it.explain };
    }
  });
  return { id: "ai-" + Date.now().toString(36), title: r.title, description: r.description, lang: opts.lang, source: "ai", items };
}

// ───────────────────────── мок для локальной разработки ─────────────────────────

function mockDraft(input: string): WordDraft {
  const lang = detectLang(input) || "he";
  return {
    input,
    input_lang: lang,
    lemma_note: "",
    he: lang === "he" ? stripNikud(input) : "מילה",
    he_nikud: lang === "he" ? input : "מִלָּה",
    translit: "",
    ru: lang === "ru" ? input : "слово (мок)",
    ru_alt: "",
    en: lang === "en" ? input : "word",
    en_alt: "",
    pos: "noun",
    gender: "f",
    plural: null,
    plural_nikud: null,
    root: null,
    binyan: null,
    gizra: [],
    notes: "",
    mnemonic: "",
    tags: [],
    study: lang === "en" ? ["en"] : ["he"],
    examples: [],
    en_forms: [],
    he_forms: [],
  };
}

function mockConj(w: Pick<Word, "he">) {
  return { forms: [{ lang: "he" as const, tense: "infinitive", person: "inf", form: w.he, nikud: w.he }], gizra: ["shlemim"], root: "" };
}

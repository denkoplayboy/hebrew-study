import { db, getSettings } from "./db.js";
import {
  normHe,
  normRu,
  normEn,
  detectLang,
  hePrefixCandidates,
  enLemmaCandidates,
  stripNikud,
  type StudyLang,
  type Lang,
} from "../../shared/lang.js";
import {
  applicableFacets,
  facetR,
  facetStrength,
  masteryOf,
  schedule,
  stageOf,
  type Facet,
  type FacetState,
  type Grade,
} from "../../shared/memory.js";
import type { Example, Word, WordDraft, WordForm, WordFull, WordProgress, WordSummary } from "../../shared/types.js";

// ───────────────────────── строки → объекты ─────────────────────────

type Row = Record<string, any>;

function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function rowToWord(r: Row): Word {
  return {
    id: r.id,
    he: r.he,
    he_nikud: r.he_nikud,
    ru: r.ru,
    en: r.en,
    ru_alt: r.ru_alt,
    en_alt: r.en_alt,
    translit: r.translit,
    pos: r.pos,
    gender: r.gender,
    plural: r.plural,
    plural_nikud: r.plural_nikud,
    root: r.root,
    binyan: r.binyan,
    gizra: parseJSON(r.gizra, []),
    notes: r.notes,
    mnemonic: r.mnemonic,
    tags: parseJSON(r.tags, []),
    study: parseJSON(r.study, ["he"]),
    source: r.source,
    conj_status: r.conj_status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function variants(text: string, fn: (s: string) => string): string[] {
  return (text || "")
    .split(/[,;/|]|\s+или\s+|\s+or\s+/)
    .map((x) => fn(x))
    .filter(Boolean);
}

function normFields(w: Partial<Word>) {
  const he = new Set<string>([
    ...variants(w.he || "", normHe),
    ...variants(stripNikud(w.he_nikud || ""), normHe),
    ...variants(stripNikud(w.plural || ""), normHe),
  ]);
  const ru = new Set<string>([...variants(w.ru || "", normRu), ...variants(w.ru_alt || "", normRu)]);
  const en = new Set<string>([...variants(w.en || "", normEn), ...variants(w.en_alt || "", normEn)]);
  const pack = (s: Set<string>) => (s.size ? "|" + [...s].join("|") + "|" : "");
  return { norm_he: pack(he), norm_ru: pack(ru), norm_en: pack(en) };
}

export const CONJ_TENSES = ["past", "present", "future", "imperative", "infinitive"];

/** Неправильный ли английский глагол (есть смысл тренировать формы). */
export function isIrregularEn(base: string, past?: string, pp?: string): boolean {
  if (!past) return false;
  const b = normEn(base);
  const regular = (x?: string) => {
    if (!x) return true;
    const f = normEn(x);
    return [b + "ed", b + "d", b.slice(0, -1) + "ied", b + b.slice(-1) + "ed"].includes(f);
  };
  return !(regular(past) && regular(pp));
}

// ───────────────────────── грани и прогресс ─────────────────────────

function facetRows(wordId: number): (FacetState & { lang: StudyLang })[] {
  return (db.prepare("SELECT * FROM facets WHERE word_id = ?").all(wordId) as Row[]).map((r) => ({
    lang: r.lang,
    facet: r.facet,
    state: r.state,
    stability: r.stability,
    difficulty: r.difficulty,
    due: r.due,
    last: r.last,
    reps: r.reps,
    lapses: r.lapses,
  }));
}

export function progressFromFacets(word: Word, rows: (FacetState & { lang: string })[], now = Date.now()): WordProgress[] {
  return word.study.map((lang) => {
    const fs = rows.filter((r) => r.lang === lang);
    const mastery = masteryOf(fs, now);
    const touched = fs.some((f) => f.reps > 0);
    return {
      lang,
      mastery,
      stage: stageOf(mastery, touched),
      thirsty: fs.some((f) => f.state === "review" && f.due <= now),
      facets: fs.map((f) => ({ ...f, strength: facetStrength(f, now), R: facetR(f, now) })),
    };
  });
}

/** Создаёт недостающие грани для изучаемых языков слова и открывает доступные. */
export function ensureFacets(wordId: number) {
  const w = getWord(wordId);
  if (!w) return;
  const hasForms = (lang: StudyLang) => {
    if (lang === "he")
      return !!db
        .prepare(`SELECT 1 FROM forms WHERE word_id = ? AND lang = 'he' AND tense IN (${CONJ_TENSES.map((t) => `'${t}'`).join(",")}) LIMIT 1`)
        .get(wordId);
    const f = db.prepare("SELECT tense, form FROM forms WHERE word_id = ? AND lang = 'en'").all(wordId) as { tense: string; form: string }[];
    return isIrregularEn(w.en, f.find((x) => x.tense === "past")?.form, f.find((x) => x.tense === "pp")?.form);
  };
  const ins = db.prepare(
    "INSERT OR IGNORE INTO facets(word_id, lang, facet, state) VALUES (?, ?, ?, ?)",
  );
  for (const lang of w.study) {
    const facets = applicableFacets({ lang, isVerb: w.pos === "verb", hasForms: hasForms(lang) });
    for (const f of facets) ins.run(wordId, lang, f, f === "recognize" || f === "listen" ? "new" : "locked");
  }
  // убрать грани для языков, которые больше не изучаются
  const langs = w.study.map((l) => `'${l}'`).join(",") || "''";
  db.prepare(`DELETE FROM facets WHERE word_id = ? AND lang NOT IN (${langs})`).run(wordId);
  for (const lang of w.study) refreshUnlocks(wordId, lang);
}

/** Лестница навыков: узнал → вспомнил → в контексте → сам употребил. */
export function refreshUnlocks(wordId: number, lang: StudyLang): string[] {
  const rows = facetRows(wordId).filter((r) => r.lang === lang);
  const by = Object.fromEntries(rows.map((r) => [r.facet, r])) as Record<string, (typeof rows)[number]>;
  const unlock: Facet[] = [];
  const ok = (f: string, reps = 1) => by[f] && by[f].reps >= reps && by[f].state !== "locked";
  if (by.recall?.state === "locked" && ok("recognize")) unlock.push("recall");
  if (by.spell?.state === "locked" && ok("recall")) unlock.push("spell");
  const hasExample = !!db
    .prepare("SELECT 1 FROM examples WHERE word_id = ? AND lang = ? AND target <> '' LIMIT 1")
    .get(wordId, lang);
  if (by.context?.state === "locked" && ok("recall") && hasExample) unlock.push("context");
  // употребление — когда слово уже дважды вспомнилось без срывов
  if (by.produce?.state === "locked" && by.recall && by.recall.state !== "locked" && by.recall.reps - by.recall.lapses >= 2 && by.recall.stability >= 2)
    unlock.push("produce");
  if (by.conjugate?.state === "locked" && ok("recall")) unlock.push("conjugate");
  const st = db.prepare("UPDATE facets SET state = 'new' WHERE word_id = ? AND lang = ? AND facet = ? AND state = 'locked'");
  for (const f of unlock) st.run(wordId, lang, f);
  return unlock;
}

// ───────────────────────── CRUD ─────────────────────────

export function getWord(id: number): Word | null {
  const r = db.prepare("SELECT * FROM words WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToWord(r) : null;
}

export function getSummary(id: number, now = Date.now()): WordSummary | null {
  const w = getWord(id);
  if (!w) return null;
  return { ...w, progress: progressFromFacets(w, facetRows(id), now) };
}

export function summaries(words: Word[], now = Date.now()): WordSummary[] {
  if (!words.length) return [];
  const ids = words.map((w) => w.id);
  const rows = db
    .prepare(`SELECT * FROM facets WHERE word_id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Row[];
  const byWord = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byWord.has(r.word_id)) byWord.set(r.word_id, []);
    byWord.get(r.word_id)!.push(r);
  }
  return words.map((w) => ({ ...w, progress: progressFromFacets(w, (byWord.get(w.id) || []) as any, now) }));
}

export function getForms(wordId: number): WordForm[] {
  return db.prepare("SELECT id, word_id, lang, tense, person, form, nikud FROM forms WHERE word_id = ? ORDER BY id").all(wordId) as WordForm[];
}
export function getExamples(wordId: number): Example[] {
  return db.prepare("SELECT * FROM examples WHERE word_id = ? ORDER BY id").all(wordId) as Example[];
}

export function getFull(id: number): WordFull | null {
  const s = getSummary(id);
  if (!s) return null;
  const family = s.root
    ? (db
        .prepare("SELECT id, he, he_nikud, ru, pos FROM words WHERE root = ? AND id <> ? ORDER BY he")
        .all(s.root, id) as WordFull["family"])
    : [];
  const confusions = db
    .prepare(
      `SELECT w.id, w.he, w.en, w.ru, SUM(c.count) AS count FROM confusions c
       JOIN words w ON w.id = CASE WHEN c.a = ? THEN c.b ELSE c.a END
       WHERE c.a = ? OR c.b = ? GROUP BY w.id ORDER BY count DESC LIMIT 6`,
    )
    .all(id, id, id) as WordFull["confusions"];
  const history = db
    .prepare("SELECT ts, lang, facet, grade, mode FROM reviews WHERE word_id = ? ORDER BY ts DESC LIMIT 200")
    .all(id) as WordFull["history"];
  const fluency = s.study.map((lang) => {
    const ms = (
      db
        .prepare(
          "SELECT ms FROM reviews WHERE word_id = ? AND lang = ? AND correct = 1 AND ms IS NOT NULL AND facet IN ('recall','recognize','listen') ORDER BY ts DESC LIMIT 15",
        )
        .all(id, lang) as { ms: number }[]
    )
      .map((r) => r.ms)
      .sort((a, b) => a - b);
    return { lang, medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null, samples: ms.length };
  });
  return { ...s, forms: getForms(id), examples: getExamples(id), family, confusions, history, fluency };
}

const WORD_FIELDS = [
  "he",
  "he_nikud",
  "ru",
  "en",
  "ru_alt",
  "en_alt",
  "translit",
  "pos",
  "gender",
  "plural",
  "plural_nikud",
  "root",
  "binyan",
  "notes",
  "mnemonic",
] as const;

function cleanRoot(root: string | null | undefined): string | null {
  if (!root) return null;
  const letters = normHe(root).replace(/\s/g, "");
  return letters.length >= 2 ? letters.split("").join("-") : null;
}

export function createWord(d: Partial<WordDraft> & { source?: string }): number {
  const now = Date.now();
  const w: Partial<Word> = {
    he: stripNikud(d.he || d.he_nikud || "").trim(),
    he_nikud: (d.he_nikud || d.he || "").trim(),
    ru: (d.ru || "").trim(),
    en: (d.en || "").trim(),
    ru_alt: d.ru_alt || "",
    en_alt: d.en_alt || "",
    translit: d.translit || "",
    pos: d.pos || "other",
    gender: d.gender || null,
    plural: d.plural ? stripNikud(d.plural) : null,
    plural_nikud: d.plural_nikud || d.plural || null,
    root: cleanRoot(d.root),
    binyan: d.binyan || null,
    notes: d.notes || "",
    mnemonic: d.mnemonic || "",
  };
  const study = d.study && d.study.length ? d.study : defaultStudy(d);
  const n = normFields(w);
  const info = db
    .prepare(
      `INSERT INTO words (he, he_nikud, ru, en, ru_alt, en_alt, translit, pos, gender, plural, plural_nikud, root, binyan,
        gizra, notes, mnemonic, tags, study, source, conj_status, norm_he, norm_ru, norm_en, created_at, updated_at)
       VALUES (@he, @he_nikud, @ru, @en, @ru_alt, @en_alt, @translit, @pos, @gender, @plural, @plural_nikud, @root, @binyan,
        @gizra, @notes, @mnemonic, @tags, @study, @source, @conj_status, @norm_he, @norm_ru, @norm_en, @now, @now)`,
    )
    .run({
      ...w,
      gizra: JSON.stringify(d.gizra || []),
      tags: JSON.stringify(d.tags || []),
      study: JSON.stringify(study),
      source: d.source || "manual",
      conj_status: "none",
      ...n,
      now,
    });
  const id = Number(info.lastInsertRowid);
  const forms = [...(d.he_forms || []), ...(d.en_forms || [])];
  if (forms.length) replaceForms(id, forms);
  if (d.examples?.length) addExamples(id, d.examples);
  if ((d.he_forms || []).some((f) => CONJ_TENSES.includes(f.tense))) db.prepare("UPDATE words SET conj_status = 'ready' WHERE id = ?").run(id);
  ensureFacets(id);
  addMoment("added", id, `Посажено: ${w.he || w.en || w.ru}`);
  if (w.root) {
    const cnt = (db.prepare("SELECT COUNT(*) AS c FROM words WHERE root = ?").get(w.root) as { c: number }).c;
    if (cnt === 2) addMoment("root", id, `Корень ${w.root} дал второй побег`);
    if (cnt === 5) addMoment("root", id, `Корень ${w.root} разросся: уже 5 слов`);
  }
  return id;
}

function defaultStudy(d: Partial<WordDraft>): StudyLang[] {
  if (d.input_lang === "en") return ["en"];
  if (d.he || d.he_nikud) return ["he"];
  if (d.en) return ["en"];
  return ["he"];
}

export function updateWord(id: number, patch: Partial<Word> & { examples?: Example[]; forms?: WordForm[] }) {
  const cur = getWord(id);
  if (!cur) return;
  const next: Word = { ...cur };
  for (const k of WORD_FIELDS) if (k in patch) (next as any)[k] = (patch as any)[k];
  if (patch.he_nikud !== undefined && patch.he === undefined) next.he = stripNikud(patch.he_nikud);
  if (patch.gizra) next.gizra = patch.gizra;
  if (patch.tags) next.tags = patch.tags;
  if (patch.study && patch.study.length) next.study = patch.study;
  next.root = cleanRoot(next.root);
  const n = normFields(next);
  db.prepare(
    `UPDATE words SET he=@he, he_nikud=@he_nikud, ru=@ru, en=@en, ru_alt=@ru_alt, en_alt=@en_alt, translit=@translit, pos=@pos,
     gender=@gender, plural=@plural, plural_nikud=@plural_nikud, root=@root, binyan=@binyan, gizra=@gizra, notes=@notes,
     mnemonic=@mnemonic, tags=@tags, study=@study, norm_he=@norm_he, norm_ru=@norm_ru, norm_en=@norm_en, updated_at=@now WHERE id=@id`,
  ).run({ ...next, gizra: JSON.stringify(next.gizra), tags: JSON.stringify(next.tags), study: JSON.stringify(next.study), ...n, now: Date.now(), id });
  if (patch.examples) {
    db.prepare("DELETE FROM examples WHERE word_id = ?").run(id);
    addExamples(id, patch.examples);
  }
  if (patch.forms) replaceForms(id, patch.forms);
  ensureFacets(id);
}

export function deleteWord(id: number) {
  db.prepare("DELETE FROM words WHERE id = ?").run(id);
}

export function replaceForms(wordId: number, forms: WordForm[], lang?: "he" | "en") {
  if (lang) db.prepare("DELETE FROM forms WHERE word_id = ? AND lang = ?").run(wordId, lang);
  else db.prepare("DELETE FROM forms WHERE word_id = ?").run(wordId);
  const st = db.prepare("INSERT INTO forms(word_id, lang, tense, person, form, nikud, norm) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const f of forms) {
    const plain = f.lang === "he" ? stripNikud(f.form || f.nikud) : f.form;
    if (!plain) continue;
    st.run(wordId, f.lang, f.tense || "", f.person || "", plain, f.nikud || plain, f.lang === "he" ? normHe(plain) : normEn(plain));
  }
}

/** Заменяет только таблицу спряжения иврита, не трогая прочие формы. */
export function replaceConjForms(wordId: number, forms: WordForm[]) {
  db.prepare(`DELETE FROM forms WHERE word_id = ? AND lang = 'he' AND tense IN (${CONJ_TENSES.map((t) => `'${t}'`).join(",")})`).run(wordId);
  const st = db.prepare("INSERT INTO forms(word_id, lang, tense, person, form, nikud, norm) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const f of forms) {
    const plain = stripNikud(f.form || f.nikud);
    if (plain) st.run(wordId, "he", f.tense, f.person, plain, f.nikud || plain, normHe(plain));
  }
}

/** Сливает черновик в существующую карточку: добавляет язык изучения, недостающие поля, формы и примеры. */
export function mergeInto(id: number, d: Partial<WordDraft>) {
  const w = getWord(id);
  if (!w) return;
  const patch: Record<string, unknown> = {};
  const fields = ["he", "he_nikud", "ru", "en", "translit", "ru_alt", "en_alt", "root", "binyan", "gender", "plural", "plural_nikud", "notes", "mnemonic"] as const;
  for (const f of fields) if (!(w as any)[f] && (d as any)[f]) patch[f] = (d as any)[f];
  if (w.pos === "other" && d.pos) patch.pos = d.pos;
  if (!w.gizra.length && d.gizra?.length) patch.gizra = d.gizra;
  const study = [...new Set([...w.study, ...(d.study || [])])];
  if (study.length !== w.study.length) patch.study = study;
  if (d.tags?.length) patch.tags = [...new Set([...w.tags, ...d.tags])];
  const existing = getForms(id);
  const forms = [...(d.he_forms || []), ...(d.en_forms || [])].filter((f) => !existing.some((e) => e.lang === f.lang));
  const st = db.prepare("INSERT INTO forms(word_id, lang, tense, person, form, nikud, norm) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const f of forms) {
    const plain = f.lang === "he" ? stripNikud(f.form || f.nikud) : f.form;
    if (plain) st.run(id, f.lang, f.tense || "", f.person || "", plain, f.nikud || plain, f.lang === "he" ? normHe(plain) : normEn(plain));
  }
  if (forms.some((f) => f.lang === "he" && CONJ_TENSES.includes(f.tense))) db.prepare("UPDATE words SET conj_status = 'ready' WHERE id = ?").run(id);
  const exLangs = new Set(getExamples(id).map((e) => e.lang));
  addExamples(id, (d.examples || []).filter((e) => !exLangs.has(e.lang)));
  updateWord(id, patch as Partial<Word>);
}

export function addExamples(wordId: number, examples: Example[]) {
  const st = db.prepare("INSERT INTO examples(word_id, lang, text, text_nikud, target, ru) VALUES (?, ?, ?, ?, ?, ?)");
  for (const e of examples) {
    if (!e.text) continue;
    const text = e.lang === "he" ? stripNikud(e.text) : e.text;
    let target = e.lang === "he" ? stripNikud(e.target || "") : e.target || "";
    if (target && !text.includes(target)) target = "";
    st.run(wordId, e.lang, text, e.text_nikud || "", target, e.ru || "");
  }
}

// ───────────────────────── поиск и дубликаты ─────────────────────────

export interface SearchHit {
  word: WordSummary;
  match: "exact" | "form" | "prefix" | "partial";
  via?: string;
}

export function search(q: string, limit = 30): SearchHit[] {
  const lang = detectLang(q);
  if (!lang) return [];
  const hits = new Map<number, SearchHit["match"]>();
  const via = new Map<number, string>();
  const put = (id: number, m: SearchHit["match"], v?: string) => {
    const order = { exact: 0, form: 1, prefix: 2, partial: 3 };
    const cur = hits.get(id);
    if (!cur || order[m] < order[cur]) {
      hits.set(id, m);
      if (v) via.set(id, v);
    }
  };
  const col = lang === "he" ? "norm_he" : lang === "ru" ? "norm_ru" : "norm_en";
  const n = lang === "he" ? normHe(q) : lang === "ru" ? normRu(q) : normEn(q);
  if (!n) return [];
  for (const r of db.prepare(`SELECT id FROM words WHERE ${col} LIKE ?`).all(`%|${n}|%`) as Row[]) put(r.id, "exact");
  if (lang === "he" || lang === "en") {
    const cands = lang === "he" ? hePrefixCandidates(q) : enLemmaCandidates(q);
    for (const c of cands) {
      for (const r of db.prepare(`SELECT id FROM words WHERE ${col} LIKE ?`).all(`%|${c}|%`) as Row[]) put(r.id, c === n ? "exact" : "form", c);
      for (const r of db.prepare("SELECT word_id, form FROM forms WHERE norm = ? AND lang = ?").all(c, lang) as Row[])
        put(r.word_id, "form", r.form);
    }
  }
  for (const r of db.prepare(`SELECT id FROM words WHERE ${col} LIKE ? LIMIT 60`).all(`%|${n}%`) as Row[]) put(r.id, "prefix");
  if (n.length >= 2)
    for (const r of db.prepare(`SELECT id FROM words WHERE ${col} LIKE ? LIMIT 60`).all(`%${n}%`) as Row[]) put(r.id, "partial");
  const ids = [...hits.keys()];
  const words = ids.map((id) => getWord(id)!).filter(Boolean);
  const sum = summaries(words);
  const order = { exact: 0, form: 1, prefix: 2, partial: 3 };
  return sum
    .map((w) => ({ word: w, match: hits.get(w.id)!, via: via.get(w.id) }))
    .sort((a, b) => order[a.match] - order[b.match] || a.word.he.length - b.word.he.length)
    .slice(0, limit);
}

/** Ищет уже существующие слова, совпадающие с черновиком.
 *  Иврит сравнивается по лемме и формам; английский и русский — только по главному переводу
 *  (иначе «go» склеился бы с «ехать», у которого среди значений есть «go»). */
export function findDuplicates(d: Partial<WordDraft>): SearchHit[] {
  const out = new Map<number, SearchHit>();
  const he = d.he || stripNikud(d.he_nikud || "");
  if (he) for (const h of search(he, 10)) if (h.match === "exact" || h.match === "form") out.set(h.word.id, h);
  const primary = (col: "en" | "ru", value: string | undefined) => {
    if (!value) return;
    const n = col === "en" ? normEn(value) : normRu(value);
    if (!n) return;
    const rows = db.prepare(`SELECT * FROM words WHERE norm_${col} LIKE ?`).all(`%|${n}|%`) as Row[];
    for (const r of rows) {
      const w = rowToWord(r);
      const main = col === "en" ? normEn(w.en) : normRu(w.ru);
      if (main === n && !out.has(w.id)) out.set(w.id, { word: summaries([w])[0], match: "exact" });
    }
  };
  if (d.input_lang === "en" || !he) primary("en", d.en);
  if (!he && !d.en) primary("ru", d.ru);
  return [...out.values()];
}

/** Быстрый локальный поиск леммы по словоформе (для читалки и дневника). */
export function lookupToken(token: string): { id: number; via: string } | null {
  const lang = detectLang(token);
  if (lang === "he") {
    for (const c of hePrefixCandidates(token)) {
      const w = db.prepare("SELECT id FROM words WHERE norm_he LIKE ? LIMIT 1").get(`%|${c}|%`) as Row | undefined;
      if (w) return { id: w.id, via: c };
      const f = db.prepare("SELECT word_id FROM forms WHERE norm = ? AND lang = 'he' LIMIT 1").get(c) as Row | undefined;
      if (f) return { id: f.word_id, via: c };
    }
  } else if (lang === "en") {
    for (const c of enLemmaCandidates(token)) {
      const w = db.prepare("SELECT id FROM words WHERE norm_en LIKE ? LIMIT 1").get(`%|${c}|%`) as Row | undefined;
      if (w) return { id: w.id, via: c };
      const f = db.prepare("SELECT word_id FROM forms WHERE norm = ? AND lang = 'en' LIMIT 1").get(c) as Row | undefined;
      if (f) return { id: f.word_id, via: c };
    }
  }
  return null;
}

// ───────────────────────── список ─────────────────────────

export function listWords(opts: { lang?: string; pos?: string; root?: string; tag?: string; sort?: string } = {}): WordSummary[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.pos) {
    where.push("pos = ?");
    args.push(opts.pos);
  }
  if (opts.root) {
    where.push("root = ?");
    args.push(opts.root);
  }
  if (opts.lang === "he" || opts.lang === "en") {
    where.push("study LIKE ?");
    args.push(`%"${opts.lang}"%`);
  }
  if (opts.tag) {
    where.push("tags LIKE ?");
    args.push(`%"${opts.tag}"%`);
  }
  const sql = `SELECT * FROM words ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`;
  const words = (db.prepare(sql).all(...args) as Row[]).map(rowToWord);
  return summaries(words);
}

// ───────────────────────── повторения ─────────────────────────

export function getFacet(wordId: number, lang: string, facet: string): FacetState | null {
  const r = db.prepare("SELECT * FROM facets WHERE word_id = ? AND lang = ? AND facet = ?").get(wordId, lang, facet) as Row | undefined;
  return r ? (r as FacetState) : null;
}

function saveFacet(wordId: number, lang: string, f: FacetState) {
  db.prepare(
    `UPDATE facets SET state=?, stability=?, difficulty=?, due=?, last=?, reps=?, lapses=? WHERE word_id=? AND lang=? AND facet=?`,
  ).run(f.state, f.stability, f.difficulty, f.due, f.last, f.reps, f.lapses, wordId, lang, f.facet);
}

export interface ReviewResult {
  unlocked: string[];
  stageBefore: number;
  stageAfter: number;
  masteryBefore: number;
  masteryAfter: number;
}

export function applyReview(r: {
  word_id: number;
  lang: StudyLang;
  facet: Facet;
  grade: Grade;
  mode: string;
  ms?: number;
  confidence?: number | null;
  correct?: boolean;
  practice?: boolean;
  detail?: unknown;
  also?: { facet: Facet; grade: Grade }[];
}): ReviewResult {
  const now = Date.now();
  const before = getSummary(r.word_id, now);
  const pBefore = before?.progress.find((p) => p.lang === r.lang);
  const settings = getSettings();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO reviews(ts, word_id, lang, facet, grade, mode, ms, confidence, correct, practice, detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      now,
      r.word_id,
      r.lang,
      r.facet,
      r.grade,
      r.mode,
      r.ms ?? null,
      r.confidence ?? null,
      r.correct === undefined ? (r.grade > 1 ? 1 : 0) : r.correct ? 1 : 0,
      r.practice ? 1 : 0,
      r.detail ? JSON.stringify(r.detail) : null,
    );
    if (r.practice) return;
    const apply = (facet: Facet, grade: Grade, implicit: boolean) => {
      let f = getFacet(r.word_id, r.lang, facet);
      if (!f) return;
      // неявная проверка: засчитываем, только если грань уже «проголодалась»
      if (implicit && f.state === "review" && f.due > now && grade > 1) return;
      if (f.state === "locked" && !implicit) f = { ...f, state: "new" };
      if (f.state === "locked") return;
      saveFacet(r.word_id, r.lang, schedule(f, grade, now, settings.retention));
    };
    apply(r.facet, r.grade, false);
    for (const a of r.also || []) apply(a.facet, a.grade, true);
  });
  tx();
  const unlocked = refreshUnlocks(r.word_id, r.lang);
  const after = getSummary(r.word_id, now);
  const pAfter = after?.progress.find((p) => p.lang === r.lang);
  if (pBefore && pAfter && pAfter.stage > pBefore.stage && pAfter.stage >= 3) {
    const names = ["", "", "", "стало деревцем", "выросло в дерево", "укоренилось"];
    addMoment("stage", r.word_id, `${after!.he || after!.en} ${names[pAfter.stage]}`);
  }
  return {
    unlocked,
    stageBefore: pBefore?.stage ?? 0,
    stageAfter: pAfter?.stage ?? 0,
    masteryBefore: pBefore?.mastery ?? 0,
    masteryAfter: pAfter?.mastery ?? 0,
  };
}

export function recordConfusion(a: number, b: number) {
  if (a === b) return;
  const [x, y] = a < b ? [a, b] : [b, a];
  db.prepare(
    "INSERT INTO confusions(a, b, count, last) VALUES (?, ?, 1, ?) ON CONFLICT(a, b) DO UPDATE SET count = count + 1, last = excluded.last",
  ).run(x, y, Date.now());
}

export function addMoment(kind: string, wordId: number | null, text: string) {
  db.prepare("INSERT INTO moments(ts, kind, word_id, text) VALUES (?, ?, ?, ?)").run(Date.now(), kind, wordId, text);
}

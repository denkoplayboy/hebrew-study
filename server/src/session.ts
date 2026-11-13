import { db, getSettings } from "./db.js";
import { getExamples, getForms, getWord, summaries, rowToWord } from "./words.js";
import { facetStrength, retrievability, DAY, type Facet } from "../../shared/memory.js";
import type { ExerciseItem, WordForm, WordSummary } from "../../shared/types.js";
import type { StudyLang } from "../../shared/lang.js";

type Row = Record<string, any>;

interface Cand {
  word_id: number;
  lang: StudyLang;
  facet: Facet;
  state: string;
  stability: number;
  last: number;
  reps: number;
  due: number;
  R: number;
  strength: number;
}

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function startOfDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function introducedToday(): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (SELECT word_id, MIN(ts) AS first FROM reviews WHERE facet IN ('recognize') GROUP BY word_id, lang) WHERE first >= ?`,
    )
    .get(startOfDay()) as { c: number };
  return r.c;
}

function candidates(lang: string | undefined, facets?: Facet[]): Cand[] {
  const now = Date.now();
  const where: string[] = ["f.state <> 'locked'"];
  const args: unknown[] = [];
  if (lang === "he" || lang === "en") {
    where.push("f.lang = ?");
    args.push(lang);
  }
  if (facets?.length) where.push(`f.facet IN (${facets.map((f) => `'${f}'`).join(",")})`);
  const rows = db.prepare(`SELECT f.* FROM facets f WHERE ${where.join(" AND ")}`).all(...args) as Row[];
  return rows.map((r) => ({
    word_id: r.word_id,
    lang: r.lang,
    facet: r.facet,
    state: r.state,
    stability: r.stability,
    last: r.last,
    reps: r.reps,
    due: r.due,
    R: r.reps ? retrievability((now - r.last) / DAY, r.stability) : 0,
    strength: facetStrength(r as any, now),
  }));
}

const cache = new Map<number, WordSummary>();
function summary(id: number): WordSummary {
  if (!cache.has(id)) {
    const w = getWord(id);
    if (w) cache.set(id, summaries([w])[0]);
  }
  return cache.get(id)!;
}

function pool(lang: StudyLang): WordSummary[] {
  const rows = db.prepare("SELECT * FROM words WHERE study LIKE ?").all(`%"${lang}"%`) as Row[];
  return rows.map(rowToWord) as WordSummary[];
}

function labelFor(w: { he: string; he_nikud: string; en: string; ru: string }, lang: StudyLang, side: "target" | "ru") {
  if (side === "ru") return w.ru;
  return lang === "he" ? w.he_nikud || w.he : w.en;
}

function distractors(word: WordSummary, lang: StudyLang, side: "target" | "ru", n = 3) {
  const all = pool(lang).filter((w) => w.id !== word.id && (side === "ru" ? w.ru : lang === "he" ? w.he : w.en));
  const confused = db
    .prepare("SELECT CASE WHEN a = ? THEN b ELSE a END AS other FROM confusions WHERE a = ? OR b = ? ORDER BY count DESC LIMIT 2")
    .all(word.id, word.id, word.id) as { other: number }[];
  const picked: typeof all = [];
  for (const c of confused) {
    const w = all.find((x) => x.id === c.other);
    if (w) picked.push(w);
  }
  const samePos = shuffle(all.filter((w) => w.pos === word.pos && !picked.includes(w)));
  const rest = shuffle(all.filter((w) => w.pos !== word.pos && !picked.includes(w)));
  for (const w of [...samePos, ...rest]) {
    if (picked.length >= n) break;
    const l = labelFor(w, lang, side);
    if (l && l !== labelFor(word, lang, side) && !picked.some((p) => labelFor(p, lang, side) === l)) picked.push(w);
  }
  const opts = [word, ...picked].map((w) => ({
    id: w.id,
    label: labelFor(w, lang, side),
    sub: side === "target" && lang === "he" ? w.translit : undefined,
  }));
  return shuffle(opts);
}

function weakForm(wordId: number, lang: StudyLang, tenses?: string[]): WordForm | null {
  let forms = getForms(wordId).filter((f) => f.lang === lang);
  const allowed = tenses?.length ? tenses : lang === "en" ? ["past", "pp"] : ["past", "present", "future", "imperative", "infinitive"];
  forms = forms.filter((f) => allowed.includes(f.tense));
  if (!forms.length) return null;
  // ошибки по клеткам таблицы
  const errs = db
    .prepare("SELECT detail, correct FROM reviews WHERE word_id = ? AND facet = 'conjugate' ORDER BY ts DESC LIMIT 60")
    .all(wordId) as { detail: string; correct: number }[];
  const weight = new Map<string, number>();
  for (const e of errs) {
    try {
      const d = JSON.parse(e.detail || "{}");
      const k = `${d.tense}:${d.person}`;
      weight.set(k, (weight.get(k) || 0) + (e.correct ? -0.5 : 2));
    } catch {
      /* noop */
    }
  }
  const scored = forms.map((f) => ({ f, w: Math.max(0.3, 1 + (weight.get(`${f.tense}:${f.person}`) || 0)) * Math.random() }));
  scored.sort((a, b) => b.w - a.w);
  return scored[0].f;
}

function clozeExample(wordId: number, lang: StudyLang) {
  const ex = getExamples(wordId).filter((e) => e.lang === lang && e.target);
  return ex.length ? ex[Math.floor(Math.random() * ex.length)] : null;
}

/** Превращает «грань к повторению» в конкретное упражнение. */
function toItem(c: Cand, opts: { preferKind?: ExerciseItem["kind"]; tenses?: string[] } = {}): ExerciseItem | null {
  const word = summary(c.word_id);
  if (!word) return null;
  const base = { key: `${c.word_id}:${c.lang}:${c.facet}:${Math.random().toString(36).slice(2, 7)}`, lang: c.lang, facet: c.facet, word };
  switch (c.facet) {
    case "recognize": {
      if (opts.preferKind === "flash" || (c.reps < 2 && opts.preferKind !== "choice")) return { ...base, kind: "flash", direction: "to_ru" };
      const dir = Math.random() < 0.6 ? "to_ru" : "to_target";
      return { ...base, kind: "choice", direction: dir, options: distractors(word, c.lang, dir === "to_ru" ? "ru" : "target") };
    }
    case "listen":
      return { ...base, kind: "listen", options: distractors(word, c.lang, "ru") };
    case "recall":
    case "spell":
      return { ...base, kind: "recall", direction: "to_target" };
    case "context": {
      const ex = clozeExample(c.word_id, c.lang);
      if (!ex) return { ...base, facet: "recall", kind: "recall", direction: "to_target" };
      return { ...base, kind: "cloze", example: ex };
    }
    case "produce":
      return { ...base, kind: "produce" };
    case "conjugate": {
      const form = weakForm(c.word_id, c.lang, opts.tenses);
      if (!form) return null;
      return { ...base, kind: "conjugate", form, forms: getForms(c.word_id).filter((f) => f.lang === c.lang) };
    }
  }
  return null;
}

/** Расставляет упражнения так, чтобы одно слово не шло подряд. */
function interleave(items: ExerciseItem[]): ExerciseItem[] {
  const out: ExerciseItem[] = [];
  const rest = [...items];
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = rest.findIndex((x) => !prev || x.word.id !== prev.word.id);
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

export interface SessionOpts {
  mode: string;
  lang?: string;
  size?: number;
  binyanim?: string[];
  tenses?: string[];
  gizra?: string[];
  wordId?: number;
}

export function buildSession(o: SessionOpts): { items: ExerciseItem[]; note?: string } {
  cache.clear();
  const settings = getSettings();
  const size = Math.max(4, Math.min(60, o.size || settings.sessionSize));
  const now = Date.now();
  const lang = o.lang === "he" || o.lang === "en" ? o.lang : undefined;

  const pick = (facets: Facet[] | undefined, kind?: ExerciseItem["kind"], allowNew = true) => {
    let cs = candidates(lang, facets);
    if (!allowNew) cs = cs.filter((c) => c.reps > 0);
    const due = cs.filter((c) => c.reps > 0 && c.due <= now).sort((a, b) => a.R - b.R);
    const fresh = cs.filter((c) => c.reps === 0);
    const extra = cs.filter((c) => c.reps > 0 && c.due > now).sort((a, b) => a.strength - b.strength);
    return { due, fresh, extra, kind };
  };

  const fromCands = (list: Cand[], kind?: ExerciseItem["kind"], limit = size, facetCap = Infinity) => {
    const items: ExerciseItem[] = [];
    const perWord = new Map<string, number>();
    const perFacet = new Map<string, number>();
    const skipped: Cand[] = [];
    for (const c of list) {
      if (items.length >= limit) break;
      const k = `${c.word_id}:${c.lang}`;
      if ((perWord.get(k) || 0) >= 2) continue;
      if ((perFacet.get(c.facet) || 0) >= facetCap) {
        skipped.push(c);
        continue;
      }
      perFacet.set(c.facet, (perFacet.get(c.facet) || 0) + 1);
      const it = toItem(c, { preferKind: kind, tenses: o.tenses });
      if (!it) continue;
      perWord.set(k, (perWord.get(k) || 0) + 1);
      items.push(it);
    }
    // если из-за ограничения по навыкам не набрали — добираем пропущенными
    for (const c of skipped) {
      if (items.length >= limit) break;
      const k = `${c.word_id}:${c.lang}`;
      if ((perWord.get(k) || 0) >= 2) continue;
      const it = toItem(c, { preferKind: kind, tenses: o.tenses });
      if (!it) continue;
      perWord.set(k, (perWord.get(k) || 0) + 1);
      items.push(it);
    }
    return items;
  };

  switch (o.mode) {
    case "mix": {
      const { due, fresh } = pick(undefined);
      // свежеоткрытые грани (вспоминание, контекст...) — это тоже «полив»
      const unlockedFresh = fresh.filter((c) => c.facet !== "recognize" && c.facet !== "listen");
      // разнообразие: один навык — не больше ~трети полива
      const reviewItems = fromCands([...due, ...shuffle(unlockedFresh)], undefined, size, Math.max(3, Math.ceil(size * 0.35)));
      // объединяем вспоминание и написание одного слова
      const seen = new Set<string>();
      const merged = reviewItems.filter((it) => {
        if (it.kind !== "recall") return true;
        const k = `${it.word.id}:${it.lang}:recall`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const room = Math.max(0, settings.newPerDay - introducedToday());
      const newWords = fresh
        .filter((c) => c.facet === "recognize")
        .sort((a, b) => a.word_id - b.word_id)
        .slice(0, Math.min(room, 6, Math.max(2, size - merged.length)));
      const intros: ExerciseItem[] = [];
      const followUps: ExerciseItem[] = [];
      for (const c of newWords) {
        const w = summary(c.word_id);
        if (!w) continue;
        intros.push({ key: `intro:${c.word_id}:${c.lang}`, kind: "intro", lang: c.lang, facet: "recognize", word: w, isNew: true });
        followUps.push({
          key: `fu:${c.word_id}:${c.lang}`,
          kind: "choice",
          lang: c.lang,
          facet: "recognize",
          word: w,
          direction: "to_ru",
          options: distractors(w, c.lang, "ru"),
        });
      }
      const reviews = interleave(shuffle(merged)).slice(0, Math.max(0, size - intros.length * 2));
      // знакомство → через пару шагов проверка этого же слова; повторения вплетаются между ними
      const seq: ExerciseItem[] = [];
      intros.forEach((it, i) => {
        seq.push(it);
        if (i >= 1) seq.push(followUps[i - 1]);
      });
      if (followUps.length) seq.push(followUps[followUps.length - 1]);
      const items: ExerciseItem[] = [];
      const step = seq.length ? Math.max(1, Math.ceil(reviews.length / seq.length)) : 0;
      let ri = 0;
      for (const s of seq) {
        items.push(s);
        for (let k = 0; k < step && ri < reviews.length; k++) items.push(reviews[ri++]);
      }
      while (ri < reviews.length) items.push(reviews[ri++]);
      const note =
        items.length === 0
          ? "Сад полит: повторять нечего. Добавь новые слова или потренируйся в свободном режиме."
          : undefined;
      return { items, note };
    }
    case "flash": {
      const { due, fresh, extra } = pick(["recognize"], "flash");
      return { items: fromCands([...due, ...fresh, ...extra], "flash") };
    }
    case "choice": {
      const { due, extra } = pick(["recognize", "listen"], "choice", false);
      const items = fromCands([...due, ...extra].map((c) => ({ ...c, facet: "recognize" as Facet })), "choice");
      return { items: shuffle(items), note: items.length ? undefined : "Сначала познакомься со словами в карточках." };
    }
    case "listen": {
      const { due, extra } = pick(["listen"], "listen", false);
      const items = fromCands([...due, ...extra]);
      return { items, note: items.length ? undefined : "Сначала познакомься со словами в карточках." };
    }
    case "recall": {
      const { due, fresh, extra } = pick(["recall", "spell"]);
      const items = fromCands([...due, ...fresh, ...extra]);
      const uniq = new Map<string, ExerciseItem>();
      for (const it of items) if (!uniq.has(`${it.word.id}:${it.lang}`)) uniq.set(`${it.word.id}:${it.lang}`, it);
      return { items: [...uniq.values()], note: uniq.size ? undefined : "Вспоминание открывается, когда слово хотя бы раз узнано в карточках." };
    }
    case "context": {
      const { due, fresh, extra } = pick(["context"]);
      const items = fromCands([...due, ...fresh, ...extra]).filter((i) => i.kind === "cloze");
      return { items, note: items.length ? undefined : "Контекст открывается после вспоминания; нужны примеры предложений у слов." };
    }
    case "produce": {
      const { due, fresh, extra } = pick(["produce"]);
      const items = fromCands([...due, ...fresh, ...extra], undefined, Math.min(size, 8));
      return { items, note: items.length ? undefined : "Употребление открывается, когда слово уверенно вспоминается (2+ раза)." };
    }
    case "conjugate":
    case "analyze": {
      const conjTenses = o.lang === "en" ? ["past", "pp"] : ["past", "present", "future", "imperative", "infinitive"];
      let verbs = db
        .prepare(
          `SELECT DISTINCT w.* FROM words w JOIN forms f ON f.word_id = w.id WHERE f.lang = ? AND f.tense IN (${conjTenses.map(() => "?").join(",")}) AND w.study LIKE ?`,
        )
        .all(o.lang === "en" ? "en" : "he", ...conjTenses, `%"${o.lang === "en" ? "en" : "he"}"%`) as Row[];
      if (o.binyanim?.length) verbs = verbs.filter((v) => o.binyanim!.includes(v.binyan));
      if (o.gizra?.length) verbs = verbs.filter((v) => (JSON.parse(v.gizra || "[]") as string[]).some((g) => o.gizra!.includes(g)));
      if (!verbs.length) return { items: [], note: "Нет глаголов под выбранные фильтры. Добавь глаголы или импортируй набор «Опорные глаголы»." };
      const l: StudyLang = o.lang === "en" ? "en" : "he";
      const items: ExerciseItem[] = [];
      const facetOf = (id: number) =>
        db.prepare("SELECT * FROM facets WHERE word_id = ? AND lang = ? AND facet = 'conjugate'").get(id, l) as Row | undefined;
      const scored = verbs.map((v) => {
        const f = facetOf(v.id);
        const s = f ? facetStrength(f as any, now) : 0;
        return { v, w: (1.2 - s) * (0.5 + Math.random()) };
      });
      scored.sort((a, b) => b.w - a.w);
      const used = new Set<string>();
      let guard = 0;
      let turn = 0;
      while (items.length < size && guard++ < size * 8) {
        const { v } = scored[turn++ % scored.length];
        const form = weakForm(v.id, l, o.tenses);
        if (!form) continue;
        const k = `${v.id}:${form.tense}:${form.person}`;
        if (used.has(k)) continue;
        used.add(k);
        const word = summary(v.id);
        items.push({
          key: `${o.mode}:${k}`,
          kind: o.mode === "analyze" ? "analyze" : "conjugate",
          lang: l,
          facet: "conjugate",
          word,
          form,
          forms: getForms(v.id).filter((f) => f.lang === l),
        });
      }
      return { items: shuffle(items) };
    }
    case "twins": {
      const pairs = db.prepare("SELECT a, b, count FROM confusions ORDER BY count DESC, last DESC LIMIT 12").all() as Row[];
      const items: ExerciseItem[] = [];
      for (const p of pairs) {
        for (const id of [p.a, p.b]) {
          const w = summary(id);
          if (!w) continue;
          const l = w.study[0];
          const other = summary(id === p.a ? p.b : p.a);
          const opts = distractors(w, l, "ru", 2);
          if (other && !opts.some((x) => x.id === other.id)) opts.splice(Math.floor(Math.random() * opts.length), 0, { id: other.id, label: other.ru, sub: undefined });
          items.push({ key: `tw:${id}:${p.a}:${p.b}`, kind: "choice", lang: l, facet: "recognize", word: w, direction: "to_ru", options: opts });
        }
      }
      return { items: items.slice(0, size), note: items.length ? undefined : "Пока нет пар-близнецов: они появятся, когда ты перепутаешь похожие слова." };
    }
    case "weak": {
      const cs = candidates(lang).filter((c) => c.reps > 0).sort((a, b) => a.strength - b.strength);
      return { items: interleave(fromCands(cs)) };
    }
    case "word": {
      if (!o.wordId) return { items: [] };
      const cs = candidates(undefined).filter((c) => c.word_id === o.wordId);
      const items: ExerciseItem[] = [];
      for (const c of cs) {
        const it = toItem(c, { preferKind: c.facet === "recognize" ? "choice" : undefined });
        if (it) items.push(it);
      }
      return { items };
    }
    case "match": {
      const all = candidates(lang, ["recognize"]).filter((c) => c.reps > 0).sort((a, b) => a.strength - b.strength);
      const items = all.slice(0, 18).map((c) => ({
        key: `m:${c.word_id}:${c.lang}`,
        kind: "choice" as const,
        lang: c.lang,
        facet: "recognize" as Facet,
        word: summary(c.word_id),
      }));
      return { items: shuffle(items).slice(0, 12), note: items.length >= 3 ? undefined : "Нужно хотя бы 3 знакомых слова." };
    }
  }
  return { items: [] };
}

/** Короткая сводка «что ждёт сегодня». */
export function todayCounts(lang?: string) {
  const now = Date.now();
  const cs = candidates(lang);
  const dueFacets = cs.filter((c) => c.reps > 0 && c.due <= now);
  const thirstyWords = new Set(dueFacets.map((c) => `${c.word_id}:${c.lang}`)).size;
  const newWaiting = cs.filter((c) => c.facet === "recognize" && c.reps === 0).length;
  const settings = getSettings();
  const room = Math.max(0, settings.newPerDay - introducedToday());
  const byFacet: Record<string, number> = {};
  for (const c of dueFacets) byFacet[c.facet] = (byFacet[c.facet] || 0) + 1;
  const freshFacets: Record<string, number> = {};
  for (const c of cs.filter((c) => c.reps === 0)) freshFacets[c.facet] = (freshFacets[c.facet] || 0) + 1;
  return { dueFacets: dueFacets.length, thirstyWords, newWaiting, newRoom: Math.min(room, newWaiting), byFacet, freshFacets };
}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, getSettings, saveSettings, DB_PATH } from "./db.js";
import {
  addExamples,
  applyReview,
  createWord,
  deleteWord,
  ensureFacets,
  findDuplicates,
  getFull,
  getSummary,
  getWord,
  listWords,
  lookupToken,
  recordConfusion,
  replaceConjForms,
  mergeInto,
  search,
  summaries,
  rowToWord,
  updateWord,
  addMoment,
  getFacet,
} from "./words.js";
import {
  aiEnabled,
  aiInfo,
  analyzeWord,
  AIError,
  AI_MODELS,
  checkSentence,
  conjugate,
  generatePack,
  glossText,
  makeExamples,
  reviewJournal,
  type AIConfig,
  type UsageInfo,
} from "./ai.js";
import { buildSession, todayCounts } from "./session.js";
import { fullStats, gardenStats, rhythm, rootsGarden } from "./stats.js";
import { getPack, importWords, listPacks, loadContent, savePack } from "./content.js";
import { detectLang, normHe, stripNikud, tokenize, type StudyLang } from "../../shared/lang.js";
import type { ReviewInput, WordDraft } from "../../shared/types.js";
import type { Grade } from "../../shared/memory.js";

type Row = Record<string, any>;

loadContent();

const app = new Hono();

// ───────────────────────── доступ по паролю ─────────────────────────
const PASSWORD = process.env.APP_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update("shoresh:" + PASSWORD).digest("hex");
const TOKEN = crypto.createHmac("sha256", SECRET).update("ok").digest("hex");

app.use("/api/*", async (c, next) => {
  const p = c.req.path;
  if (!PASSWORD || p === "/api/login" || p === "/api/me" || p === "/api/health") return next();
  if (getCookie(c, "shoresh") !== TOKEN) return c.json({ error: "auth" }, 401);
  return next();
});

app.onError((err, c) => {
  if (err instanceof AIError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: err.message || "Внутренняя ошибка" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/login", async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(PASSWORD);
  if (!PASSWORD || (a.length === b.length && crypto.timingSafeEqual(a, b))) {
    const https = c.req.url.startsWith("https") || c.req.header("x-forwarded-proto") === "https";
    setCookie(c, "shoresh", TOKEN, { httpOnly: true, sameSite: "Lax", secure: https, maxAge: 60 * 60 * 24 * 400, path: "/" });
    return c.json({ ok: true });
  }
  await new Promise((r) => setTimeout(r, 600));
  return c.json({ error: "Неверный пароль" }, 401);
});

app.post("/api/logout", (c) => {
  deleteCookie(c, "shoresh", { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/me", (c) => {
  const authed = !PASSWORD || getCookie(c, "shoresh") === TOKEN;
  return c.json({ authed, needsPassword: !!PASSWORD, ai: aiInfo(), settings: authed ? getSettings() : null });
});

// ───────────────────────── главная ─────────────────────────
app.get("/api/home", (c) => {
  const recent = (db.prepare("SELECT * FROM words ORDER BY created_at DESC LIMIT 8").all() as Row[]).map(rowToWord);
  const moments = db.prepare("SELECT * FROM moments ORDER BY ts DESC LIMIT 6").all();
  return c.json({
    garden: gardenStats(),
    today: todayCounts(),
    rhythm: rhythm(14),
    recent: summaries(recent),
    moments,
    settings: getSettings(),
  });
});

// ───────────────────────── словарь ─────────────────────────
app.get("/api/words", (c) => {
  const q = c.req.query();
  return c.json(listWords({ lang: q.lang, pos: q.pos, root: q.root, tag: q.tag }));
});

app.get("/api/search", (c) => {
  const q = c.req.query("q") || "";
  return c.json(search(q));
});

function manualDraft(input: string): WordDraft {
  const lang = detectLang(input) || "he";
  return {
    input,
    input_lang: lang,
    lemma_note: "",
    he: lang === "he" ? stripNikud(input).trim() : "",
    he_nikud: lang === "he" ? input.trim() : "",
    translit: "",
    ru: lang === "ru" ? input.trim() : "",
    ru_alt: "",
    en: lang === "en" ? input.trim() : "",
    en_alt: "",
    pos: "other",
    gender: null,
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

app.post("/api/words/analyze", async (c) => {
  const { input } = await c.req.json<{ input: string }>();
  const text = (input || "").trim();
  if (!text) return c.json({ error: "Пустой ввод" }, 400);
  const before = search(text).filter((h) => h.match === "exact" || h.match === "form");
  if (!aiEnabled()) return c.json({ draft: manualDraft(text), duplicates: before, ai: false });
  const draft = await analyzeWord(text);
  const dups = findDuplicates(draft);
  const all = new Map([...before, ...dups].map((h) => [h.word.id, h]));
  return c.json({ draft, duplicates: [...all.values()], ai: true });
});

const conjJobs = new Set<number>();
async function runConjugation(id: number, fresh = false) {
  const w = getWord(id);
  if (!w || conjJobs.has(id) || !aiEnabled()) return;
  conjJobs.add(id);
  db.prepare("UPDATE words SET conj_status = 'pending' WHERE id = ?").run(id);
  try {
    const r = await conjugate(w, { fresh });
    replaceConjForms(id, r.forms);
    const patch: Row = {};
    if (!w.gizra.length && r.gizra.length) patch.gizra = r.gizra;
    if (!w.root && r.root) patch.root = r.root;
    if (Object.keys(patch).length) updateWord(id, patch);
    db.prepare("UPDATE words SET conj_status = 'ready' WHERE id = ?").run(id);
    ensureFacets(id);
  } catch (e) {
    console.error("conjugation failed", e);
    db.prepare("UPDATE words SET conj_status = 'error' WHERE id = ?").run(id);
  } finally {
    conjJobs.delete(id);
  }
}

app.post("/api/words", async (c) => {
  const body = await c.req.json<{ draft: Partial<WordDraft>; force?: boolean }>();
  const d = body.draft;
  if (!d.he && !d.en && !d.ru) return c.json({ error: "Нужно хотя бы одно поле: иврит, английский или русский" }, 400);
  if (!body.force) {
    const dups = findDuplicates(d);
    if (dups.length) return c.json({ duplicates: dups }, 409);
  }
  const id = createWord({ ...d, source: aiEnabled() ? "ai" : "manual" });
  const w = getWord(id)!;
  if (w.pos === "verb" && w.he && !(d.he_forms || []).length) void runConjugation(id);
  return c.json({ id, word: getSummary(id) });
});

app.post("/api/words/:id/merge", async (c) => {
  const id = Number(c.req.param("id"));
  const { draft } = await c.req.json<{ draft: Partial<WordDraft> }>();
  mergeInto(id, draft);
  const w = getWord(id);
  if (w && w.pos === "verb" && w.he && w.conj_status !== "ready" && w.study.includes("he")) void runConjugation(id);
  return c.json(getFull(id));
});

app.get("/api/words/:id", (c) => {
  const w = getFull(Number(c.req.param("id")));
  return w ? c.json(w) : c.json({ error: "Не найдено" }, 404);
});

app.patch("/api/words/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const patch = await c.req.json();
  updateWord(id, patch);
  return c.json(getFull(id));
});

app.delete("/api/words/:id", (c) => {
  deleteWord(Number(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/api/words/:id/conjugate", async (c) => {
  const id = Number(c.req.param("id"));
  if (!aiEnabled()) return c.json({ error: "ИИ не подключён" }, 400);
  await runConjugation(id, true);
  return c.json(getFull(id));
});

app.post("/api/words/:id/examples", async (c) => {
  const id = Number(c.req.param("id"));
  const w = getWord(id);
  if (!w) return c.json({ error: "Не найдено" }, 404);
  for (const lang of w.study) addExamples(id, await makeExamples(w, lang));
  ensureFacets(id);
  return c.json(getFull(id));
});

// ───────────────────────── тренировки ─────────────────────────
app.get("/api/session", (c) => {
  const q = c.req.query();
  const list = (s?: string) => (s ? s.split(",").filter(Boolean) : undefined);
  return c.json(
    buildSession({
      mode: q.mode || "mix",
      lang: q.lang,
      size: q.size ? Number(q.size) : undefined,
      binyanim: list(q.binyanim),
      tenses: list(q.tenses),
      gizra: list(q.gizra),
      wordId: q.wordId ? Number(q.wordId) : undefined,
    }),
  );
});

app.post("/api/review", async (c) => {
  const r = await c.req.json<ReviewInput & { confusedWith?: number }>();
  if (r.confusedWith) recordConfusion(r.word_id, r.confusedWith);
  const given = (r.detail as Row | undefined)?.given as string | undefined;
  if (given && r.grade === 1) {
    const other = lookupToken(given);
    if (other && other.id !== r.word_id) recordConfusion(r.word_id, other.id);
  }
  const res = applyReview(r);
  return c.json(res);
});

/** Ищет в списке лемм слова из словаря. */
function matchLemmas(lemmas: { surface: string; lemma: string }[], lang: StudyLang): Map<number, string> {
  const found = new Map<number, string>();
  for (const l of lemmas) {
    const hit = search(l.lemma, 3).find((h) => (h.match === "exact" || h.match === "form") && h.word.study.includes(lang));
    if (hit) found.set(hit.word.id, l.surface);
    else {
      const t = lookupToken(l.surface);
      if (t) found.set(t.id, l.surface);
    }
  }
  return found;
}

function localLemmas(text: string, lang: StudyLang): Map<number, string> {
  const found = new Map<number, string>();
  for (const t of tokenize(text)) {
    if (!t.word) continue;
    const hit = lookupToken(t.t);
    if (hit) {
      const w = getWord(hit.id);
      if (w?.study.includes(lang)) found.set(hit.id, t.t);
    }
  }
  return found;
}

/** Засчитывает самостоятельное употребление слов. */
function creditSpontaneous(found: Map<number, string>, lang: StudyLang, mode: string, exclude: number[], invited: number[] = []) {
  const credited: { id: number; he: string; en: string; ru: string; surface: string; spontaneous: boolean; first: boolean }[] = [];
  for (const [id, surface] of found) {
    if (exclude.includes(id)) continue;
    const w = getWord(id);
    if (!w || !w.study.includes(lang)) continue;
    const spontaneous = !invited.includes(id);
    const before = getFacet(id, lang, "produce");
    const first = !!before && before.reps === 0;
    applyReview({
      word_id: id,
      lang,
      facet: "produce",
      grade: spontaneous ? 4 : 3,
      mode,
      correct: true,
      detail: { surface, spontaneous },
      also: [
        { facet: "recall", grade: 3 },
        { facet: "recognize", grade: 3 },
      ],
    });
    if (first && spontaneous) addMoment("spontaneous", id, `Впервые сам употребил ${w.he || w.en}`);
    credited.push({ id, he: w.he, en: w.en, ru: w.ru, surface, spontaneous, first });
  }
  return credited;
}

app.post("/api/produce/check", async (c) => {
  const { word_id, lang, sentence, ms, hinted } = await c.req.json<{ word_id: number; lang: StudyLang; sentence: string; ms?: number; hinted?: boolean }>();
  const w = getWord(word_id);
  if (!w) return c.json({ error: "Не найдено" }, 404);
  const target = lang === "he" ? w.he_nikud || w.he : w.en;
  const check = await checkSentence({ target, meaning: w.ru, lang, sentence });
  let grade: Grade = 1;
  if (check.uses_target && check.usage_correct) grade = check.grammar_ok && check.naturalness >= 4 && !hinted ? 4 : 3;
  if (hinted && grade > 2) grade = 2;
  const review = applyReview({
    word_id,
    lang,
    facet: "produce",
    grade,
    mode: "produce",
    ms,
    correct: grade > 1,
    detail: { sentence, corrected: check.corrected },
    also: grade > 1 ? [{ facet: "recall", grade: 3 }] : [],
  });
  const others = matchLemmas(check.other_lemmas.map((l) => ({ surface: l, lemma: l })), lang);
  const bonus = creditSpontaneous(others, lang, "produce-bonus", [word_id]);
  return c.json({ check, grade, review, bonus });
});

// ───────────────────────── дневник ─────────────────────────
const PROMPTS = {
  he: [
    "Что ты сделал сегодня утром? Опиши по порядку.",
    "Опиши место, где ты сейчас находишься.",
    "Что тебя удивило на этой неделе?",
    "Расскажи о человеке, с которым ты недавно говорил.",
    "Какие у тебя планы на выходные?",
    "Что бы ты изменил в своём районе?",
    "Опиши вчерашний ужин так, чтобы захотелось есть.",
    "Какой совет ты дал бы себе год назад?",
    "Что сложного в иврите лично для тебя?",
    "Опиши новость, которую ты сегодня услышал.",
  ],
  en: [
    "Describe your perfect weekend.",
    "What is something you learned recently?",
    "Write about a place you'd like to visit and why.",
    "Describe your morning routine.",
    "What would you tell a friend who is starting to learn Hebrew?",
    "Describe a film or series you like.",
  ],
};

app.get("/api/journal/prompt", (c) => {
  const lang = (c.req.query("lang") === "en" ? "en" : "he") as StudyLang;
  const list = PROMPTS[lang];
  const prompt = list[Math.floor(Math.random() * list.length)];
  // «приглашённые» слова — те, что пора употребить
  const now = Date.now();
  const invited = db
    .prepare(
      `SELECT w.* FROM facets f JOIN words w ON w.id = f.word_id WHERE f.lang = ? AND f.facet = 'produce' AND f.state <> 'locked'
       ORDER BY CASE WHEN f.reps = 0 THEN 0 WHEN f.due <= ? THEN 1 ELSE 2 END, f.due LIMIT 4`,
    )
    .all(lang, now) as Row[];
  let words = invited.map(rowToWord);
  if (words.length < 3) {
    const more = db
      .prepare(
        `SELECT w.* FROM facets f JOIN words w ON w.id = f.word_id WHERE f.lang = ? AND f.facet = 'recall' AND f.reps > 0 ORDER BY RANDOM() LIMIT ?`,
      )
      .all(lang, 4 - words.length) as Row[];
    words = [...words, ...more.map(rowToWord).filter((m) => !words.some((w) => w.id === m.id))];
  }
  return c.json({ prompt, lang, invited: summaries(words) });
});

app.get("/api/journal", (c) => {
  const rows = db.prepare("SELECT * FROM journal ORDER BY ts DESC LIMIT 50").all() as Row[];
  return c.json(rows.map((r) => ({ ...r, feedback: JSON.parse(r.feedback || "{}"), words_used: JSON.parse(r.words_used || "[]") })));
});

app.post("/api/journal", async (c) => {
  const { text, lang, prompt, invited } = await c.req.json<{ text: string; lang: StudyLang; prompt: string; invited?: number[] }>();
  if (!text?.trim()) return c.json({ error: "Пустой текст" }, 400);
  let feedback: Row = {};
  let found: Map<number, string>;
  if (aiEnabled()) {
    const r = await reviewJournal({ text, lang, prompt });
    feedback = r;
    found = matchLemmas(r.lemmas, lang);
    for (const [k, v] of localLemmas(text, lang)) if (!found.has(k)) found.set(k, v);
  } else {
    found = localLemmas(text, lang);
  }
  const credited = creditSpontaneous(found, lang, "journal", [], invited || []);
  const info = db
    .prepare("INSERT INTO journal(ts, lang, prompt, text, corrected, feedback, words_used) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(Date.now(), lang, prompt || "", text, (feedback.corrected as string) || "", JSON.stringify(feedback), JSON.stringify(credited));
  return c.json({ id: Number(info.lastInsertRowid), feedback, credited, ai: aiEnabled() });
});

app.delete("/api/journal/:id", (c) => {
  db.prepare("DELETE FROM journal WHERE id = ?").run(Number(c.req.param("id")));
  return c.json({ ok: true });
});

// ───────────────────────── читалка ─────────────────────────
app.post("/api/reader/analyze", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const toks = tokenize(text || "");
  const ids = new Set<number>();
  const tokens = toks.map((t) => {
    if (!t.word) return { t: t.t, word: false };
    const hit = lookupToken(t.t);
    if (hit) ids.add(hit.id);
    return { t: t.t, word: true, id: hit?.id ?? null };
  });
  const words = summaries([...ids].map((id) => getWord(id)!).filter(Boolean));
  return c.json({ tokens, words });
});

app.post("/api/reader/gloss", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  return c.json(await glossText(text));
});

// ───────────────────────── статистика и сад ─────────────────────────
app.get("/api/stats", (c) => c.json(fullStats()));
app.get("/api/roots", (c) => c.json(rootsGarden()));

// ───────────────────────── наборы упражнений ─────────────────────────
app.get("/api/packs", (c) => c.json(listPacks()));
app.get("/api/packs/:id", (c) => {
  const p = getPack(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "Не найдено" }, 404);
});
app.post("/api/packs/generate", async (c) => {
  const { topic, lang, count, useWords } = await c.req.json<{ topic: string; lang: "he" | "en"; count?: number; useWords?: boolean }>();
  if (!topic?.trim()) return c.json({ error: "Укажи тему" }, 400);
  let words: string[] | undefined;
  if (useWords) {
    words = (
      db.prepare("SELECT he, en FROM words WHERE study LIKE ? ORDER BY RANDOM() LIMIT 25").all(`%"${lang}"%`) as Row[]
    ).map((r) => (lang === "he" ? r.he : r.en));
  }
  const pack = await generatePack({ topic, lang, count: Math.min(20, Math.max(4, count || 10)), words });
  savePack(pack);
  return c.json(pack);
});
app.post("/api/packs/:id/run", async (c) => {
  const { score, total } = await c.req.json<{ score: number; total: number }>();
  db.prepare("INSERT INTO pack_runs(pack_id, ts, score, total) VALUES (?, ?, ?, ?)").run(c.req.param("id"), Date.now(), score, total);
  return c.json({ ok: true });
});
app.post("/api/packs/:id/import-words", (c) => {
  const p = getPack(c.req.param("id"));
  if (!p?.words?.length) return c.json({ error: "В наборе нет слов" }, 400);
  return c.json(importWords(p.words, "pack"));
});
app.delete("/api/packs/:id", (c) => {
  db.prepare("DELETE FROM packs WHERE id = ? AND source <> 'repo'").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ───────────────────────── расходы ИИ ─────────────────────────
const OP_LABELS: Record<string, string> = { analyze: "разбор слов и примеры", conjugate: "спряжения", check: "проверки и дневник" };

app.get("/api/ai/usage", (c) => {
  const now = Date.now();
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const sum = (from: number) =>
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost), 0) AS cost FROM ai_usage WHERE ts >= ? AND (tag IS NULL OR tag <> 'compare')").get(from) as Row;
  const byOp = (
    db
      .prepare(
        `SELECT op, model, COUNT(*) AS n, AVG(cost) AS avg, SUM(cost) AS total, AVG(input_tokens + cache_write_tokens + cache_read_tokens) AS avg_in,
          AVG(output_tokens) AS avg_out, SUM(cache_read_tokens) AS cache_read, SUM(input_tokens + cache_write_tokens + cache_read_tokens) AS all_in
         FROM ai_usage WHERE ts >= ? AND (tag IS NULL OR tag <> 'compare') GROUP BY op, model ORDER BY total DESC`,
      )
      .all(now - 30 * 86400000) as Row[]
  ).map((r) => ({ ...r, label: OP_LABELS[r.op] || r.op }));
  const words = (db.prepare("SELECT COUNT(*) AS n FROM words WHERE created_at >= ? AND source = 'ai'").get(now - 30 * 86400000) as Row).n;
  return c.json({ today: sum(day.getTime()), month: sum(now - 30 * 86400000), byOp, wordsAdded30: words });
});

/** Один и тот же разбор слова на нескольких моделях — чтобы сравнить качество и цену. */
app.post("/api/ai/compare", async (c) => {
  const { input, configs } = await c.req.json<{ input: string; configs: AIConfig[] }>();
  if (!input?.trim()) return c.json({ error: "Введи слово" }, 400);
  const allowed = new Set(AI_MODELS.map((m) => m.id));
  const list = (configs || []).filter((x) => allowed.has(x.model) && ["low", "medium", "high"].includes(x.effort)).slice(0, 5);
  const results = await Promise.all(
    list.map(async (cfg) => {
      let usage: UsageInfo | null = null;
      try {
        const draft = await analyzeWord(input, { override: cfg, fresh: true, tag: "compare", onUsage: (u) => (usage = u) });
        return { config: cfg, draft, usage };
      } catch (e) {
        return { config: cfg, error: (e as Error).message, usage };
      }
    }),
  );
  return c.json({ results });
});

// ───────────────────────── настройки и резервная копия ─────────────────────────
app.get("/api/settings", (c) => c.json(getSettings()));
app.put("/api/settings", async (c) => {
  saveSettings(await c.req.json());
  return c.json(getSettings());
});

const TABLES = ["words", "forms", "examples", "facets", "reviews", "confusions", "journal", "packs", "pack_runs", "settings", "moments"];

app.get("/api/export", (c) => {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  c.header("Content-Disposition", `attachment; filename="shoresh-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ app: "shoresh", version: 1, exported_at: Date.now(), data: dump });
});

app.post("/api/import", async (c) => {
  const body = await c.req.json<{ app: string; data: Record<string, Row[]> }>();
  if (body.app !== "shoresh" || !body.data) return c.json({ error: "Это не резервная копия Шореша" }, 400);
  // сохраняем копию текущей базы на всякий случай
  try {
    fs.copyFileSync(DB_PATH, DB_PATH + ".before-import");
  } catch {
    /* noop */
  }
  db.transaction(() => {
    db.pragma("foreign_keys = OFF");
    for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of TABLES) {
      for (const r of body.data[t] || []) {
        const keys = Object.keys(r).filter((k) => /^[a-z_]+$/.test(k));
        if (!keys.length) continue;
        db.prepare(`INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => r[k]));
      }
    }
    db.pragma("foreign_keys = ON");
  })();
  return c.json({ ok: true });
});

// ───────────────────────── статика (собранный фронтенд) ─────────────────────────
const WEB_DIR = process.env.WEB_DIR || path.resolve("dist/web");
app.use("/*", serveStatic({ root: path.relative(process.cwd(), WEB_DIR) || "." }));
app.get("*", (c) => {
  const index = path.join(WEB_DIR, "index.html");
  if (fs.existsSync(index)) return c.html(fs.readFileSync(index, "utf8"));
  return c.text("Фронтенд не собран: npm run build", 404);
});

const port = Number(process.env.PORT || 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Шореш слушает http://localhost:${info.port}  (ИИ: ${aiInfo().enabled ? aiInfo().model : "выключен"})`);
});

import { db } from "./db.js";
import { retrievability, DAY, facetStrength, FACETS, stageOf, masteryOf, type FacetState } from "../../shared/memory.js";
import { startOfDay, todayCounts } from "./session.js";

type Row = Record<string, any>;

function sumR(rows: Row[], facet: string, at: number) {
  let s = 0;
  for (const r of rows) if (r.facet === facet && r.reps > 0) s += retrievability((at - r.last) / DAY, r.stability);
  return s;
}

export function gardenStats() {
  const now = Date.now();
  const facets = db.prepare("SELECT * FROM facets").all() as Row[];
  const words = db.prepare("SELECT id, study FROM words").all() as Row[];
  const out: Record<string, unknown> = {};
  for (const lang of ["he", "en"] as const) {
    const fr = facets.filter((f) => f.lang === lang);
    const ids = words.filter((w) => (JSON.parse(w.study) as string[]).includes(lang)).map((w) => w.id);
    const byWord = new Map<number, Row[]>();
    for (const f of fr) {
      if (!byWord.has(f.word_id)) byWord.set(f.word_id, []);
      byWord.get(f.word_id)!.push(f);
    }
    const stages = [0, 0, 0, 0, 0, 0];
    const stages7 = [0, 0, 0, 0, 0, 0];
    for (const id of ids) {
      const fs = (byWord.get(id) || []) as unknown as FacetState[];
      const touched = fs.some((f) => f.reps > 0);
      stages[stageOf(masteryOf(fs, now), touched)]++;
      stages7[stageOf(masteryOf(fs, now + 7 * DAY), touched)]++;
    }
    const passive = sumR(fr, "recognize", now);
    const active = sumR(fr, "recall", now);
    const living = sumR(fr, "produce", now);
    out[lang] = {
      total: ids.length,
      stages,
      stages7,
      passive: Math.round(passive),
      active: Math.round(active),
      living: Math.round(living),
      passive7: Math.round(sumR(fr, "recognize", now + 7 * DAY)),
      active7: Math.round(sumR(fr, "recall", now + 7 * DAY)),
      today: todayCounts(lang),
    };
  }
  return out;
}

export function rhythm(days = 28) {
  const start = startOfDay() - (days - 1) * DAY;
  const rows = db.prepare("SELECT ts, ms FROM reviews WHERE ts >= ?").all(start) as Row[];
  const arr = Array.from({ length: days }, (_, i) => ({ day: start + i * DAY, count: 0, minutes: 0 }));
  for (const r of rows) {
    const i = Math.floor((r.ts - start) / DAY);
    if (arr[i]) {
      arr[i].count++;
      arr[i].minutes += Math.min(r.ms || 8000, 60000) / 60000;
    }
  }
  const active = arr.filter((d) => d.count > 0).length;
  return { days: arr.map((d) => ({ ...d, minutes: Math.round(d.minutes) })), consistency: active / days };
}

export function fullStats() {
  const now = Date.now();
  const facets = db.prepare("SELECT * FROM facets").all() as Row[];
  const facetSummary = FACETS.map((f) => {
    const rows = facets.filter((r) => r.facet === f.id);
    const open = rows.filter((r) => r.state !== "locked");
    const avg = open.length ? open.reduce((s, r) => s + facetStrength(r as any, now), 0) / open.length : 0;
    return {
      facet: f.id,
      locked: rows.length - open.length,
      open: open.length,
      practiced: rows.filter((r) => r.reps > 0).length,
      avg,
    };
  });

  const calib = [1, 2, 3].map((c) => {
    const r = db
      .prepare("SELECT COUNT(*) AS n, SUM(correct) AS ok FROM reviews WHERE confidence = ? AND ts >= ?")
      .get(c, now - 60 * DAY) as Row;
    return { confidence: c, n: r.n || 0, accuracy: r.n ? (r.ok || 0) / r.n : null };
  });

  const conjRows = db
    .prepare("SELECT detail, correct FROM reviews WHERE facet = 'conjugate' AND ts >= ?")
    .all(now - 90 * DAY) as Row[];
  const cells = new Map<string, { n: number; ok: number }>();
  const binyanCells = new Map<string, { n: number; ok: number }>();
  for (const r of conjRows) {
    try {
      const d = JSON.parse(r.detail || "{}");
      if (!d.tense) continue;
      const k = `${d.tense}:${d.person}`;
      const c = cells.get(k) || { n: 0, ok: 0 };
      c.n++;
      c.ok += r.correct ? 1 : 0;
      cells.set(k, c);
      if (d.binyan) {
        const b = binyanCells.get(d.binyan) || { n: 0, ok: 0 };
        b.n++;
        b.ok += r.correct ? 1 : 0;
        binyanCells.set(d.binyan, b);
      }
    } catch {
      /* noop */
    }
  }

  const leeches = db
    .prepare(
      `SELECT w.id, w.he, w.he_nikud, w.en, w.ru, SUM(f.lapses) AS lapses FROM facets f JOIN words w ON w.id = f.word_id
       GROUP BY w.id HAVING lapses >= 3 ORDER BY lapses DESC LIMIT 12`,
    )
    .all();

  const slow = db
    .prepare(
      `SELECT w.id, w.he, w.he_nikud, w.en, w.ru, AVG(r.ms) AS ms, COUNT(*) AS n FROM reviews r JOIN words w ON w.id = r.word_id
       WHERE r.correct = 1 AND r.ms IS NOT NULL AND r.facet IN ('recall','recognize') AND r.ts >= ?
       GROUP BY w.id HAVING n >= 2 ORDER BY ms DESC LIMIT 8`,
    )
    .all(now - 30 * DAY);

  const confusions = db
    .prepare(
      `SELECT c.count, a.id AS a_id, a.he AS a_he, a.en AS a_en, a.ru AS a_ru, b.id AS b_id, b.he AS b_he, b.en AS b_en, b.ru AS b_ru
       FROM confusions c JOIN words a ON a.id = c.a JOIN words b ON b.id = c.b ORDER BY c.count DESC LIMIT 10`,
    )
    .all();

  const heat = rhythm(16 * 7);
  const moments = db.prepare("SELECT * FROM moments ORDER BY ts DESC LIMIT 30").all();
  const totals = db
    .prepare("SELECT COUNT(*) AS reviews, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS ok FROM reviews")
    .get() as Row;
  const modes = db
    .prepare("SELECT mode, COUNT(*) AS n FROM reviews WHERE ts >= ? GROUP BY mode ORDER BY n DESC")
    .all(now - 30 * DAY);

  return {
    garden: gardenStats(),
    facets: facetSummary,
    calibration: calib,
    conjCells: [...cells.entries()].map(([k, v]) => ({ key: k, ...v })),
    binyanCells: [...binyanCells.entries()].map(([k, v]) => ({ binyan: k, ...v })),
    leeches,
    slow,
    confusions,
    heat,
    moments,
    totals,
    modes,
  };
}

/** Корни и их «побеги» для сада корней. */
export function rootsGarden() {
  const now = Date.now();
  const words = db.prepare("SELECT id, he, he_nikud, ru, pos, root, study FROM words WHERE root IS NOT NULL AND root <> '' ORDER BY root").all() as Row[];
  const facets = db.prepare("SELECT * FROM facets").all() as Row[];
  const byWord = new Map<number, Row[]>();
  for (const f of facets) {
    if (!byWord.has(f.word_id)) byWord.set(f.word_id, []);
    byWord.get(f.word_id)!.push(f);
  }
  const roots = new Map<string, { root: string; words: Row[]; strength: number }>();
  for (const w of words) {
    const fs = (byWord.get(w.id) || []).filter((f) => f.lang === "he") as unknown as FacetState[];
    const mastery = masteryOf(fs, now);
    const stage = stageOf(mastery, fs.some((f) => f.reps > 0));
    if (!roots.has(w.root)) roots.set(w.root, { root: w.root, words: [], strength: 0 });
    const r = roots.get(w.root)!;
    r.words.push({ id: w.id, he: w.he, he_nikud: w.he_nikud, ru: w.ru, pos: w.pos, stage, mastery });
    r.strength += mastery;
  }
  return [...roots.values()].sort((a, b) => b.words.length - a.words.length || b.strength - a.strength);
}

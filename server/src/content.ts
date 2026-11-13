import fs from "node:fs";
import path from "node:path";
import { db, getMeta, setMeta } from "./db.js";
import { createWord, findDuplicates, mergeInto } from "./words.js";
import type { Pack, WordDraft } from "../../shared/types.js";

// Папка content/ лежит в репозитории: сюда я (Claude) добавляю наборы упражнений и слова.
const CONTENT_DIR = process.env.CONTENT_DIR || path.resolve("content");

type Row = Record<string, any>;

function readJSON<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (e) {
    console.error("Не удалось прочитать", file, e);
    return null;
  }
}

function listJSON(dir: string): string[] {
  const full = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(full, f));
}

/** Импортирует слова, пропуская уже существующие. */
export function importWords(words: Partial<WordDraft>[], source: string) {
  let added = 0;
  const skipped: string[] = [];
  const ids: number[] = [];
  for (const w of words) {
    const dups = findDuplicates({ ...w, input_lang: w.input_lang || (w.he ? "he" : w.en ? "en" : "ru") });
    if (dups.length) {
      // то же понятие уже есть — дополняем карточку (например, добавляем английский к ивритской)
      mergeInto(dups[0].word.id, w);
      skipped.push(w.he || w.en || w.ru || "?");
      ids.push(dups[0].word.id);
      continue;
    }
    ids.push(createWord({ ...w, source }));
    added++;
  }
  return { added, skipped, ids };
}

export function loadContent() {
  // 1) наборы упражнений
  const upsert = db.prepare(
    `INSERT INTO packs(id, title, description, lang, level, source, data, created_at) VALUES (@id, @title, @description, @lang, @level, 'repo', @data, @now)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, lang = excluded.lang, level = excluded.level, data = excluded.data`,
  );
  for (const file of listJSON("packs")) {
    const p = readJSON<Pack>(file);
    if (!p?.id) continue;
    upsert.run({ id: p.id, title: p.title, description: p.description || "", lang: p.lang || "he", level: p.level || null, data: JSON.stringify(p), now: Date.now() });
  }

  // 2) стартовые и «входящие» слова — каждый файл импортируется один раз
  for (const dir of ["seed", "inbox"]) {
    for (const file of listJSON(dir)) {
      const key = `${dir}:${path.basename(file)}`;
      if (getMeta(key)) continue;
      const data = readJSON<{ words: Partial<WordDraft>[] }>(file);
      if (!data?.words) continue;
      const res = importWords(data.words, dir);
      setMeta(key, String(Date.now()));
      console.log(`Импорт ${key}: добавлено ${res.added}, пропущено ${res.skipped.length}`);
    }
  }
}

export function listPacks() {
  const rows = db.prepare("SELECT * FROM packs ORDER BY source = 'repo' DESC, created_at DESC").all() as Row[];
  const runs = db.prepare("SELECT pack_id, ts, score, total FROM pack_runs ORDER BY ts DESC").all() as Row[];
  return rows.map((r) => {
    const data = JSON.parse(r.data) as Pack;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      lang: r.lang,
      level: r.level,
      source: r.source,
      count: data.items?.filter((i) => i.type !== "info").length || 0,
      words: data.words?.length || 0,
      runs: runs.filter((x) => x.pack_id === r.id).slice(0, 5),
    };
  });
}

export function getPack(id: string): Pack | null {
  const r = db.prepare("SELECT * FROM packs WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  return { ...(JSON.parse(r.data) as Pack), id: r.id, source: r.source };
}

export function savePack(p: Pack) {
  db.prepare(
    "INSERT OR REPLACE INTO packs(id, title, description, lang, level, source, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(p.id, p.title, p.description, p.lang, p.level || null, p.source, JSON.stringify(p), Date.now());
}

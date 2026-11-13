import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, "shoresh.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 3000");

const MIGRATIONS: string[] = [
  // 1 — базовая схема
  `
  CREATE TABLE words (
    id INTEGER PRIMARY KEY,
    he TEXT NOT NULL DEFAULT '',
    he_nikud TEXT NOT NULL DEFAULT '',
    ru TEXT NOT NULL DEFAULT '',
    en TEXT NOT NULL DEFAULT '',
    ru_alt TEXT NOT NULL DEFAULT '',
    en_alt TEXT NOT NULL DEFAULT '',
    translit TEXT NOT NULL DEFAULT '',
    pos TEXT NOT NULL DEFAULT 'other',
    gender TEXT,
    plural TEXT,
    plural_nikud TEXT,
    root TEXT,
    binyan TEXT,
    gizra TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    mnemonic TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    study TEXT NOT NULL DEFAULT '["he"]',
    source TEXT NOT NULL DEFAULT 'manual',
    conj_status TEXT NOT NULL DEFAULT 'none',
    norm_he TEXT NOT NULL DEFAULT '',
    norm_ru TEXT NOT NULL DEFAULT '',
    norm_en TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX words_norm_he ON words(norm_he);
  CREATE INDEX words_norm_ru ON words(norm_ru);
  CREATE INDEX words_norm_en ON words(norm_en);
  CREATE INDEX words_root ON words(root);

  CREATE TABLE forms (
    id INTEGER PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    tense TEXT NOT NULL DEFAULT '',
    person TEXT NOT NULL DEFAULT '',
    form TEXT NOT NULL,
    nikud TEXT NOT NULL DEFAULT '',
    norm TEXT NOT NULL
  );
  CREATE INDEX forms_norm ON forms(norm);
  CREATE INDEX forms_word ON forms(word_id);

  CREATE TABLE examples (
    id INTEGER PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    text_nikud TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    ru TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX examples_word ON examples(word_id);

  CREATE TABLE facets (
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    facet TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'locked',
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 5,
    due INTEGER NOT NULL DEFAULT 0,
    last INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (word_id, lang, facet)
  );
  CREATE INDEX facets_due ON facets(state, due);

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    facet TEXT NOT NULL,
    grade INTEGER NOT NULL,
    mode TEXT NOT NULL,
    ms INTEGER,
    confidence INTEGER,
    correct INTEGER,
    practice INTEGER NOT NULL DEFAULT 0,
    detail TEXT
  );
  CREATE INDEX reviews_ts ON reviews(ts);
  CREATE INDEX reviews_word ON reviews(word_id);

  CREATE TABLE confusions (
    a INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    b INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    count INTEGER NOT NULL DEFAULT 1,
    last INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  );

  CREATE TABLE journal (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    lang TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    corrected TEXT NOT NULL DEFAULT '',
    feedback TEXT NOT NULL DEFAULT '{}',
    words_used TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE packs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'he',
    level TEXT,
    source TEXT NOT NULL DEFAULT 'repo',
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE pack_runs (
    id INTEGER PRIMARY KEY,
    pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE moments (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
    text TEXT NOT NULL
  );
  `,
  // 2 — учёт расходов ИИ и кэш ответов
  `
  CREATE TABLE ai_usage (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    op TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL,
    ms INTEGER,
    tag TEXT
  );
  CREATE INDEX ai_usage_ts ON ai_usage(ts);

  CREATE TABLE ai_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  `,
];

function migrate() {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
migrate();

// ───────── настройки ─────────
export type AIOp = "analyze" | "conjugate" | "check";
export interface AIProfile {
  model: string; // "" — модель по умолчанию (AI_MODEL)
  effort: "low" | "medium" | "high";
}

export interface Settings {
  aiProfile: Record<AIOp, AIProfile>;
  newPerDay: number;
  retention: number;
  sessionSize: number;
  confidenceBets: boolean;
  showNikud: boolean;
  keyboardMap: boolean;
  ttsRate: number;
}
export const DEFAULT_SETTINGS: Settings = {
  aiProfile: {
    analyze: { model: "", effort: "medium" },
    conjugate: { model: "", effort: "medium" },
    check: { model: "", effort: "low" },
  },
  newPerDay: 10,
  retention: 0.9,
  sessionSize: 20,
  confidenceBets: true,
  showNikud: true,
  keyboardMap: true,
  ttsRate: 0.9,
};

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore */
    }
  }
  // старые сохранения могли не содержать всех операций
  s.aiProfile = { ...DEFAULT_SETTINGS.aiProfile, ...((s.aiProfile as object) || {}) };
  return s as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const st = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) st.run(k, JSON.stringify(v));
  }
}

export function getMeta(key: string): string | null {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get("meta:" + key) as { value: string } | undefined;
  return r ? r.value : null;
}
export function setMeta(key: string, value: string) {
  db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("meta:" + key, value);
}

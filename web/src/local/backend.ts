/* Локальный «сервер» приложения: те же маршруты Hono, что и на сайте, работают прямо на телефоне.
   База — SQLite (sql.js) в памяти, файл shoresh.db в личной папке приложения; сохраняется
   через секунду после изменения и сразу, когда приложение уходит в фон.
   Ключ Claude — в защищённом хранилище телефона (Keychain / Keystore), запросы идут напрямую в Claude API. */

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { LocalHost } from "./sqlite";

const DB_FILE = "shoresh.db";
const KEY_NAME = "anthropic_api_key";

function toBase64(u8: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function readDb(): Promise<Uint8Array | null> {
  try {
    const r = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
    return typeof r.data === "string" ? fromBase64(r.data) : new Uint8Array(await r.data.arrayBuffer());
  } catch {
    return null; // первый запуск
  }
}

async function writeFile(name: string, bytes: Uint8Array) {
  // пишем во временный файл и переименовываем — база не ломается, если приложение закроют посреди записи
  await Filesystem.writeFile({ path: name + ".tmp", data: toBase64(bytes), directory: Directory.Data });
  await Filesystem.rename({ from: name + ".tmp", to: name, directory: Directory.Data, toDirectory: Directory.Data });
}

export interface LocalBackend {
  fetch: (req: Request) => Promise<Response>;
  setApiKey: (key: string) => Promise<void>;
  hasApiKey: () => boolean;
  flush: () => Promise<void>;
}

export async function startLocalBackend(): Promise<LocalBackend> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const bytes = await readDb();

  let timer = 0;
  let saving: Promise<void> = Promise.resolve();
  const save = () => {
    window.clearTimeout(timer);
    const inst = h.instance;
    if (!inst) return saving;
    saving = saving.then(() => writeFile(DB_FILE, inst.export())).catch((e) => console.error("Не удалось сохранить базу", e));
    return saving;
  };
  const h: LocalHost = {
    SQL,
    bytes,
    onWrite: () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), 1000);
    },
    backup: (b) => void writeFile(DB_FILE + ".before-import", b),
  };
  (globalThis as unknown as { __shoresh: LocalHost }).__shoresh = h;

  // ключ — в переменные окружения серверного кода
  const env = ((globalThis as unknown as { __shoreshEnv?: Record<string, string> }).__shoreshEnv ??= {});
  try {
    const k = await SecureStorage.getItem(KEY_NAME);
    if (k) env.ANTHROPIC_API_KEY = k;
  } catch {
    /* хранилище недоступно — без ИИ */
  }

  const { app } = await import("../../../server/src/app");
  const ai = await import("../../../server/src/ai");

  // уход в фон — сохранить сразу
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("pause", () => void save());
    await App.addListener("appStateChange", (s) => !s.isActive && void save());
  } catch {
    /* без событий жизненного цикла */
  }

  return {
    fetch: (req) => Promise.resolve(app.fetch(req)),
    hasApiKey: () => !!env.ANTHROPIC_API_KEY,
    setApiKey: async (key) => {
      const k = key.trim();
      if (k) await SecureStorage.setItem(KEY_NAME, k);
      else await SecureStorage.removeItem(KEY_NAME);
      if (k) env.ANTHROPIC_API_KEY = k;
      else delete env.ANTHROPIC_API_KEY;
      ai.resetAIClient();
    },
    flush: () => save(),
  };
}

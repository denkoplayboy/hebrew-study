/* better-sqlite3 поверх sql.js (SQLite в WebAssembly).
   Серверный код «Шореша» работает с базой синхронно через этот же интерфейс,
   поэтому в приложении он запускается без переписывания.
   Используется только то, что нужно серверу: prepare().run/get/all, exec, pragma, transaction. */

import type { Database as SqlJsDatabase, SqlJsStatic, BindParams, SqlValue } from "sql.js";

export interface LocalHost {
  SQL: SqlJsStatic;
  bytes: Uint8Array | null;
  /** вызывается после каждой записи — хост сохраняет файл с задержкой */
  onWrite: () => void;
  /** копия базы перед импортом резервной копии */
  backup: (bytes: Uint8Array) => void;
  instance?: Database;
}

function host(): LocalHost {
  const h = (globalThis as unknown as { __shoresh?: LocalHost }).__shoresh;
  if (!h) throw new Error("Локальная база ещё не открыта");
  return h;
}

type Params = unknown[];

function bindOf(params: Params): BindParams | undefined {
  if (!params.length) return undefined;
  // именованные параметры: prepare("... @he ...").run({ he: "…" })
  if (params.length === 1 && params[0] && typeof params[0] === "object" && !Array.isArray(params[0]) && !(params[0] instanceof Uint8Array)) {
    const o: Record<string, SqlValue> = {};
    for (const [k, v] of Object.entries(params[0] as Record<string, unknown>)) {
      const val = norm(v);
      o["@" + k] = val;
      o[":" + k] = val;
      o["$" + k] = val;
    }
    return o;
  }
  return params.map(norm);
}

function norm(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  return v as SqlValue;
}

class Statement {
  constructor(
    private db: Database,
    private sql: string,
  ) {}

  private withStmt<T>(params: Params, fn: (st: ReturnType<SqlJsDatabase["prepare"]>) => T): T {
    const st = this.db.raw.prepare(this.sql);
    try {
      const b = bindOf(params);
      // sql.js ругается на лишние именованные ключи — привязываем только то, что есть в запросе
      if (b && !Array.isArray(b)) {
        const used: Record<string, SqlValue> = {};
        for (const [k, v] of Object.entries(b)) if (this.sql.includes(k)) used[k] = v;
        st.bind(used);
      } else if (b) st.bind(b);
      return fn(st);
    } finally {
      st.free();
    }
  }

  run(...params: Params) {
    this.withStmt(params, (st) => {
      st.step();
    });
    const changes = this.db.raw.getRowsModified();
    const id = this.db.raw.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] ?? 0;
    this.db.touch();
    return { changes, lastInsertRowid: Number(id) };
  }

  get(...params: Params): any {
    return this.withStmt(params, (st) => (st.step() ? st.getAsObject() : undefined));
  }

  all(...params: Params): any[] {
    return this.withStmt(params, (st) => {
      const rows: Record<string, SqlValue>[] = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    });
  }
}

export default class Database {
  raw: SqlJsDatabase;
  private depth = 0;

  constructor(_path?: string) {
    const h = host();
    this.raw = new h.SQL.Database(h.bytes ?? undefined);
    h.instance = this;
  }

  /** база изменилась — сохранить (если не внутри транзакции) */
  touch() {
    if (this.depth === 0) host().onWrite();
  }

  prepare(sql: string) {
    return new Statement(this, sql);
  }

  exec(sql: string) {
    this.raw.exec(sql);
    this.touch();
    return this;
  }

  pragma(source: string, opts?: { simple?: boolean }) {
    let res: ReturnType<SqlJsDatabase["exec"]>;
    try {
      res = this.raw.exec(`PRAGMA ${source}`);
    } catch {
      // WAL и busy_timeout для базы в памяти не нужны
      return opts?.simple ? undefined : [];
    }
    if (source.includes("=")) this.touch();
    const r = res[0];
    if (!r) return opts?.simple ? undefined : [];
    if (opts?.simple) return r.values[0]?.[0];
    return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])));
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R) {
    return (...args: A): R => {
      const sp = `sp${this.depth}`;
      this.raw.exec(this.depth === 0 ? "BEGIN" : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const out = fn(...args);
        this.depth--;
        this.raw.exec(this.depth === 0 ? "COMMIT" : `RELEASE ${sp}`);
        this.touch();
        return out;
      } catch (e) {
        this.depth--;
        this.raw.exec(this.depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }

  /** снимок базы для сохранения на диск телефона */
  export(): Uint8Array {
    return this.raw.export();
  }

  close() {
    this.raw.close();
  }
}

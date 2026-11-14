// Роса (טַל) — валюта сада. Её нельзя «нафармить» кликами: она капает только за настоящую работу памяти —
// повторения в срок, рост слов, самостоятельное употребление. Тратится на игровом поле «Шук» (броски, участки, здания).
import { db, getMeta, setMeta } from "./db.js";
import { addMoment } from "./words.js";
import type { Facet, FacetState } from "../../shared/memory.js";
import type { ActiveEffects } from "../../shared/board.js";

export function balance(): number {
  return (db.prepare("SELECT COALESCE(SUM(amount), 0) AS b FROM dew_ledger").get() as { b: number }).b;
}

export function addDew(amount: number, reason: string, ref?: string): number {
  if (!amount) return 0;
  db.prepare("INSERT INTO dew_ledger(ts, amount, reason, ref) VALUES (?, ?, ?, ?)").run(Date.now(), Math.round(amount), reason, ref ?? null);
  return Math.round(amount);
}

/** Списать росу, если хватает. */
export function spendDew(amount: number, reason: string, ref?: string): boolean {
  if (amount <= 0) return true;
  if (balance() < amount) return false;
  addDew(-amount, reason, ref);
  return true;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Подарок на новоселье — один раз; и возврат росы за товары старой лавки (её больше нет). */
export function ensureWelcome() {
  if (!getMeta("dew:welcome")) {
    addDew(60, "Подарок на новоселье");
    setMeta("dew:welcome", String(Date.now()));
  }
  if (!getMeta("dew:refund-old-shop")) {
    const spent = (
      db.prepare("SELECT COALESCE(SUM(-amount), 0) AS s FROM dew_ledger WHERE amount < 0 AND reason LIKE 'Лавка:%'").get() as { s: number }
    ).s;
    if (spent > 0) addDew(spent, "Возврат за товары старой лавки");
    db.prepare("DELETE FROM inventory").run();
    setMeta("dew:refund-old-shop", String(Date.now()));
  }
}

// ───────── эффекты уроков (покупаются в Кафе «Ход» на поле) ─────────

export function activeEffects(): ActiveEffects {
  const rows = db.prepare("SELECT type, uses, until FROM effects").all() as { type: string; uses: number; until: number }[];
  const get = (t: string) => rows.find((r) => r.type === t);
  const now = Date.now();
  const until = (t: string) => {
    const u = get(t)?.until || 0;
    return u > now ? u : 0;
  };
  return { dew_x2_until: until("dew_x2"), golden_until: until("golden"), hint: get("hint")?.uses || 0, retry: get("retry")?.uses || 0 };
}

export function addEffect(type: string, opts: { minutes?: number; uses?: number }) {
  const now = Date.now();
  const cur = db.prepare("SELECT uses, until FROM effects WHERE type = ?").get(type) as { uses: number; until: number } | undefined;
  const until = opts.minutes ? Math.max(cur?.until || 0, now) + opts.minutes * 60_000 : cur?.until || 0;
  const uses = (cur?.uses || 0) + (opts.uses || 0);
  db.prepare("INSERT INTO effects(type, uses, until) VALUES (?, ?, ?) ON CONFLICT(type) DO UPDATE SET uses = excluded.uses, until = excluded.until").run(
    type,
    uses,
    until,
  );
}

export function useEffectToken(type: "hint" | "retry"): boolean {
  return db.prepare("UPDATE effects SET uses = uses - 1 WHERE type = ? AND uses > 0").run(type).changes > 0;
}

// ───────── заработок ─────────

const FACET_DEW: Record<Facet, number> = { recognize: 1, listen: 1, recall: 2, spell: 1, context: 2, conjugate: 2, produce: 4 };
const STAGE_DEW = [0, 0, 0, 5, 10, 25];

/** Роса за повторение: только если навык был новым или «хотел пить» (повторять заранее ради росы бессмысленно). */
export function dewForReview(opts: {
  facet: Facet;
  grade: number;
  practice?: boolean;
  before: Pick<FacetState, "reps" | "due" | "state"> | null;
  stageBefore: number;
  stageAfter: number;
  wordLabel: string;
  ref: string;
}): number {
  let earned = 0;
  const now = Date.now();
  const fx = activeEffects();
  const mult = fx.dew_x2_until ? 2 : 1;
  if (!opts.practice && opts.grade >= 2 && opts.before && (opts.before.reps === 0 || opts.before.due <= now)) {
    earned += addDew((FACET_DEW[opts.facet] + (opts.grade === 4 ? 1 : 0)) * mult, mult > 1 ? "повторение (двойная роса)" : "повторение", opts.ref);
  }
  // золотой час: +1 за любой засчитанный верный ответ
  if (fx.golden_until && !opts.practice && opts.grade >= 3) earned += addDew(1, "золотой час", opts.ref);
  if (opts.stageAfter > opts.stageBefore && opts.stageAfter >= 3) {
    earned += addDew(STAGE_DEW[opts.stageAfter] * mult, `${opts.wordLabel}: новая стадия`, opts.ref);
  }
  return earned;
}

/** Бонус за полностью политый сад — раз в день. */
export function dewForWatered(dueLeft: number): number {
  if (dueLeft > 0) return 0;
  const key = "dew:watered:" + todayKey();
  if (getMeta(key)) return 0;
  const reviewsToday = (
    db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE ts >= ? AND practice = 0").get(new Date().setHours(0, 0, 0, 0)) as { n: number }
  ).n;
  if (reviewsToday < 5) return 0;
  setMeta(key, "1");
  addMoment("watered", null, "Сад полит полностью — +10 росы");
  return addDew(10, "сад полит полностью");
}

/** Роса с дневным потолком для источника (блиц, наборы). */
export function dewCapped(source: string, amount: number, cap: number, reason: string): number {
  const key = `dew:cap:${source}:${todayKey()}`;
  const used = Number(getMeta(key) || 0);
  const give = Math.max(0, Math.min(amount, cap - used));
  if (!give) return 0;
  setMeta(key, String(used + give));
  return addDew(give, reason);
}

export function ledger(limit = 30) {
  return db.prepare("SELECT * FROM dew_ledger ORDER BY ts DESC LIMIT ?").all(limit);
}

export function dewStats() {
  const day = new Date().setHours(0, 0, 0, 0);
  const today = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM dew_ledger WHERE ts >= ? AND amount > 0").get(day) as { s: number }).s;
  const week = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM dew_ledger WHERE ts >= ? AND amount > 0").get(Date.now() - 7 * 86400000) as { s: number }).s;
  return { today, week };
}

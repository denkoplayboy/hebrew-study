// Роса (טַל) — валюта сада. Её нельзя «нафармить» кликами: она капает только за настоящую работу памяти —
// повторения в срок, рост слов, самостоятельное употребление. Тратится в лавке на механики, ИИ-подарки и оформление.
import { db, getMeta, setMeta } from "./db.js";
import { addMoment } from "./words.js";
import type { Facet, FacetState } from "../../shared/memory.js";

export type ItemKind = "mechanic" | "consumable" | "theme";

export interface ShopItem {
  id: string;
  kind: ItemKind;
  title: string;
  he: string; // название на иврите — для настроения
  description: string;
  price: number;
  ai?: boolean; // требует ИИ
  icon: string; // имя иконки lucide
  accent?: { light: string; dark: string }; // для тем
}

/** Каталог. Новые товары я (Claude) добавляю сюда — лавка растёт вместе с садом. */
export const CATALOG: ShopItem[] = [
  // ── механики (навсегда) ──
  {
    id: "mech-dictation",
    kind: "mechanic",
    title: "Диктант",
    he: "הַכְתָּבָה",
    description: "Новый режим: слышишь целое предложение из примеров твоих слов и записываешь его. Тренирует слух и письмо сразу на живой речи.",
    price: 150,
    icon: "Headphones",
  },
  {
    id: "mech-blitz",
    kind: "mechanic",
    title: "Блиц",
    he: "בְּזָק",
    description: "60 секунд, только знакомые слова, как можно больше верных ответов. Свой рекорд и немного росы за каждый раунд.",
    price: 100,
    icon: "Zap",
  },
  // ── расходники с ИИ ──
  {
    id: "story",
    kind: "consumable",
    title: "Сказка из твоих слов",
    he: "סִפּוּר",
    description: "ИИ пишет короткий рассказ из слов, которые сейчас хотят пить, с вопросами на понимание. Читаешь — и слова оживают в контексте.",
    price: 40,
    ai: true,
    icon: "BookHeart",
  },
  {
    id: "seeds",
    kind: "consumable",
    title: "Пакет семян",
    he: "שַׂקִּית זְרָעִים",
    description: "Выбираешь тему («у врача», «банк», «ремонт») — ИИ подбирает 10–12 полезных слов, которых у тебя ещё нет. Сажаешь те, что нужны.",
    price: 30,
    ai: true,
    icon: "Package",
  },
  {
    id: "root-lens",
    kind: "consumable",
    title: "Лупа корня",
    he: "זְכוּכִית מַגְדֶּלֶת",
    description: "Вся семья одного корня: глаголы во всех биньянах, существительные, прилагательные — и общий смысл корня. Сажай недостающие.",
    price: 25,
    ai: true,
    icon: "Search",
  },
  {
    id: "fertilizer",
    kind: "consumable",
    title: "Удобрение",
    he: "דֶּשֶׁן",
    description: "Для капризного слова: яркая мнемоника, объяснение, чем оно отличается от похожих, и два запоминающихся примера.",
    price: 20,
    ai: true,
    icon: "Sprout",
  },
  // ── оформление (навсегда) ──
  {
    id: "theme-olive",
    kind: "theme",
    title: "Оливковая роща",
    he: "כֶּרֶם זֵיתִים",
    description: "Тёплый оливковый акцент вместо шалфея.",
    price: 80,
    icon: "Palette",
    accent: { light: "#6f6a3c", dark: "#bdb67c" },
  },
  {
    id: "theme-sea",
    kind: "theme",
    title: "Средиземное море",
    he: "הַיָּם הַתִּיכוֹן",
    description: "Спокойный морской синий.",
    price: 100,
    icon: "Palette",
    accent: { light: "#3f7390", dark: "#8db8cf" },
  },
  {
    id: "theme-negev",
    kind: "theme",
    title: "Терракота Негева",
    he: "הַנֶּגֶב",
    description: "Тёплая глина пустыни на закате.",
    price: 100,
    icon: "Palette",
    accent: { light: "#a8623f", dark: "#dd9a76" },
  },
  {
    id: "theme-lavender",
    kind: "theme",
    title: "Лаванда Галилеи",
    he: "לָבַנְדָּר",
    description: "Приглушённый лавандовый.",
    price: 120,
    icon: "Palette",
    accent: { light: "#77679a", dark: "#b3a5d6" },
  },
  {
    id: "theme-rimon",
    kind: "theme",
    title: "Гранатовый сад",
    he: "רִמּוֹן",
    description: "Глубокий гранатовый — для тех, кто дошёл далеко.",
    price: 160,
    icon: "Palette",
    accent: { light: "#9c3d4a", dark: "#e08a97" },
  },
];

export const itemById = (id: string) => CATALOG.find((i) => i.id === id);

// ───────── баланс и журнал ─────────

export function balance(): number {
  return (db.prepare("SELECT COALESCE(SUM(amount), 0) AS b FROM dew_ledger").get() as { b: number }).b;
}

export function addDew(amount: number, reason: string, ref?: string): number {
  if (!amount) return 0;
  db.prepare("INSERT INTO dew_ledger(ts, amount, reason, ref) VALUES (?, ?, ?, ?)").run(Date.now(), Math.round(amount), reason, ref ?? null);
  return Math.round(amount);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Подарок на новоселье — один раз, чтобы можно было сразу заглянуть в лавку. */
export function ensureWelcome() {
  if (getMeta("dew:welcome")) return;
  addDew(60, "Подарок на новоселье");
  setMeta("dew:welcome", String(Date.now()));
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
  if (!opts.practice && opts.grade >= 2 && opts.before && (opts.before.reps === 0 || opts.before.due <= now)) {
    earned += addDew(FACET_DEW[opts.facet] + (opts.grade === 4 ? 1 : 0), "повторение", opts.ref);
  }
  if (opts.stageAfter > opts.stageBefore && opts.stageAfter >= 3) {
    earned += addDew(STAGE_DEW[opts.stageAfter], `${opts.wordLabel}: новая стадия`, opts.ref);
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

// ───────── лавка ─────────

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7) };
}

/** Ярмарка недели: три товара со скидкой 30%, меняются каждый понедельник. */
export function weeklyFair() {
  const { year, week } = isoWeek();
  let seed = year * 100 + week;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pool = [...CATALOG];
  const picks: string[] = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + ((8 - (now.getDay() || 7)) % 7 || 7));
  next.setHours(0, 0, 0, 0);
  return { week, items: picks, discount: 0.3, endsAt: next.getTime() };
}

export function priceOf(item: ShopItem): number {
  const fair = weeklyFair();
  return fair.items.includes(item.id) ? Math.round(item.price * (1 - fair.discount)) : item.price;
}

export function inventory(): Record<string, number> {
  const rows = db.prepare("SELECT item, qty FROM inventory").all() as { item: string; qty: number }[];
  return Object.fromEntries(rows.map((r) => [r.item, r.qty]));
}

export function owns(id: string): boolean {
  return (inventory()[id] || 0) > 0;
}

export function buy(id: string): { ok: true; balance: number } | { ok: false; error: string } {
  const item = itemById(id);
  if (!item) return { ok: false, error: "Такого товара нет" };
  if (item.kind !== "consumable" && owns(id)) return { ok: false, error: "Уже куплено" };
  const price = priceOf(item);
  if (balance() < price) return { ok: false, error: `Не хватает росы: нужно ${price}, есть ${balance()}` };
  db.transaction(() => {
    addDew(-price, `Лавка: ${item.title}`, id);
    db.prepare(
      "INSERT INTO inventory(item, qty, acquired_at) VALUES (?, 1, ?) ON CONFLICT(item) DO UPDATE SET qty = qty + 1, acquired_at = excluded.acquired_at",
    ).run(id, Date.now());
  })();
  addMoment("shop", null, `Из лавки: ${item.title}`);
  return { ok: true, balance: balance() };
}

/** Списывает один расходник (после успешного использования). */
export function consume(id: string): boolean {
  const r = db.prepare("UPDATE inventory SET qty = qty - 1 WHERE item = ? AND qty > 0").run(id);
  return r.changes > 0;
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

// Игровое поле «Шук»: состояние, броски, клетки, постройки, эффекты.
import crypto from "node:crypto";
import { db, getMeta, setMeta } from "./db.js";
import { addMoment, getForms, rowToWord } from "./words.js";
import { addDew, addEffect, activeEffects, balance, spendDew, todayKey } from "./economy.js";
import {
  ACCENTS,
  BUILDINGS,
  CELLS,
  DISTRICTS,
  EFFECTS,
  HE_FONTS,
  PLANT_STYLES,
  RENT,
  upgradePrice,
  type Cell,
  type Perks,
} from "../../shared/board.js";
import { PERSONS, personLabel, stripNikud, tenseLabel, type Tense } from "../../shared/lang.js";

type Row = Record<string, any>;

// ───────── вопросы для клеток ─────────

export interface Question {
  kind: "word" | "verb";
  prompt: string;
  sub: string;
  promptHe: boolean;
  options: { label: string; he: boolean }[];
  answer: number;
}

const FALLBACK_WORDS = [
  ["שָׁלוֹם", "мир, привет"],
  ["תּוֹדָה", "спасибо"],
  ["בַּיִת", "дом"],
  ["מַיִם", "вода"],
  ["סֵפֶר", "книга"],
  ["עֲבוֹדָה", "работа"],
  ["חָבֵר", "друг"],
  ["לֶחֶם", "хлеб"],
  ["עִיר", "город"],
  ["יָם", "море"],
  ["שֶׁמֶשׁ", "солнце"],
  ["זְמַן", "время"],
];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function wordQuestion(exclude: number[] = []): Question & { wordId?: number } {
  const rows = (db.prepare("SELECT * FROM words WHERE he <> '' AND ru <> ''").all() as Row[]).map(rowToWord);
  if (rows.length >= 4) {
    // в приоритете — знакомые слова
    const known = db.prepare("SELECT DISTINCT word_id FROM facets WHERE facet = 'recognize' AND reps > 0").all() as { word_id: number }[];
    const knownIds = new Set(known.map((k) => k.word_id));
    const pool = rows.filter((w) => !exclude.includes(w.id));
    const prefer = pool.filter((w) => knownIds.has(w.id));
    const target = (prefer.length ? prefer : pool)[crypto.randomInt((prefer.length ? prefer : pool).length)];
    const others = shuffle(rows.filter((w) => w.id !== target.id && w.ru !== target.ru)).slice(0, 3);
    const opts = shuffle([target, ...others]);
    return {
      kind: "word",
      prompt: target.he_nikud || target.he,
      sub: "Что это значит?",
      promptHe: true,
      options: opts.map((w) => ({ label: w.ru, he: false })),
      answer: opts.findIndex((w) => w.id === target.id),
      wordId: target.id,
    };
  }
  const pick = shuffle(FALLBACK_WORDS).slice(0, 4);
  const opts = shuffle(pick);
  return {
    kind: "word",
    prompt: pick[0][0],
    sub: "Что это значит?",
    promptHe: true,
    options: opts.map((w) => ({ label: w[1], he: false })),
    answer: opts.indexOf(pick[0]),
  };
}

function verbQuestion(): Question {
  const verbs = db
    .prepare("SELECT DISTINCT w.* FROM words w JOIN forms f ON f.word_id = w.id WHERE f.lang = 'he' AND f.tense IN ('past','present','future')")
    .all() as Row[];
  if (!verbs.length) return wordQuestion();
  const v = rowToWord(verbs[crypto.randomInt(verbs.length)]);
  const forms = getForms(v.id).filter((f) => f.lang === "he" && ["past", "present", "future"].includes(f.tense));
  const target = forms[crypto.randomInt(forms.length)];
  const distinct = new Map<string, (typeof forms)[number]>();
  for (const f of shuffle(forms)) if (stripNikud(f.form) !== stripNikud(target.form) && !distinct.has(f.form)) distinct.set(f.form, f);
  const opts = shuffle([target, ...[...distinct.values()].slice(0, 3)]);
  const p = personLabel(target.tense, target.person);
  return {
    kind: "verb",
    prompt: v.he_nikud || v.he,
    sub: `${tenseLabel(target.tense).ru}, ${p.he} (${p.ru}) — какая форма?`,
    promptHe: true,
    options: opts.map((f) => ({ label: f.nikud || f.form, he: true })),
    answer: opts.indexOf(target),
  };
}

function publicQuestion(q: Question) {
  const { answer: _a, ...rest } = q;
  void _a;
  return rest;
}

// ───────── состояние ─────────

type ShukOffer = { id: "dew" | "free" | "disc" | "hint" | "retry" | "x2"; label: string };
type Pending =
  | { type: "buy"; cell: number }
  | { type: "quiz"; reward: number; consolation: number; q: Question; title: string }
  | { type: "ulpan"; qs: Question[] }
  | { type: "misrad"; fee: number; q: Question }
  | { type: "shuk"; offers: ShukOffer[] }
  | { type: "airport"; fee: number };

interface GameState {
  pos: number;
  freeRolls: number;
  upgradeDiscount: number;
  rollsToday: number;
  rollDay: string;
  dailyFreeDay: string;
  laps: number;
  pending: Pending | null;
}

const DEFAULT_STATE: GameState = { pos: 0, freeRolls: 1, upgradeDiscount: 0, rollsToday: 0, rollDay: "", dailyFreeDay: "", laps: 0, pending: null };

function getState(): GameState {
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(getMeta("game:state") || "{}") as Partial<GameState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function setState(s: GameState) {
  setMeta("game:state", JSON.stringify(s));
}

function log(kind: string, text: string, amount?: number) {
  db.prepare("INSERT INTO game_log(ts, kind, text, amount) VALUES (?, ?, ?, ?)").run(Date.now(), kind, text, amount ?? null);
}

export function properties(): Map<number, number> {
  const rows = db.prepare("SELECT cell, level FROM properties").all() as { cell: number; level: number }[];
  return new Map(rows.map((r) => [r.cell, r.level]));
}

function districtComplete(district: string, props: Map<number, number>) {
  return CELLS.filter((c) => c.district === district).every((c) => props.has(c.i));
}

export function perks(): Perks {
  const props = properties();
  const levels: Record<string, number> = {};
  for (const c of CELLS) if (c.building) levels[c.building] = props.get(c.i) ?? 0;
  const L = (b: string) => levels[b] || 0;
  const arch = L("archive");
  return {
    levels,
    fonts: HE_FONTS.filter((f) => f.level <= L("typography")).map((f) => f.id),
    accents: ACCENTS.filter((a) => a.level <= L("gallery")).map((a) => a.id),
    plants: PLANT_STYLES.filter((p) => p.level <= L("greenhouse")).map((p) => p.id),
    rollDiscount: [0, 2, 3, 3][L("bank")],
    startBonus: L("bank") >= 2 ? 5 : 0,
    freeDailyRoll: L("bank") >= 3,
    forecast: L("observatory") >= 1,
    edgeMode: L("observatory") >= 2,
    csvExport: L("observatory") >= 3,
    dictation: L("studio") >= 1,
    dictationBonus: [0, 0, 1, 2][L("studio")],
    blitz: L("stadium") >= 1,
    blitzMarathon: L("stadium") >= 2,
    blitzCapMult: [1, 1, 1.5, 2][L("stadium")],
    effects: EFFECTS.filter((e) => e.level <= L("cafe")).map((e) => e.id),
    effectDiscount: L("cafe") >= 3 ? 0.2 : 0,
    storyPrice: [null, 40, 30, 20][L("storyteller")],
    seedsPrice: [null, 30, 30, 15][arch],
    rootPrice: [null, null, 25, 13][arch],
  };
}

function rollInfo(s: GameState) {
  const p = perks();
  const today = todayKey();
  const rollsToday = s.rollDay === today ? s.rollsToday : 0;
  const base = 10 - p.rollDiscount;
  const cost = rollsToday < 3 ? base : rollsToday < 5 ? base + 5 : base + 10;
  const dailyFree = p.freeDailyRoll && s.dailyFreeDay !== today;
  const free = s.freeRolls > 0 || dailyFree;
  return { cost: free ? 0 : cost, paidCost: cost, free, freeRolls: s.freeRolls, dailyFree, rollsToday };
}

function publicPending(p: Pending | null) {
  if (!p) return null;
  if (p.type === "quiz") return { ...p, q: publicQuestion(p.q) };
  if (p.type === "misrad") return { ...p, q: publicQuestion(p.q) };
  if (p.type === "ulpan") return { ...p, qs: p.qs.map(publicQuestion) };
  return p;
}

export function gameView() {
  const s = getState();
  const props = properties();
  return {
    pos: s.pos,
    laps: s.laps,
    pending: publicPending(s.pending),
    upgradeDiscount: s.upgradeDiscount,
    roll: rollInfo(s),
    balance: balance(),
    perks: perks(),
    effects: activeEffects(),
    cells: CELLS.map((c) => ({
      ...c,
      owned: props.has(c.i),
      level: props.get(c.i) ?? 0,
      complete: c.district ? districtComplete(c.district, props) : false,
      nextPrice: c.kind === "plot" && props.has(c.i) && (props.get(c.i) ?? 0) < 3 ? buildPrice(c, props, s) : null,
    })),
    log: db.prepare("SELECT * FROM game_log ORDER BY ts DESC LIMIT 25").all(),
  };
}

function buildPrice(c: Cell, props: Map<number, number>, s: GameState) {
  const lvl = props.get(c.i) ?? 0;
  let price = upgradePrice(c.price!, lvl + 1);
  if (c.district && districtComplete(c.district, props)) price = Math.round(price * 0.8);
  if (s.upgradeDiscount) price = Math.round(price * (1 - s.upgradeDiscount));
  return price;
}

// ───────── ход ─────────

export class GameError extends Error {}

interface Event {
  text: string;
  amount?: number;
  tone?: "good" | "bad" | "info";
}

const MAZAL: { id: string; w: number }[] = [
  { id: "wallet", w: 3 },
  { id: "word", w: 4 },
  { id: "verb", w: 3 },
  { id: "tostart", w: 2 },
  { id: "parking", w: 2 },
  { id: "freeroll", w: 2 },
  { id: "discount", w: 2 },
  { id: "hamsin", w: 2 },
  { id: "gift", w: 2 },
  { id: "falafel", w: 1 },
];

function pickWeighted<T extends { w: number }>(list: T[]): T {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = crypto.randomInt(total);
  for (const x of list) {
    if (r < x.w) return x;
    r -= x.w;
  }
  return list[0];
}

function pay(amount: number, reason: string, events: Event[]) {
  const take = Math.min(amount, Math.max(0, balance()));
  if (take > 0) addDew(-take, reason);
  events.push({ text: `${reason}: −${take} росы`, amount: -take, tone: "bad" });
  log("pay", reason, -take);
}

function gain(amount: number, reason: string, events: Event[]) {
  addDew(amount, reason);
  events.push({ text: `${reason}: +${amount} росы`, amount, tone: "good" });
  log("gain", reason, amount);
}

/** Обработать остановку на клетке. Может вызываться повторно (хамсин, такси до Старта). */
function land(s: GameState, events: Event[], depth = 0) {
  const c = CELLS[s.pos];
  const props = properties();
  const p = perks();
  switch (c.kind) {
    case "start":
      gain(20 + p.startBonus, "Остановка на Старте", events);
      break;
    case "plot": {
      if (!props.has(c.i)) {
        s.pending = { type: "buy", cell: c.i };
        events.push({ text: `${c.name}: участок свободен — ${c.price} росы`, tone: "info" });
      } else {
        const lvl = props.get(c.i) ?? 0;
        let rent = RENT[lvl] * (districtComplete(c.district!, props) ? 2 : 1);
        if (c.building === "studio" && lvl >= 3) rent = Math.round(rent * 1.5);
        gain(rent, `Рента: ${c.name}${lvl ? ` (${BUILDINGS[c.building!].name}, ур. ${lvl})` : ""}`, events);
      }
      break;
    }
    case "mazal": {
      const card = pickWeighted(MAZAL);
      switch (card.id) {
        case "wallet":
          gain(15, "Мазаль: нашёл кошелёк на улице Яффо и вернул хозяину — тот отблагодарил", events);
          break;
        case "word":
          s.pending = { type: "quiz", reward: 15, consolation: 3, q: wordQuestion(), title: "Мазаль: слово на удачу" };
          events.push({ text: "Мазаль: слово на удачу — ответь и получи 15 росы", tone: "info" });
          break;
        case "verb":
          s.pending = { type: "quiz", reward: 20, consolation: 3, q: verbQuestion(), title: "Мазаль: глагол на удачу" };
          events.push({ text: "Мазаль: глагол на удачу — ответь и получи 20 росы", tone: "info" });
          break;
        case "tostart":
          events.push({ text: "Мазаль: сосед подвёз до Тахана мерказит", tone: "info" });
          s.pos = 0;
          s.laps++;
          if (depth < 2) land(s, events, depth + 1);
          break;
        case "parking":
          pay(8, "Мазаль: штраф за парковку на красно-белом", events);
          break;
        case "freeroll":
          s.freeRolls++;
          events.push({ text: "Мазаль: попутка — следующий бросок бесплатный", tone: "good" });
          log("gain", "Бесплатный бросок (Мазаль)");
          break;
        case "discount":
          s.upgradeDiscount = 0.3;
          events.push({ text: "Мазаль: знакомый прораб — следующая постройка на 30% дешевле", tone: "good" });
          log("gain", "Скидка 30% на постройку (Мазаль)");
          break;
        case "hamsin":
          events.push({ text: "Мазаль: хамсин! Отступаешь на 3 клетки", tone: "bad" });
          s.pos = (s.pos + 17) % 20;
          if (depth < 2) land(s, events, depth + 1);
          break;
        case "gift":
          addEffect("dew_x2", { minutes: 15 });
          events.push({ text: "Мазаль: соседи угостили кофе — «Двойная роса» на 15 минут уроков", tone: "good" });
          log("gain", "Двойная роса 15 мин (Мазаль)");
          break;
        case "falafel":
          pay(5, "Мазаль: фалафель с двойным хумусом", events);
          break;
      }
      break;
    }
    case "ulpan": {
      const qs: Question[] = [];
      const used: number[] = [];
      for (let k = 0; k < 3; k++) {
        const q = wordQuestion(used);
        if (q.wordId) used.push(q.wordId);
        qs.push(q);
      }
      s.pending = { type: "ulpan", qs };
      events.push({ text: "Ульпан: три быстрых вопроса, +4 росы за каждый верный", tone: "info" });
      break;
    }
    case "misrad":
      s.pending = { type: "misrad", fee: 12, q: verbQuestion() };
      events.push({ text: "Мисрад а-пним: нужна справка. Заплати 12 росы — или ответь чиновнику на вопрос", tone: "info" });
      break;
    case "shabbat":
      s.freeRolls++;
      events.push({ text: "Шабат шалом! Следующий бросок бесплатный", tone: "good" });
      log("gain", "Бесплатный бросок (Шабат)");
      break;
    case "arnona":
      pay(6, "Арнона", events);
      break;
    case "shuk": {
      const pool: ShukOffer[] = [
        { id: "dew", label: "+12 росы" },
        { id: "free", label: "Бесплатный бросок" },
        { id: "disc", label: "−30% на следующую постройку" },
        { id: "hint", label: "2 жетона «Подсказка без штрафа»" },
        { id: "retry", label: "2 жетона «Вторая попытка»" },
        { id: "x2", label: "«Двойная роса» на 15 минут уроков" },
      ];
      s.pending = { type: "shuk", offers: shuffle(pool).slice(0, 3) };
      events.push({ text: "Шук Махане Иегуда: выбери один товар дня", tone: "info" });
      break;
    }
    case "airport":
      s.pending = { type: "airport", fee: 8 };
      events.push({ text: "Бен-Гурион: можно улететь на любую клетку за 8 росы", tone: "info" });
      break;
  }
}

export function roll() {
  const s = getState();
  if (s.pending?.type === "misrad") throw new GameError("Сначала разберись с Мисрад а-пним: заплати или ответь на вопрос");
  const info = rollInfo(s);
  const today = todayKey();
  if (s.rollDay !== today) {
    s.rollDay = today;
    s.rollsToday = 0;
  }
  // цена растёт только с числом платных бросков за день
  if (s.freeRolls > 0) s.freeRolls--;
  else if (info.dailyFree) s.dailyFreeDay = today;
  else if (!spendDew(info.paidCost, "Бросок кубика")) throw new GameError(`Не хватает росы на бросок: нужно ${info.paidCost}. Роса капает за уроки.`);
  else s.rollsToday++;
  const skipped = s.pending;
  s.pending = null;
  const die = crypto.randomInt(1, 7);
  const from = s.pos;
  const path: number[] = [];
  const events: Event[] = [];
  if (skipped?.type === "buy") events.push({ text: `Пропустил покупку: ${CELLS[skipped.cell].name}`, tone: "info" });
  for (let k = 1; k <= die; k++) path.push((from + k) % 20);
  s.pos = path[path.length - 1];
  if (path.slice(0, -1).includes(0)) {
    s.laps++;
    gain(10 + perks().startBonus, "Проход через Старт", events);
  } else if (s.pos === 0) s.laps++;
  log("roll", `Бросок: ${die} → ${CELLS[s.pos].name}`, info.free ? 0 : -info.paidCost);
  land(s, events);
  setState(s);
  return { die, from, path, events, view: gameView() };
}

export function act(action: string, payload: Record<string, unknown> = {}) {
  const s = getState();
  const p = s.pending;
  const events: Event[] = [];
  if (!p) throw new GameError("Сейчас нечего решать — бросай кубик");
  switch (p.type) {
    case "buy": {
      const c = CELLS[p.cell];
      if (action === "buy") {
        if (!spendDew(c.price!, `Участок: ${c.name}`)) throw new GameError(`Не хватает росы: участок стоит ${c.price}`);
        db.prepare("INSERT INTO properties(cell, level, bought_at) VALUES (?, 0, ?)").run(c.i, Date.now());
        log("buy", `Куплен участок ${c.name}`, -c.price!);
        addMoment("game", null, `Куплен участок на поле: ${c.name}`);
        events.push({ text: `Участок ${c.name} твой! Теперь на нём можно строить: ${BUILDINGS[c.building!].name}`, tone: "good" });
        const props = properties();
        if (districtComplete(c.district!, props)) {
          const d = DISTRICTS.find((x) => x.id === c.district)!;
          events.push({ text: `Район ${d.name} собран целиком: рента ×2, постройки на 20% дешевле`, tone: "good" });
          addMoment("game", null, `Собран район ${d.name}`);
        }
      } else events.push({ text: `Решил не покупать ${c.name}`, tone: "info" });
      s.pending = null;
      break;
    }
    case "quiz": {
      const ok = Number(payload.answer) === p.q.answer;
      if (ok) gain(p.reward, `${p.title}: верно`, events);
      else gain(p.consolation, `${p.title}: в следующий раз получится`, events);
      s.pending = null;
      setState(s);
      return { ok, correct: p.q.answer, events, view: gameView() };
    }
    case "ulpan": {
      const answers = (payload.answers as number[]) || [];
      const correct = p.qs.map((q, k) => answers[k] === q.answer);
      const n = correct.filter(Boolean).length;
      if (n) gain(n * 4 + (n === 3 ? 3 : 0), `Ульпан: верно ${n} из 3`, events);
      else events.push({ text: "Ульпан: в этот раз мимо — повтори эти слова в уроках", tone: "info" });
      s.pending = null;
      setState(s);
      return { correct: p.qs.map((q) => q.answer), events, view: gameView() };
    }
    case "misrad": {
      if (action === "pay") {
        if (balance() < p.fee) throw new GameError("Не хватает росы — попробуй ответить на вопрос");
        pay(p.fee, "Мисрад а-пним: пошлина", events);
        s.pending = null;
        break;
      }
      const ok = Number(payload.answer) === p.q.answer;
      if (ok) gain(5, "Мисрад а-пним: чиновник впечатлён твоим ивритом", events);
      else pay(p.fee, "Мисрад а-пним: ошибка в анкете, пошлина", events);
      s.pending = null;
      setState(s);
      return { ok, correct: p.q.answer, events, view: gameView() };
    }
    case "shuk": {
      const o = p.offers[Number(payload.index)];
      if (!o) throw new GameError("Выбери товар");
      if (o.id === "dew") gain(12, "Шук: мешочек росы", events);
      if (o.id === "free") (s.freeRolls++, events.push({ text: "Шук: бесплатный бросок", tone: "good" }));
      if (o.id === "disc") (s.upgradeDiscount = 0.3, events.push({ text: "Шук: −30% на следующую постройку", tone: "good" }));
      if (o.id === "hint") (addEffect("hint", { uses: 2 }), events.push({ text: "Шук: 2 жетона «Подсказка без штрафа»", tone: "good" }));
      if (o.id === "retry") (addEffect("retry", { uses: 2 }), events.push({ text: "Шук: 2 жетона «Вторая попытка»", tone: "good" }));
      if (o.id === "x2") (addEffect("dew_x2", { minutes: 15 }), events.push({ text: "Шук: «Двойная роса» на 15 минут", tone: "good" }));
      log("gain", `Шук: ${o.label}`);
      s.pending = null;
      break;
    }
    case "airport": {
      if (action === "fly") {
        const to = Number(payload.cell);
        if (!(to >= 0 && to < 20) || to === s.pos) throw new GameError("Выбери другую клетку");
        if (!spendDew(p.fee, "Перелёт из Бен-Гуриона")) throw new GameError(`Не хватает росы на билет: ${p.fee}`);
        events.push({ text: `Перелёт: ${CELLS[to].name} (−${p.fee} росы)`, tone: "info" });
        log("pay", `Перелёт → ${CELLS[to].name}`, -p.fee);
        s.pending = null;
        s.pos = to;
        land(s, events);
      } else {
        events.push({ text: "Остаёшься в аэропорту — дьюти-фри не для нас", tone: "info" });
        s.pending = null;
      }
      break;
    }
  }
  setState(s);
  return { events, view: gameView() };
}

export function build(cell: number) {
  const s = getState();
  const c = CELLS[cell];
  const props = properties();
  if (!c || c.kind !== "plot" || !props.has(cell)) throw new GameError("Строить можно только на своём участке");
  const lvl = props.get(cell) ?? 0;
  if (lvl >= 3) throw new GameError("Здание уже на максимальном уровне");
  const price = buildPrice(c, props, s);
  const b = BUILDINGS[c.building!];
  if (!spendDew(price, `${b.name}: уровень ${lvl + 1}`)) throw new GameError(`Не хватает росы: нужно ${price}`);
  db.prepare("UPDATE properties SET level = ? WHERE cell = ?").run(lvl + 1, cell);
  s.upgradeDiscount = 0;
  setState(s);
  log("build", `${b.name} в ${c.name}: уровень ${lvl + 1}`, -price);
  addMoment("game", null, `${lvl ? "Улучшено" : "Построено"}: ${b.name} (${c.name}), уровень ${lvl + 1}`);
  return { unlocked: b.levels[lvl], view: gameView() };
}

export function buyEffect(id: string) {
  const p = perks();
  const e = EFFECTS.find((x) => x.id === id);
  if (!e || !p.effects.includes(id)) throw new GameError("Этот эффект пока не продаётся — улучши Кафе «Ход»");
  const price = Math.round(e.price * (1 - p.effectDiscount));
  if (!spendDew(price, `Кафе «Ход»: ${e.name}`)) throw new GameError(`Не хватает росы: нужно ${price}`);
  if ("minutes" in e) addEffect(e.id, { minutes: e.minutes });
  else addEffect(e.id, { uses: e.uses });
  log("effect", `Кафе «Ход»: ${e.name}`, -price);
  return gameView();
}

/** Цена ИИ-активности здания (или ошибка, если не построено). */
export function aiActivityPrice(kind: "story" | "theme" | "root"): number {
  const p = perks();
  const price = kind === "story" ? p.storyPrice : kind === "theme" ? p.seedsPrice : p.rootPrice;
  if (price == null) {
    const need = kind === "story" ? "Кафе «Сиппур» (Мамила)" : kind === "root" ? "Архив корней уровня 2 (Старый город)" : "Архив корней (Старый город)";
    throw new GameError(`Сначала построй на поле: ${need}`);
  }
  return price;
}

export { PERSONS, type Tense };

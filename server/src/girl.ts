// Незнакомка в кафе на Кармеле: близость, подарки, деньги, ежедневный подарок от неё.
import crypto from "node:crypto";
import { db, getMeta, setMeta } from "./db.js";
import { addEffect, todayKey } from "./economy.js";
import { GIFTS, GIRL_NAME, GIRL_STAGES, girlStage } from "../../shared/board.js";

const DAILY_CAP = 120; // сколько близости можно набрать за день — отношения растут постепенно

export function affinity(): number {
  return Number(getMeta("girl:affinity") || 0);
}
export function nameKnown(): boolean {
  return getMeta("girl:name") === "1";
}
export function setNameKnown() {
  setMeta("girl:name", "1");
}

/** Изменить близость (положительный прирост ограничен за день). Возвращает фактическое изменение. */
export function addAffinity(delta: number): number {
  const before = affinity();
  let d = Math.round(delta);
  if (d > 0) {
    const key = "girl:gain:" + todayKey();
    const used = Number(getMeta(key) || 0);
    d = Math.max(0, Math.min(d, DAILY_CAP - used));
    setMeta(key, String(used + d));
  }
  const after = Math.max(0, before + d);
  setMeta("girl:affinity", String(after));
  // имя она называет сама, когда вы становитесь знакомыми
  if (girlStage(after) >= 1 && !nameKnown()) setNameKnown();
  return after - before;
}

export function stageInfo() {
  const a = affinity();
  const k = girlStage(a);
  const next = GIRL_STAGES[k + 1];
  return {
    affinity: a,
    stage: k,
    stageName: GIRL_STAGES[k].name,
    discount: GIRL_STAGES[k].discount,
    nextAt: next ? next.min : null,
    nextName: next ? next.name : null,
    nameKnown: nameKnown(),
    name: nameKnown() ? GIRL_NAME : null,
    gainedToday: Number(getMeta("girl:gain:" + todayKey()) || 0),
    dailyCap: DAILY_CAP,
  };
}

/** Её любимый подарок недели (детерминирован номером недели) — даёт двойную близость. */
export function favoriteGift() {
  const week = Math.floor(Date.now() / (7 * 86400000));
  return GIFTS[week % GIFTS.length].id;
}

export function logGirl(kind: string, opts: { me?: string; her?: string; her_ru?: string; delta?: number; meta?: unknown }) {
  db.prepare("INSERT INTO girl_log(ts, kind, me, her, her_ru, delta, meta) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    Date.now(),
    kind,
    opts.me || "",
    opts.her || "",
    opts.her_ru || "",
    opts.delta || 0,
    JSON.stringify(opts.meta || {}),
  );
}

export function girlHistory(limit = 40) {
  return (db.prepare("SELECT * FROM girl_log ORDER BY ts DESC LIMIT ?").all(limit) as Record<string, any>[]).reverse();
}

const MONEY_LINES = [
  ["רגע, זה בשבילי? אתה מצחיק.", "Погоди, это мне? Ты смешной."],
  ["טוב… אני אקנה בזה צבעים חדשים.", "Ну… куплю на это новые краски."],
  ["וואו. אני לא יודעת מה להגיד. תודה.", "Ого. Не знаю, что сказать. Спасибо."],
  ["אתה תמיד כזה נדיב?", "Ты всегда такой щедрый?"],
];

export function moneyReaction(amount: number) {
  const i = amount >= 100 ? 2 : amount >= 40 ? 3 : amount >= 15 ? 1 : 0;
  return { he: MONEY_LINES[i][0], ru: MONEY_LINES[i][1] };
}

/** Ежедневный маленький подарок от неё (Кафе на Кармеле 3 уровня, когда вы подружились). */
export function dailyGiftAvailable(level: number) {
  return level >= 3 && girlStage(affinity()) >= 3 && getMeta("girl:daily:" + todayKey()) !== "1";
}

export function takeDailyGift(): { text: string; he: string } {
  setMeta("girl:daily:" + todayKey(), "1");
  const r = crypto.randomInt(4);
  if (r === 0) {
    addEffect("dew_x2", { minutes: 20 });
    return { text: "Она угостила тебя кофе: двойная роса на 20 минут уроков", he: "קפה עליי היום!" };
  }
  if (r === 1) {
    addEffect("hint", { uses: 2 });
    return { text: "Она нарисовала тебе шпаргалку: 2 подсказки без штрафа", he: "ציירתי לך משהו קטן." };
  }
  if (r === 2) {
    addEffect("shield", { uses: 1 });
    return { text: "Она подарила талисман: щит от одной ошибки", he: "זה קמע. שיהיה לך מזל." };
  }
  addEffect("golden", { minutes: 30 });
  return { text: "Она сказала, что верит в тебя: золотой час на 30 минут", he: "אני מאמינה בך." };
}

// Модель памяти: у каждого слова несколько «граней» (навыков), у каждой — своё расписание (FSRS).

export const FACETS = [
  { id: "recognize", ru: "Узнавание", short: "узн", weight: 1.0, hint: "видишь слово — понимаешь смысл" },
  { id: "listen", ru: "На слух", short: "слух", weight: 0.6, hint: "слышишь — понимаешь" },
  { id: "recall", ru: "Вспоминание", short: "всп", weight: 1.3, hint: "по-русски → вспоминаешь слово" },
  { id: "spell", ru: "Написание", short: "пис", weight: 0.7, hint: "пишешь без ошибок" },
  { id: "context", ru: "В контексте", short: "конт", weight: 1.1, hint: "подставляешь нужную форму в предложение" },
  { id: "produce", ru: "Употребление", short: "употр", weight: 1.6, hint: "сам используешь в своей фразе" },
  { id: "conjugate", ru: "Формы", short: "формы", weight: 1.2, hint: "спрягаешь / образуешь формы" },
] as const;
export type Facet = (typeof FACETS)[number]["id"];
export const facetInfo = (f: string) => FACETS.find((x) => x.id === f)!;

export type Grade = 1 | 2 | 3 | 4; // 1 — забыл, 2 — с трудом, 3 — помню, 4 — легко

export interface FacetState {
  facet: Facet;
  state: "locked" | "new" | "review";
  stability: number; // дни
  difficulty: number; // 1..10
  due: number; // ms
  last: number; // ms
  reps: number;
  lapses: number;
}

// ───────────────── FSRS-4.5 (упрощённо, с параметрами по умолчанию) ─────────────────
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
export const DAY = 86_400_000;

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function clampD(d: number) {
  return Math.min(10, Math.max(1, d));
}
function initD(g: Grade) {
  return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
}

export function nextInterval(stability: number, desired = 0.9): number {
  const days = (stability / FACTOR) * (Math.pow(desired, 1 / DECAY) - 1);
  return Math.max(1, Math.round(days));
}

/** Обновляет состояние грани после ответа. */
export function schedule(s: FacetState, g: Grade, now: number, desired = 0.9): FacetState {
  const out = { ...s };
  if (s.reps === 0 || s.stability <= 0) {
    out.stability = W[g - 1];
    out.difficulty = initD(g);
  } else {
    const elapsed = (now - s.last) / DAY;
    const R = retrievability(elapsed, s.stability);
    let D = s.difficulty - W[6] * (g - 3);
    D = W[7] * initD(4) + (1 - W[7]) * D; // возврат к среднему
    out.difficulty = clampD(D);
    if (g === 1) {
      out.stability = Math.min(
        s.stability,
        W[11] * Math.pow(s.difficulty, -W[12]) * (Math.pow(s.stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)),
      );
      out.lapses = s.lapses + 1;
    } else {
      const hard = g === 2 ? W[15] : 1;
      const easy = g === 4 ? W[16] : 1;
      out.stability =
        s.stability *
        (1 + Math.exp(W[8]) * (11 - s.difficulty) * Math.pow(s.stability, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
    }
  }
  out.stability = Math.max(0.05, out.stability);
  out.reps = s.reps + 1;
  out.last = now;
  out.state = "review";
  // забытое — вернуть в тот же день (через ~10 минут), «с трудом» в первый раз — завтра
  if (g === 1) out.due = now + 10 * 60_000;
  else out.due = now + nextInterval(out.stability, desired) * DAY;
  return out;
}

/** Насколько грань «живая» сейчас: вероятность вспомнить × зрелость памяти. 0..1 */
export function facetStrength(s: Pick<FacetState, "state" | "stability" | "last" | "reps">, now: number): number {
  if (s.state === "locked" || s.reps === 0) return 0;
  const R = retrievability((now - s.last) / DAY, s.stability);
  const maturity = 1 - Math.exp(-s.stability / 25);
  return R * (0.35 + 0.65 * maturity);
}

export function facetR(s: Pick<FacetState, "state" | "stability" | "last" | "reps">, now: number): number {
  if (s.state === "locked" || s.reps === 0) return 0;
  return retrievability((now - s.last) / DAY, s.stability);
}

// ───────────────── Стадии роста слова ─────────────────
export const STAGES = [
  { id: 0, ru: "Семя", he: "זֶרַע", min: 0, hint: "ещё не встречалось в практике" },
  { id: 1, ru: "Росток", he: "נֶבֶט", min: 0.001, hint: "первое знакомство" },
  { id: 2, ru: "Саженец", he: "שָׁתִיל", min: 0.15, hint: "узнаёшь, но неустойчиво" },
  { id: 3, ru: "Деревце", he: "עֵץ צָעִיר", min: 0.35, hint: "вспоминаешь сам" },
  { id: 4, ru: "Дерево", he: "עֵץ", min: 0.6, hint: "уверенно и в контексте" },
  { id: 5, ru: "Укоренилось", he: "שׁוֹרָשִׁים", min: 0.82, hint: "живёт в твоей речи" },
] as const;

export function stageOf(mastery: number, touched: boolean): number {
  if (!touched) return 0;
  let st = 1;
  for (const s of STAGES) if (mastery >= s.min && s.id > 0) st = s.id;
  return st;
}

/** Применимые грани для слова. */
export function applicableFacets(opts: { lang: "he" | "en"; isVerb: boolean; hasForms: boolean }): Facet[] {
  const list: Facet[] = ["recognize", "listen", "recall", "spell", "context", "produce"];
  if (opts.hasForms) list.push("conjugate");
  return list;
}

/** Мастерство слова 0..1 по граням. */
export function masteryOf(facets: FacetState[], now: number): number {
  let sum = 0;
  let wsum = 0;
  for (const f of facets) {
    const w = facetInfo(f.facet)?.weight ?? 1;
    wsum += w;
    sum += w * facetStrength(f, now);
  }
  return wsum ? sum / wsum : 0;
}

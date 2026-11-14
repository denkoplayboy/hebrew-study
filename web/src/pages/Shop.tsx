import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Droplets,
  Dice5,
  Bus,
  Clover,
  GraduationCap,
  Stamp,
  Moon,
  Receipt,
  ShoppingBasket,
  Plane,
  MapPin,
  Palette,
  Headphones,
  Zap,
  Coffee,
  Anchor,
  Skull,
  Heart,
  Disc3,
  Swords,
  BedDouble,
  BookHeart,
  Library,
  Sprout,
  Lock,
  Check,
  Sparkles,
  ArrowRight,
  Timer,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime } from "../lib/app";
import { BUILDINGS, CELLS, DISTRICTS, EFFECTS, cellGridPos, type Cell, type Perks, type ActiveEffects } from "../../../shared/board";
import { He, Loading, Modal, Mixed, Collapsible } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";
import { DesignPickers } from "../components/DesignPickers";

interface Q {
  kind: "word" | "verb";
  prompt: string;
  sub: string;
  promptHe: boolean;
  options: { label: string; he: boolean }[];
}
type Pending =
  | { type: "buy"; cell: number }
  | { type: "quiz"; reward: number; consolation: number; q: Q; title: string }
  | { type: "ulpan"; qs: Q[] }
  | { type: "misrad"; fee: number; q: Q }
  | { type: "shuk"; offers: { id: string; label: string }[] }
  | { type: "airport"; fee: number };

interface GCell extends Cell {
  owned: boolean;
  level: number;
  complete: boolean;
  nextPrice: number | null;
}
interface GameView {
  pos: number;
  laps: number;
  pending: Pending | null;
  upgradeDiscount: number;
  roll: { cost: number; paidCost: number; free: boolean; freeRolls: number; dailyFree: boolean; rollsToday: number };
  balance: number;
  perks: Perks;
  effects: ActiveEffects;
  cells: GCell[];
  log: { id: number; ts: number; kind: string; text: string; amount: number | null }[];
  today: number;
  ai: boolean;
  wheel: { prizes: string[]; shorts?: string[]; left: number; perDay: number; pending: { prize: string; index: number; q: Q } | null };
}
interface GEvent {
  text: string;
  amount?: number;
  tone?: "good" | "bad" | "info";
}

const ICONS: Record<string, typeof Bus> = {
  Palette,
  Headphones,
  Zap,
  Coffee,
  BookHeart,
  Library,
  Anchor,
  Skull,
  Heart,
  Disc3,
  Swords,
  BedDouble,
};
const SPECIAL_ICON: Record<string, typeof Bus> = {
  start: Bus,
  mazal: Clover,
  ulpan: GraduationCap,
  misrad: Stamp,
  shabbat: Moon,
  arnona: Receipt,
  shuk: ShoppingBasket,
  airport: Plane,
};

const DIE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <svg width="56" height="56" viewBox="0 0 100 100" className={rolling ? "die rolling" : "die"} aria-label={`Кубик: ${value}`}>
      <rect x="4" y="4" width="92" height="92" rx="22" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="3" />
      {DIE_DOTS[value].map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r="8.5" fill="var(--text)" />
      ))}
    </svg>
  );
}

const district = (id?: string) => DISTRICTS.find((d) => d.id === id);

function untilText(ts: number) {
  const m = Math.max(1, Math.round((ts - Date.now()) / 60000));
  return `ещё ${m} мин`;
}

export default function Shop() {
  const { data: view, setData: setView, reload } = useData<GameView>("/api/game");
  const { toast, touch, ai } = useApp();
  const nav = useNavigate();
  const [token, setToken] = useState<number | null>(null);
  const [die, setDie] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [detail, setDetail] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<{ qs: Q[]; correct: number[]; picked: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<null | "theme" | "root">(null);
  const [topic, setTopic] = useState("");
  const [storyTheme, setStoryTheme] = useState("");
  const timer = useRef<number[]>([]);

  useEffect(() => {
    if (view && token === null) setToken(view.pos);
  }, [view, token]);
  useEffect(() => () => timer.current.forEach(clearTimeout), []);

  if (!view)
    return (
      <div className="page">
        <Loading h={420} />
      </div>
    );

  const apply = (v: GameView, ev?: GEvent[]) => {
    setView({ ...v, today: view.today, ai: view.ai });
    if (ev) setEvents(ev);
    touch();
  };

  const doRoll = async () => {
    if (rolling || busy) return;
    setRolling(true);
    setRevealed(null);
    setAnswers([]);
    const spin = window.setInterval(() => setDie(1 + Math.floor(Math.random() * 6)), 80);
    try {
      const r = await api.post<{ die: number; path: number[]; events: GEvent[]; view: GameView }>("/api/game/roll");
      await new Promise((res) => setTimeout(res, 450));
      clearInterval(spin);
      setDie(r.die);
      // фишка шагает по клеткам
      r.path.forEach((cell, k) => timer.current.push(window.setTimeout(() => setToken(cell), 180 * (k + 1))));
      timer.current.push(
        window.setTimeout(
          () => {
            setToken(r.view.pos);
            apply(r.view, r.events);
            setRolling(false);
          },
          180 * (r.path.length + 1),
        ),
      );
    } catch (e) {
      clearInterval(spin);
      setRolling(false);
      toast((e as Error).message, true);
    }
  };

  const act = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const qs = p?.type === "quiz" || p?.type === "misrad" ? [p.q] : p?.type === "ulpan" ? p.qs : [];
      const r = await api.post<{ events: GEvent[]; view: GameView; correct?: number | number[] }>("/api/game/act", { action, payload });
      if (r.correct !== undefined && qs.length)
        setRevealed({
          qs,
          correct: Array.isArray(r.correct) ? r.correct : [r.correct],
          picked: Array.isArray(payload?.answers) ? (payload!.answers as number[]) : [payload?.answer as number],
        });
      setToken(r.view.pos);
      apply(r.view, r.events);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const buildUp = async (cell: number) => {
    setBusy(true);
    try {
      const r = await api.post<{ unlocked: string; view: GameView }>("/api/game/build", { cell });
      apply(r.view);
      toast(`Открыто: ${r.unlocked}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const buyEffect = async (id: string) => {
    setBusy(true);
    try {
      apply(await api.post<GameView>("/api/game/effect", { id }));
      toast("Эффект активирован — действует в уроках");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const story = async (opts: { theme?: string; series?: boolean } = {}) => {
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>("/api/game/story", { lang: "he", ...opts });
      touch();
      nav(`/stories/${r.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const runSuggest = async () => {
    if (!suggest || !topic.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>("/api/game/suggest", { kind: suggest, topic });
      touch();
      nav(`/offers/${r.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const p = view.pending;
  const here = view.cells[view.pos];
  const owned = view.cells.filter((c) => c.owned);
  const fx = view.effects;
  const pk = view.perks;

  const onCell = (i: number) => {
    if (p?.type === "airport" && i !== view.pos) {
      if (confirm(`Лететь в «${CELLS[i].name}» за ${p.fee} росы?`)) act("fly", { cell: i });
      return;
    }
    setDetail(i);
  };

  // ───────── вопрос с вариантами ─────────
  const QuestionView = ({ q, idx, onPick, picked, correct }: { q: Q; idx?: number; onPick: (k: number) => void; picked?: number; correct?: number }) => (
    <div className="col gap-6">
      <div className="center">
        {q.promptHe ? <He text={q.prompt} nikud style={{ fontSize: "1.9rem" }} /> : <b>{q.prompt}</b>}
        <div className="small muted">{q.sub}</div>
      </div>
      <div className="options" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {q.options.map((o, k) => {
          const cls = correct === undefined ? (picked === k ? " sel-opt" : "") : k === correct ? " correct" : k === picked ? " wrong" : "";
          return (
            <button key={k + ":" + idx} className={"option" + cls + (o.he ? " he-opt" : "")} style={{ minHeight: 46, justifyContent: "center" }} onClick={() => onPick(k)} disabled={correct !== undefined || busy}>
              {o.he ? <He text={o.label} nikud /> : o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const pendingView = () => {
    if (!p) return null;
    switch (p.type) {
      case "buy": {
        const c = view.cells[p.cell];
        const b = BUILDINGS[c.building!];
        const d = district(c.district);
        return (
          <div className="col gap-6">
            <div className="row">
              <span className="gdot" style={{ background: d?.color }} />
              <b style={{ fontWeight: 500 }}>
                {c.name} · {d?.name}
              </b>
            </div>
            <div className="small text-2">
              Здесь можно построить <b>{b.name}</b>: {b.pitch}
            </div>
            <div className="row wrap">
              <button className="btn primary" disabled={busy || view.balance < c.price!} onClick={() => act("buy")}>
                Купить участок · {c.price} <Droplets size={14} />
              </button>
              <button className="btn ghost" onClick={() => act("skip")} disabled={busy}>
                Пропустить
              </button>
            </div>
          </div>
        );
      }
      case "quiz":
        return (
          <div className="col gap-6">
            <b style={{ fontWeight: 500 }}>{p.title}</b>
            <span className="small muted">
              Верно — +{p.reward} росы, мимо — +{p.consolation}
            </span>
            <QuestionView q={p.q} onPick={(k) => act("answer", { answer: k })} />
          </div>
        );
      case "misrad":
        return (
          <div className="col gap-6">
            <b style={{ fontWeight: 500 }}>Мисрад а-пним</b>
            <span className="small muted">Чиновник просит справку. Ответь верно — пройдёшь бесплатно и получишь +5. Ошибёшься — пошлина {p.fee}.</span>
            <QuestionView q={p.q} onPick={(k) => act("answer", { answer: k })} />
            <button className="btn ghost sm" onClick={() => act("pay")} disabled={busy}>
              Просто заплатить {p.fee} росы
            </button>
          </div>
        );
      case "ulpan": {
        const k = answers.length;
        if (k < p.qs.length)
          return (
            <div className="col gap-6">
              <b style={{ fontWeight: 500 }}>
                Ульпан · вопрос {k + 1} из {p.qs.length}
              </b>
              <QuestionView
                q={p.qs[k]}
                idx={k}
                onPick={(a) => {
                  const next = [...answers, a];
                  setAnswers(next);
                  if (next.length === p.qs.length) act("answer", { answers: next });
                }}
              />
            </div>
          );
        return <span className="spinner" />;
      }
      case "shuk":
        return (
          <div className="col gap-6">
            <b style={{ fontWeight: 500 }}>Шук Махане Иегуда — выбери товар дня</b>
            <div className="options">
              {p.offers.map((o, k) => (
                <button key={o.id} className="option" onClick={() => act("pick", { index: k })} disabled={busy}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      case "airport":
        return (
          <div className="col gap-6">
            <b style={{ fontWeight: 500 }}>Бен-Гурион</b>
            <span className="small text-2">Нажми на любую клетку поля, чтобы улететь туда за {p.fee} росы.</span>
            <button className="btn ghost sm" onClick={() => act("stay")} disabled={busy}>
              Остаться
            </button>
          </div>
        );
    }
  };

  const mustResolve = p?.type === "misrad";
  const lastResult = revealed && !p;

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <h1>Лавка · игра «Шук»</h1>
          <p>Роса за уроки → броски кубика → участки и здания, которые открывают новое для учёбы и оформления.</p>
        </div>
        <Link to="/practice" className="btn soft">
          Заработать росу <ArrowRight size={15} />
        </Link>
      </div>

      <div className="game-layout">
        {/* ───────── поле ───────── */}
        <div className="board">
          {view.cells.map((c) => {
            const { row, col } = cellGridPos(c.i);
            const d = district(c.district);
            const b = c.building ? BUILDINGS[c.building] : null;
            const Icon = c.kind === "plot" ? (c.owned && c.level > 0 && b ? ICONS[b.icon] : MapPin) : SPECIAL_ICON[c.kind];
            const corner = c.i % 5 === 0;
            return (
              <button
                key={c.i}
                className={"gcell" + (c.owned ? " owned" : "") + (corner ? " corner" : "") + (p?.type === "airport" ? " pickable" : "") + (token === c.i ? " here" : "")}
                style={{ gridRow: row, gridColumn: col }}
                onClick={() => onCell(c.i)}
                title={c.name}
              >
                {d && <span className="gband" style={{ background: d.color }} />}
                <Icon size={18} className="gicon" style={c.kind === "plot" && !c.owned ? { opacity: 0.45 } : undefined} />
                <span className="gname">{c.short}</span>
                {c.kind === "plot" && (
                  <span className="gpips">
                    {c.owned ? (
                      [1, 2, 3].map((k) => <i key={k} className={k <= c.level ? "on" : ""} />)
                    ) : (
                      <span className="gprice">{c.price}</span>
                    )}
                  </span>
                )}
                {token === c.i && (
                  <span className="gtoken">
                    <Sprout size={14} />
                  </span>
                )}
              </button>
            );
          })}
          <div className="gcenter">
            <div className="he gtitle">שׁוּק</div>
            <div className="row" style={{ justifyContent: "center", gap: 14 }}>
              <Die value={die} rolling={rolling} />
              <div className="col gap-4" style={{ alignItems: "flex-start" }}>
                <span className="row gap-4" style={{ fontWeight: 500, fontSize: "1.25rem" }}>
                  <Droplets size={18} className="drop" /> {view.balance}
                </span>
                <span className="tiny muted">сегодня за уроки +{view.today}</span>
              </div>
            </div>
            <button className="btn primary lg" onClick={doRoll} disabled={rolling || busy || mustResolve || (!view.roll.free && view.balance < view.roll.paidCost)}>
              <Dice5 size={19} /> {view.roll.free ? "Бросить бесплатно" : `Бросить · ${view.roll.cost}`}
            </button>
            <div className="tiny muted center">
              {view.roll.freeRolls > 0 && `бесплатных бросков: ${view.roll.freeRolls} · `}
              {view.roll.dailyFree && "ежедневный бросок банка доступен · "}
              {!view.roll.free && view.balance < view.roll.paidCost ? "не хватает росы — пора на урок" : `платных бросков сегодня: ${view.roll.rollsToday}`}
            </div>
          </div>
        </div>

        {/* ───────── ход и решения ───────── */}
        <div className="col gap-16">
          <div className="card col gap-6">
            <div className="row between">
              <h3>{here.name}</h3>
              <span className="he muted">{here.he}</span>
            </div>
            {events.length > 0 && (
              <div className="col gap-4">
                {events.map((e, k) => (
                  <div key={k} className="small" style={{ color: e.tone === "good" ? "var(--ok)" : e.tone === "bad" ? "var(--bad)" : "var(--text-2)" }}>
                    <Mixed text={e.text} />
                  </div>
                ))}
              </div>
            )}
            {lastResult &&
              revealed.qs.map((q, k) => (
                <div key={k} className="card soft" style={{ padding: 10 }}>
                  <QuestionView q={q} idx={k} onPick={() => {}} picked={revealed.picked[k]} correct={revealed.correct[k]} />
                </div>
              ))}
            {p ? <div className="mt-8">{pendingView()}</div> : !events.length && <p className="small muted">{here.hint || "Бросай кубик."}</p>}
          </div>

          {(fx.dew_x2_until || fx.golden_until || fx.hint || fx.retry || view.upgradeDiscount) > 0 && (
            <div className="card col gap-6">
              <h3>Активные эффекты</h3>
              <div className="chips">
                {fx.dew_x2_until > 0 && (
                  <span className="chip static on">
                    <Timer size={13} /> Двойная роса · {untilText(fx.dew_x2_until)}
                  </span>
                )}
                {fx.golden_until > 0 && (
                  <span className="chip static on">
                    <Sparkles size={13} /> Золотой час · {untilText(fx.golden_until)}
                  </span>
                )}
                {fx.hint > 0 && <span className="chip static">Подсказки без штрафа: {fx.hint}</span>}
                {fx.retry > 0 && <span className="chip static">Вторые попытки: {fx.retry}</span>}
                {view.upgradeDiscount > 0 && <span className="chip static">−{Math.round(view.upgradeDiscount * 100)}% на следующую постройку</span>}
              </div>
            </div>
          )}

          <div className="card col gap-6">
            <div className="card-title" style={{ marginBottom: 4 }}>
              <h3>Мои здания</h3>
              <span className="small muted">
                {owned.length} из 10 участков · круг {view.laps}
              </span>
            </div>
            {owned.length === 0 && <p className="small muted">Пока ничего. Остановись на свободном участке и купи его — на каждом можно построить своё здание.</p>}
            {owned.map((c) => {
              const b = BUILDINGS[c.building!];
              const Icon = ICONS[b.icon];
              return (
                <div key={c.i} className="hit" style={{ padding: "8px 6px" }} onClick={() => setDetail(c.i)}>
                  <span className="brand-mark" style={{ width: 34, height: 34, background: district(c.district)?.color, color: "#fff" }}>
                    <Icon size={16} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div>
                      {c.level ? b.name : `Участок без здания`} <span className="muted small">· {c.name}</span>
                    </div>
                    <div className="tiny muted">{c.level ? b.levels[c.level - 1] : `Можно построить: ${b.name}`}</div>
                  </div>
                  <span className="gpips static">
                    {[1, 2, 3].map((k) => (
                      <i key={k} className={k <= c.level ? "on" : ""} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* активности зданий */}
          {(pk.dewBonus > 0 || pk.hostelIncome > 0) && (
            <div className="card col gap-6">
              <h3>Доходы города</h3>
              {pk.dewBonus > 0 && (
                <div className="row small">
                  <Anchor size={15} /> <span className="grow">Порт Яффо: роса за все уроки</span> <b style={{ fontWeight: 500 }}>+{Math.round(pk.dewBonus * 100)}%</b>
                </div>
              )}
              {pk.hostelIncome > 0 && (
                <div className="row small">
                  <BedDouble size={15} /> <span className="grow">Хостел: после первого урока дня</span> <b style={{ fontWeight: 500 }}>+{pk.hostelIncome} росы</b>
                </div>
              )}
            </div>
          )}
          {pk.girl && (
            <Link to="/carmel" className="card link row" style={{ borderColor: "color-mix(in srgb, var(--clay) 40%, var(--border))" }}>
              <span className="brand-mark" style={{ width: 40, height: 40, background: "var(--clay-soft)", color: "var(--clay)" }}>
                <Heart size={18} />
              </span>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>Кафе на Кармеле</div>
                <div className="small muted">Она сидит у окна. Зайти, поговорить, подарить что-нибудь, попросить о помощи.</div>
              </div>
              <ArrowRight size={16} />
            </Link>
          )}
          {view.wheel && view.wheel.perDay > 0 && <WheelCard wheel={view.wheel} onDone={(v) => apply(v)} />}
          {(["cafe", "black"] as const).map((shop) => {
            const list = EFFECTS.filter((e) => e.shop === shop && pk.effects.includes(e.id));
            if (!list.length) return null;
            const disc = shop === "cafe" ? pk.cafeDiscount : pk.blackDiscount;
            return (
              <div key={shop} className="card col gap-6" style={shop === "black" ? { background: "color-mix(in srgb, var(--text) 6%, var(--surface))" } : undefined}>
                <h3 className="row gap-6">
                  {shop === "cafe" ? <Coffee size={16} /> : <Skull size={16} />} {shop === "cafe" ? "Кафе «Ход» — эффекты для уроков" : "Чёрный рынок — сильнодействующее"}
                </h3>
                {shop === "cafe" && pk.morningCoffee && <div className="tiny muted">Утренний кофе: первый урок дня сам включает двойную росу на 20 минут.</div>}
                {list.map((e) => {
                  const price = Math.round(e.price * (1 - disc));
                  return (
                    <div key={e.id} className="row between">
                      <div className="grow">
                        <div>{e.name}</div>
                        <div className="tiny muted">{e.hint}</div>
                      </div>
                      <button className="btn sm soft" disabled={busy || view.balance < price} onClick={() => buyEffect(e.id)}>
                        {price} <Droplets size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {(pk.storyPrice != null || pk.seedsPrice != null) && (
            <div className="card col gap-6">
              <h3 className="row gap-6">
                <Sparkles size={16} /> Сказки и архив
              </h3>
              {!ai && <p className="small" style={{ color: "var(--clay)" }}>Нужен ключ ИИ (ANTHROPIC_API_KEY).</p>}
              {pk.storyPrice != null && (
                <div className="col gap-6">
                  <div className="row between">
                    <div className="grow">
                      <div>Кафе «Сиппур»: сказка из твоих слов</div>
                      <div className="tiny muted">Рассказ из слов, которые пора повторить, и вопросы на понимание</div>
                    </div>
                    <button className="btn sm soft" disabled={busy || !ai || view.balance < pk.storyPrice} onClick={() => story({ theme: storyTheme.trim() || undefined })}>
                      {pk.storyPrice} <Droplets size={13} />
                    </button>
                  </div>
                  {pk.storyThemes && (
                    <input className="input" style={{ padding: "8px 12px" }} value={storyTheme} onChange={(e) => setStoryTheme(e.target.value)} placeholder="тема или жанр: детектив в шуке, свидание, фантастика…" />
                  )}
                  {pk.storySeries && (
                    <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} disabled={busy || !ai || view.balance < pk.storyPrice} onClick={() => story({ series: true, theme: storyTheme.trim() || undefined })}>
                      Следующая серия сериала · {pk.storyPrice} <Droplets size={13} />
                    </button>
                  )}
                </div>
              )}
              {pk.seedsPrice != null && (
                <div className="row between">
                  <div className="grow">
                    <div>Архив корней: слова по теме</div>
                    <div className="tiny muted">10–12 полезных слов по теме, которых у тебя ещё нет{pk.archiveWeeklyFree ? " · одна подборка в неделю бесплатно" : ""}</div>
                  </div>
                  <button className="btn sm soft" disabled={busy || !ai || view.balance < pk.seedsPrice} onClick={() => setSuggest("theme")}>
                    {pk.seedsPrice} <Droplets size={13} />
                  </button>
                </div>
              )}
              {pk.rootPrice != null && (
                <div className="row between">
                  <div className="grow">
                    <div>Архив корней: семья корня</div>
                    <div className="tiny muted">Все слова одного корня во всех биньянах</div>
                  </div>
                  <button className="btn sm soft" disabled={busy || !ai || view.balance < pk.rootPrice} onClick={() => setSuggest("root")}>
                    {pk.rootPrice} <Droplets size={13} />
                  </button>
                </div>
              )}
              <GiftsLinks />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2 stack-sm mt-24">
        <div className="card">
          <div className="card-title">
            <h3>Журнал поля</h3>
          </div>
          <div className="col gap-4" style={{ maxHeight: 280, overflowY: "auto" }}>
            {view.log.length === 0 && <p className="small muted">Здесь будут ходы, покупки и постройки.</p>}
            {view.log.map((l) => (
              <div key={l.id} className="row small">
                <span className="grow text-2">
                  <Mixed text={l.text} />
                </span>
                <span className="tiny muted nowrap">{relTime(l.ts)}</span>
                {l.amount !== null && l.amount !== 0 && (
                  <b style={{ fontWeight: 500, width: 44, textAlign: "right", color: l.amount > 0 ? "var(--ok)" : "var(--clay)" }}>
                    {l.amount > 0 ? "+" : ""}
                    {l.amount}
                  </b>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card small text-2 col gap-6">
          <h3 style={{ color: "var(--text)" }}>Правила</h3>
          <div>
            <b>Роса</b> капает только за уроки: повторение в срок, рост слов, самостоятельное употребление, полностью политый сад.
          </div>
          <div>
            <b>Бросок</b> стоит 10 росы; после трёх платных бросков за день — дороже (+5, потом +10). Шабат, Колесо и некоторые карты дают бесплатные броски.
          </div>
          <div>
            <b>Участок</b> покупается, только когда фишка на нём стоит. <b>Здание</b> на своём участке можно строить и улучшать в любой момент — 3 уровня, каждый что-то
            открывает.
          </div>
          <div>
            <b>Рента</b>: остановился на своём участке — получаешь росу (больше с уровнем здания). Собрал оба участка района — рента ×2 и постройки на 20% дешевле.
          </div>
          <Collapsible title="клетки">
            <div className="col gap-4">
              {CELLS.filter((c) => c.kind !== "plot").map((c) => (
                <div key={c.i}>
                  <b>{c.name}</b> — {c.hint}
                </div>
              ))}
            </div>
          </Collapsible>
        </div>
      </div>

      {detail !== null && (
        <CellModal
          c={view.cells[detail]}
          view={view}
          busy={busy}
          onClose={() => setDetail(null)}
          onBuild={() => buildUp(detail)}
          onReload={reload}
        />
      )}

      {suggest && (
        <Modal onClose={() => setSuggest(null)}>
          <div className="col gap-16">
            <h2>{suggest === "root" ? "Семья корня" : "Слова по теме"}</h2>
            {suggest === "root" ? (
              <HebrewInput lang="he" value={topic} onChange={setTopic} placeholder="ת-פ-ס" autoFocus onEnter={runSuggest} />
            ) : (
              <>
                <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Тема" autoFocus onKeyDown={(e) => e.key === "Enter" && runSuggest()} />
                <div className="chips">
                  {["У врача", "Банк и деньги", "Аренда квартиры", "На работе", "Эмоции", "Сленг"].map((t) => (
                    <button key={t} className="chip" onClick={() => setTopic(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn primary lg" onClick={runSuggest} disabled={!topic.trim() || busy}>
              {busy ? <span className="spinner" /> : null} Подобрать слова
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GiftsLinks() {
  const { data: stories } = useData<{ id: number; title: string; read_at: number | null }[]>("/api/stories");
  const { data: offers } = useData<{ id: number; title: string; kind: string }[]>("/api/offers");
  if (!stories?.length && !offers?.length) return null;
  return (
    <Collapsible title={`мои сказки и подборки (${(stories?.length || 0) + (offers?.length || 0)})`}>
      <div className="col gap-4">
        {stories?.map((s) => (
          <Link key={"s" + s.id} to={`/stories/${s.id}`} className="hit" style={{ padding: "4px 6px" }}>
            <BookHeart size={14} /> <span className="grow small">{s.title}</span> <span className="tiny muted">{s.read_at ? "прочитана" : "новая"}</span>
          </Link>
        ))}
        {offers?.map((o) => (
          <Link key={"o" + o.id} to={`/offers/${o.id}`} className="hit" style={{ padding: "4px 6px" }}>
            <Library size={14} /> <span className="grow small">{o.title}</span>
          </Link>
        ))}
      </div>
    </Collapsible>
  );
}

function CellModal({ c, view, busy, onClose, onBuild }: { c: GCell; view: GameView; busy: boolean; onClose: () => void; onBuild: () => void; onReload: () => void }) {
  const d = district(c.district);
  const b = c.building ? BUILDINGS[c.building] : null;
  const Icon = b ? ICONS[b.icon] : SPECIAL_ICON[c.kind];
  return (
    <Modal onClose={onClose}>
      <div className="col gap-16">
        <div className="row">
          <span className="brand-mark" style={{ width: 44, height: 44, background: d?.color || "var(--accent)", color: "#fff" }}>
            <Icon size={20} />
          </span>
          <div className="grow">
            <h2>{c.name}</h2>
            <div className="small muted">
              <span className="he">{c.he}</span>
              {d && ` · район ${d.name}${c.complete ? " (собран целиком)" : ""}`}
            </div>
          </div>
        </div>
        {!b && <p className="text-2">{c.hint}</p>}
        {b && (
          <>
            <div>
              <div style={{ fontWeight: 500 }}>
                {b.name} <span className="he muted">{b.he}</span>
                {b.kind === "ai" && <span className="badge water" style={{ marginLeft: 8 }}>ИИ</span>}
              </div>
              <p className="small text-2 mt-8">{b.pitch}</p>
            </div>
            <div className="col gap-6">
              {b.levels.map((lv, k) => (
                <div key={k} className="row top" style={{ opacity: c.level > k ? 1 : 0.7 }}>
                  <span className={"badge " + (c.level > k ? "accent" : "")} style={{ minWidth: 54, justifyContent: "center" }}>
                    {c.level > k ? <Check size={12} /> : <Lock size={11} />} ур. {k + 1}
                  </span>
                  <span className="small">{lv}</span>
                </div>
              ))}
            </div>
            <div className="small muted">
              Рента при остановке: {[3, 8, 14, 22][c.level] * (c.complete ? 2 : 1)} росы{c.complete ? " (район собран ×2)" : ""}
            </div>
            {!c.owned ? (
              <p className="small" style={{ color: "var(--clay)" }}>
                Участок стоит {c.price} росы. Купить можно, когда фишка остановится здесь.
              </p>
            ) : c.level < 3 ? (
              <button className="btn primary lg" disabled={busy || c.nextPrice === null || view.balance < (c.nextPrice || 0)} onClick={onBuild}>
                {c.level ? `Улучшить до уровня ${c.level + 1}` : `Построить: ${b.name}`} · {c.nextPrice} <Droplets size={15} />
              </button>
            ) : (
              <span className="badge gold">Максимальный уровень</span>
            )}
            {c.owned && c.level > 0 && <BuildingLinks building={b.id} perks={view.perks} />}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Куда ведёт построенное здание. */
function BuildingLinks({ building, perks }: { building: string; perks: Perks }) {
  if (building === "design")
    return (
      <div className="card soft">
        <DesignPickers />
      </div>
    );
  if (building === "arena")
    return (
      <div className="row wrap">
        <Link to="/practice/blitz" className="btn soft sm">
          Открыть «Блиц»
        </Link>
        {perks.dictation && (
          <Link to="/practice/dictation" className="btn soft sm">
            Открыть «Диктант»
          </Link>
        )}
      </div>
    );
  if (building === "girl")
    return (
      <Link to="/carmel" className="btn primary sm">
        <Heart size={14} /> Зайти в кафе
      </Link>
    );
  if (building === "port") return <p className="small text-2">Сейчас: +{Math.round(perks.dewBonus * 100)}% ко всей росе за уроки.</p>;
  if (building === "hostel") return <p className="small text-2">Сейчас: +{perks.hostelIncome} росы каждый день после первого урока.</p>;
  return null;
}

/** Колесо Цфата: оборот бесплатный (лимит в день), приз забираешь верным ответом. */
function WheelCard({ wheel, onDone }: { wheel: GameView["wheel"]; onDone: (v: GameView) => void }) {
  const { toast, touch } = useApp();
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [pending, setPending] = useState(wheel.pending);
  const [result, setResult] = useState<{ ok: boolean; correct: number; picked: number } | null>(null);
  const [left, setLeft] = useState(wheel.left);
  const n = wheel.prizes.length;
  const seg = 360 / n;

  const spin = async () => {
    setSpinning(true);
    setResult(null);
    try {
      const r = await api.post<{ index: number; prize: string; q: Q; state: GameView["wheel"] }>("/api/game/spin");
      // крутим так, чтобы выпавший сектор оказался под указателем сверху
      const target = 360 * 5 + (360 - (r.index * seg + seg / 2));
      setAngle((a) => a - (a % 360) + target);
      setTimeout(() => {
        setSpinning(false);
        setPending({ prize: r.prize, index: r.index, q: r.q });
        setLeft(r.state.left);
      }, 2600);
    } catch (e) {
      setSpinning(false);
      toast((e as Error).message, true);
    }
  };
  const claim = async (k: number) => {
    try {
      const r = await api.post<{ ok: boolean; correct: number; state: GameView["wheel"] }>("/api/game/spin/claim", { answer: k });
      setResult({ ok: r.ok, correct: r.correct, picked: k });
      setLeft(r.state.left);
      touch();
      onDone(await api.get<GameView>("/api/game"));
      setTimeout(() => setPending(null), 1800);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="card col gap-6">
      <div className="row between">
        <h3 className="row gap-6">
          <Disc3 size={16} /> Колесо Цфата
        </h3>
        <span className="small muted">
          оборотов сегодня: {left} из {wheel.perDay}
        </span>
      </div>
      <div className="row wrap gap-16" style={{ justifyContent: "center" }}>
        <div style={{ position: "relative", width: 180, height: 190 }}>
          <svg width="180" height="180" viewBox="-100 -100 200 200" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? "transform 2.5s cubic-bezier(.17,.67,.2,1)" : "none", marginTop: 10 }}>
            {wheel.prizes.map((label, i) => {
              const a0 = ((i * seg - 90) * Math.PI) / 180;
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
              const jp = label.startsWith("ДЖЕКПОТ");
              const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
              return (
                <g key={i}>
                  <path
                    d={`M0 0 L${95 * Math.cos(a0)} ${95 * Math.sin(a0)} A95 95 0 0 1 ${95 * Math.cos(a1)} ${95 * Math.sin(a1)} Z`}
                    fill={jp ? "var(--gold)" : i % 2 ? "var(--accent-soft)" : "var(--surface-2)"}
                    stroke="var(--border-strong)"
                    strokeWidth="1"
                  />
                  <text
                    x={56 * Math.cos(mid)}
                    y={56 * Math.sin(mid)}
                    fontSize="9"
                    fontWeight={jp ? 600 : 400}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text)"
                    transform={`rotate(${(i + 0.5) * seg - 90} ${56 * Math.cos(mid)} ${56 * Math.sin(mid)})`}
                  >
                    {wheel.shorts?.[i] ?? label.slice(0, 10)}
                  </text>
                </g>
              );
            })}
            <circle r="14" fill="var(--surface)" stroke="var(--border-strong)" />
          </svg>
          <div style={{ position: "absolute", top: 0, left: 82, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "14px solid var(--clay)" }} />
        </div>
        <div className="col gap-6" style={{ flex: "1 1 200px", minWidth: 0 }}>
          {!pending ? (
            <>
              <p className="small text-2">Крути — и ответь на вопрос по своим словам, чтобы забрать приз. Мимо — утешительные 3 росы.</p>
              <button className="btn primary" onClick={spin} disabled={spinning || left <= 0}>
                {spinning ? <span className="spinner" /> : <Disc3 size={16} />} {left > 0 ? "Крутить" : "Завтра снова"}
              </button>
            </>
          ) : (
            <>
              <div className="small">
                Выпало: <b style={{ fontWeight: 500 }}>{pending.prize}</b>
              </div>
              <div className="center">
                {pending.q.promptHe ? <He text={pending.q.prompt} nikud style={{ fontSize: "1.6rem" }} /> : <b>{pending.q.prompt}</b>}
                <div className="tiny muted">{pending.q.sub}</div>
              </div>
              <div className="options" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {pending.q.options.map((o, k) => {
                  const cls = !result ? "" : k === result.correct ? " correct" : k === result.picked ? " wrong" : "";
                  return (
                    <button key={k} className={"option" + cls + (o.he ? " he-opt" : "")} style={{ minHeight: 42, justifyContent: "center" }} disabled={!!result} onClick={() => claim(k)}>
                      {o.he ? <He text={o.label} nikud /> : o.label}
                    </button>
                  );
                })}
              </div>
              {result && <div className="small" style={{ color: result.ok ? "var(--ok)" : "var(--clay)" }}>{result.ok ? "Приз твой!" : "Мимо — утешительные 3 росы"}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

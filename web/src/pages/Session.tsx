import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { X, RotateCcw, Sprout, Unlock, Droplets } from "lucide-react";
import { api } from "../lib/api";
import { useApp, plural } from "../lib/app";
import type { ExerciseItem } from "../../../shared/types";
import { STAGES, facetInfo } from "../../../shared/memory";
import { Bar, Plant, Empty, WordFace } from "../components/ui";
import type { ExResult } from "../exercises/common";
import { IntroEx, FlashEx, ChoiceEx, ListenEx } from "../exercises/basic";
import { RecallEx, ClozeEx, ConjugateEx } from "../exercises/typed";
import { ProduceEx, AnalyzeEx, MatchGame } from "../exercises/advanced";
import { DictationEx, BlitzGame } from "../exercises/extra";

interface ReviewRes {
  unlocked: string[];
  stageBefore: number;
  stageAfter: number;
  masteryBefore: number;
  masteryAfter: number;
  dew?: number;
}

interface Log {
  item: ExerciseItem;
  r: ExResult;
  review?: ReviewRes;
}

const TITLES: Record<string, string> = {
  mix: "Полив",
  flash: "Карточки",
  choice: "Быстрый выбор",
  recall: "Вспомни сам",
  listen: "На слух",
  context: "В контексте",
  produce: "Своя фраза",
  conjugate: "Спряжение",
  analyze: "Разбор формы",
  match: "Пары",
  twins: "Близнецы",
  weak: "Слабые места",
  word: "Тренировка слова",
  dictation: "Диктант",
  blitz: "Блиц",
};

export default function Session() {
  const { mode = "mix" } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { touch, toast, effects, setEffects } = useApp();
  const [queue, setQueue] = useState<ExerciseItem[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const [idx, setIdx] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [finished, setFinished] = useState(false);
  const [round, setRound] = useState(0);
  const t0 = useRef(Date.now());
  const requeued = useRef(new Set<string>());

  const query = useMemo(() => {
    const p = new URLSearchParams(sp);
    p.set("mode", mode);
    return p.toString();
  }, [mode, sp]);

  useEffect(() => {
    setQueue(null);
    setIdx(0);
    setLogs([]);
    setFinished(false);
    requeued.current = new Set();
    t0.current = Date.now();
    api
      .get<{ items: ExerciseItem[]; note?: string; locked?: boolean }>(`/api/session?${query}`)
      .then((r) => {
        setQueue(r.items);
        setNote(r.note);
        setLocked(!!r.locked);
      })
      .catch((e) => toast(e.message, true));
  }, [query, round, toast]);

  const send = useCallback(
    async (item: ExerciseItem, r: ExResult): Promise<ReviewRes | undefined> => {
      if (r.serverApplied) return r.review;
      if (!item.facet) return;
      try {
        return await api.post<ReviewRes>("/api/review", {
          word_id: item.word.id,
          lang: item.lang,
          facet: r.facet || item.facet,
          grade: r.grade,
          mode: item.kind === "intro" ? "intro" : mode,
          ms: r.ms,
          confidence: r.confidence ?? null,
          correct: r.correct,
          detail: r.detail,
          practice: r.practice || (item as any).__practice || false,
          also: r.also,
          confusedWith: r.confusedWith,
        });
      } catch (e) {
        toast((e as Error).message, true);
      }
    },
    [mode, toast],
  );

  // щит: после ошибки можно закрыться — ошибка не попадёт в историю памяти
  const [shieldFor, setShieldFor] = useState<ExResult | null>(null);

  const next = useCallback(
    async (r: ExResult, shielded = false) => {
      if (!queue) return;
      const item = queue[idx];
      if (!shielded && !r.correct && !r.practice && !r.serverApplied && item.kind !== "intro" && effects.shield > 0 && !(item as any).__practice) {
        setShieldFor(r);
        return;
      }
      // ошибка → вернём это упражнение через несколько шагов (без влияния на расписание)
      let q = queue;
      if (r.requeue && !requeued.current.has(item.key) && mode !== "match") {
        requeued.current.add(item.key);
        const copy = { ...item, key: item.key + ":again", __practice: true } as ExerciseItem;
        const pos = Math.min(queue.length, idx + 3 + Math.floor(Math.random() * 3));
        q = [...queue.slice(0, pos), copy, ...queue.slice(pos)];
        setQueue(q);
      }
      const review = await send(item, r);
      setLogs((l) => [...l, { item, r, review }]);
      if (idx + 1 >= q.length) {
        setFinished(true);
        touch();
      } else setIdx(idx + 1);
    },
    [queue, idx, send, mode, touch, effects.shield],
  );

  const useToken = async (type: "skip" | "shield") => {
    try {
      const r = await api.post<{ effects: typeof effects }>("/api/effects/use", { type });
      setEffects(r.effects);
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    }
  };

  const skip = async () => {
    if (!queue || !(await useToken("skip"))) return;
    if (idx + 1 >= queue.length) {
      setFinished(true);
      touch();
    } else setIdx(idx + 1);
  };

  const title = TITLES[mode] || "Практика";
  const progress = queue?.length ? (finished ? 1 : idx / queue.length) : 0;

  return (
    <div className="session">
      <div className="session-top">
        <button className="btn ghost icon" onClick={() => nav(-1)} aria-label="Выйти">
          <X size={20} />
        </button>
        <div className="grow">
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>
              {title}
              {effects.dew_x2_until > Date.now() && <span className="badge gold" style={{ marginLeft: 8 }}>роса ×2</span>}
              {effects.golden_until > Date.now() && <span className="badge gold" style={{ marginLeft: 8 }}>золотой час</span>}
            </span>
            {queue && queue.length > 0 && mode !== "match" && mode !== "blitz" && (
              <span className="muted">
                {Math.min(idx + 1, queue.length)} / {queue.length}
              </span>
            )}
          </div>
          {mode !== "blitz" && <Bar value={progress} thin />}
        </div>
        {effects.skip > 0 && queue && queue.length > 0 && !finished && mode !== "blitz" && mode !== "match" && queue[idx]?.kind !== "intro" && (
          <button className="btn ghost sm" onClick={skip} title="Пропустить упражнение без последствий">
            Пропуск · {effects.skip}
          </button>
        )}
      </div>

      {shieldFor && (
        <div className="card col gap-6" style={{ marginBottom: 14, borderColor: "color-mix(in srgb, var(--gold) 50%, var(--border))" }}>
          <b style={{ fontWeight: 500 }}>Ошибка. Закрыться щитом?</b>
          <span className="small text-2">Щит (осталось {effects.shield}): эта ошибка не попадёт в историю памяти и расписание не собьётся.</span>
          <div className="row">
            <button
              className="btn primary sm"
              onClick={async () => {
                const r = shieldFor;
                setShieldFor(null);
                if (await useToken("shield")) next({ ...r, practice: true, requeue: false }, true);
                else next(r, true);
              }}
            >
              Закрыться щитом
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                const r = shieldFor;
                setShieldFor(null);
                next(r, true);
              }}
            >
              Принять ошибку
            </button>
          </div>
        </div>
      )}

      {!queue && <div className="ex-card skeleton" />}

      {queue && queue.length === 0 && (
        <div className="ex-card">
          <Empty icon={<Sprout size={36} />} title="Сейчас тренировать нечего">
            {note || "Добавь слова или выбери другой режим."}
          </Empty>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link to="/practice" className="btn">
              К режимам
            </Link>
            {locked ? (
              <Link to="/shop" className="btn primary">
                В лавку
              </Link>
            ) : (
              <Link to="/words" className="btn primary">
                Добавить слова
              </Link>
            )}
          </div>
        </div>
      )}

      {queue && queue.length > 0 && !finished && mode === "match" && (
        <MatchGame
          items={queue}
          onResult={(item, r) => {
            void send(item, r);
          }}
          onFinish={() => {
            setFinished(true);
            touch();
          }}
        />
      )}

      {queue && queue.length > 0 && mode === "blitz" && (
        <BlitzGame
          items={queue}
          onAnswer={(item, r) => void send(item, r)}
          onFinish={async (correct, total, seconds) => {
            touch();
            try {
              return await api.post<{ dew: number; best: number; record: boolean }>("/api/blitz/finish", { correct, total, seconds });
            } catch {
              return null;
            }
          }}
        />
      )}

      {queue && queue.length > 0 && !finished && mode !== "match" && mode !== "blitz" && <Exercise key={queue[idx].key} item={queue[idx]} onNext={next} />}

      {finished && <Summary logs={logs} mode={mode} seconds={Math.round((Date.now() - t0.current) / 1000)} onAgain={() => setRound((r) => r + 1)} />}
    </div>
  );
}

function Exercise({ item, onNext }: { item: ExerciseItem; onNext: (r: ExResult) => void }) {
  switch (item.kind) {
    case "intro":
      return <IntroEx item={item} onNext={onNext} />;
    case "flash":
      return <FlashEx item={item} onNext={onNext} />;
    case "choice":
      return <ChoiceEx item={item} onNext={onNext} />;
    case "listen":
      return <ListenEx item={item} onNext={onNext} />;
    case "recall":
      return <RecallEx item={item} onNext={onNext} />;
    case "cloze":
      return <ClozeEx item={item} onNext={onNext} />;
    case "conjugate":
      return <ConjugateEx item={item} onNext={onNext} />;
    case "analyze":
      return <AnalyzeEx item={item} onNext={onNext} />;
    case "dictation":
      return <DictationEx item={item} onNext={onNext} />;
    case "produce":
      return <ProduceEx item={item} onNext={onNext} />;
  }
  return null;
}

function Summary({ logs, mode, seconds, onAgain }: { logs: Log[]; mode: string; seconds: number; onAgain: () => void }) {
  const nav = useNavigate();
  const { perks, touch } = useApp();
  const [rewards, setRewards] = useState<{ text: string; amount?: number }[]>([]);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || mode === "match" || mode === "blitz") return;
    sent.current = true;
    const g = logs.filter((l) => l.item.kind !== "intro" && !l.r.practice);
    const earned = logs.reduce((s, l) => s + (l.review?.dew || 0), 0);
    api
      .post<{ rewards: { text: string; amount?: number }[] }>("/api/session/complete", { graded: g.length, correct: g.filter((l) => l.r.correct).length, dew: earned })
      .then((r) => {
        setRewards(r.rewards);
        if (r.rewards.length) touch();
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const graded = logs.filter((l) => l.item.kind !== "intro");
  const ok = graded.filter((l) => l.r.correct).length;
  const grown = new Map<number, Log>();
  const unlocked: { word: Log["item"]["word"]; lang: string; facet: string }[] = [];
  for (const l of logs) {
    if (l.review && l.review.stageAfter > l.review.stageBefore) grown.set(l.item.word.id, l);
    for (const f of l.review?.unlocked || []) unlocked.push({ word: l.item.word, lang: l.item.lang, facet: f });
  }
  const intros = logs.filter((l) => l.item.kind === "intro").length;
  const dew = logs.reduce((s, l) => s + (l.review?.dew || 0), 0);
  const confident = graded.filter((l) => l.r.confidence === 3);
  const confidentOk = confident.filter((l) => l.r.correct).length;

  return (
    <div className="ex-card celebrate">
      <div className="center col gap-6" style={{ alignItems: "center" }}>
        <Plant stage={ok / Math.max(1, graded.length) > 0.8 ? 4 : 3} size={64} />
        <h2>{mode === "mix" ? "Сад полит" : "Тренировка завершена"}</h2>
        <p className="text-2">
          {graded.length} {plural(graded.length, "упражнение", "упражнения", "упражнений")} · верно {ok} ({Math.round((ok / Math.max(1, graded.length)) * 100)}%) ·{" "}
          {Math.max(1, Math.round(seconds / 60))} мин
          {intros > 0 && (
            <>
              {" "}
              · посажено {intros} {plural(intros, "новое слово", "новых слова", "новых слов")}
            </>
          )}
        </p>
        {dew > 0 && (
          <p className="row gap-4" style={{ justifyContent: "center" }}>
            <Droplets size={16} className="drop" /> +{dew} росы
          </p>
        )}
        {rewards.length > 0 && (
          <div className="card soft col gap-4" style={{ padding: 12, width: "100%" }}>
            {rewards.map((r, k) => (
              <div key={k} className="row between small">
                <span>{r.text}</span>
                {r.amount ? (
                  <b style={{ fontWeight: 500, color: "var(--ok)" }}>
                    +{r.amount} <Droplets size={12} />
                  </b>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {perks.celebration && grown.size > 0 && <LeafFall />}
        {confident.length >= 3 && (
          <p className="small muted">
            Калибровка: когда ты «уверен», ты прав в {Math.round((confidentOk / confident.length) * 100)}% случаев.
          </p>
        )}
      </div>

      {grown.size > 0 && (
        <div className="card soft">
          <div className="small muted" style={{ marginBottom: 8 }}>
            Подросли
          </div>
          <div className="col gap-6">
            {[...grown.values()].map((l) => (
              <Link key={l.item.word.id} to={`/words/${l.item.word.id}`} className="row">
                <Plant stage={l.review!.stageAfter} size={26} />
                <WordFace w={l.item.word} lang={l.item.lang} />
                <span className="small text-2">
                  {STAGES[l.review!.stageBefore].ru} → <b>{STAGES[l.review!.stageAfter].ru}</b>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {unlocked.length > 0 && (
        <div className="card soft">
          <div className="small muted row gap-6" style={{ marginBottom: 8 }}>
            <Unlock size={14} /> Открылись новые навыки
          </div>
          <div className="chips">
            {unlocked.slice(0, 12).map((u, i) => (
              <span key={i} className="chip static">
                <WordFace w={u.word} lang={u.lang as "he" | "en"} /> · {facetInfo(u.facet)?.ru.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="row wrap" style={{ justifyContent: "center" }}>
        <button className="btn lg" onClick={onAgain}>
          <RotateCcw size={17} /> Ещё раунд
        </button>
        <button className="btn primary lg" onClick={() => nav("/")}>
          В сад
        </button>
      </div>
    </div>
  );
}

/** Листопад при росте слов (Дизайн-студия 3 уровня). */
function LeafFall() {
  const leaves = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.4 + Math.random() * 1.6, rot: Math.random() * 360, k: i })), []);
  return (
    <div className="leaf-fall" aria-hidden>
      {leaves.map((l) => (
        <svg key={l.k} width="16" height="16" viewBox="0 0 16 16" style={{ left: `${l.left}%`, animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s`, transform: `rotate(${l.rot}deg)` }}>
          <path d="M8 1 C13 4 14 10 8 15 C2 10 3 4 8 1Z" fill={l.k % 3 ? "var(--accent)" : "var(--gold)"} />
        </svg>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { X, RotateCcw, Sprout, Unlock } from "lucide-react";
import { api } from "../lib/api";
import { useApp, plural } from "../lib/app";
import type { ExerciseItem } from "../../../shared/types";
import { STAGES, facetInfo } from "../../../shared/memory";
import { Bar, Plant, Empty, WordFace } from "../components/ui";
import type { ExResult } from "../exercises/common";
import { IntroEx, FlashEx, ChoiceEx, ListenEx } from "../exercises/basic";
import { RecallEx, ClozeEx, ConjugateEx } from "../exercises/typed";
import { ProduceEx, AnalyzeEx, MatchGame } from "../exercises/advanced";

interface ReviewRes {
  unlocked: string[];
  stageBefore: number;
  stageAfter: number;
  masteryBefore: number;
  masteryAfter: number;
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
};

export default function Session() {
  const { mode = "mix" } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { touch, toast } = useApp();
  const [queue, setQueue] = useState<ExerciseItem[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
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
      .get<{ items: ExerciseItem[]; note?: string }>(`/api/session?${query}`)
      .then((r) => {
        setQueue(r.items);
        setNote(r.note);
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

  const next = useCallback(
    async (r: ExResult) => {
      if (!queue) return;
      const item = queue[idx];
      const reviewP = send(item, r);
      // ошибка → вернём это упражнение через несколько шагов (без влияния на расписание)
      let q = queue;
      if (r.requeue && !requeued.current.has(item.key) && mode !== "match") {
        requeued.current.add(item.key);
        const copy = { ...item, key: item.key + ":again", __practice: true } as ExerciseItem;
        const pos = Math.min(queue.length, idx + 3 + Math.floor(Math.random() * 3));
        q = [...queue.slice(0, pos), copy, ...queue.slice(pos)];
        setQueue(q);
      }
      const review = await reviewP;
      setLogs((l) => [...l, { item, r, review }]);
      if (idx + 1 >= q.length) {
        setFinished(true);
        touch();
      } else setIdx(idx + 1);
    },
    [queue, idx, send, mode, touch],
  );

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
            <span style={{ fontWeight: 500 }}>{title}</span>
            {queue && queue.length > 0 && mode !== "match" && (
              <span className="muted">
                {Math.min(idx + 1, queue.length)} / {queue.length}
              </span>
            )}
          </div>
          <Bar value={progress} thin />
        </div>
      </div>

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
            <Link to="/words" className="btn primary">
              Добавить слова
            </Link>
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

      {queue && queue.length > 0 && !finished && mode !== "match" && <Exercise key={queue[idx].key} item={queue[idx]} onNext={next} />}

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
    case "produce":
      return <ProduceEx item={item} onNext={onNext} />;
  }
  return null;
}

function Summary({ logs, mode, seconds, onAgain }: { logs: Log[]; mode: string; seconds: number; onAgain: () => void }) {
  const nav = useNavigate();
  const graded = logs.filter((l) => l.item.kind !== "intro");
  const ok = graded.filter((l) => l.r.correct).length;
  const grown = new Map<number, Log>();
  const unlocked: { word: Log["item"]["word"]; lang: string; facet: string }[] = [];
  for (const l of logs) {
    if (l.review && l.review.stageAfter > l.review.stageBefore) grown.set(l.item.word.id, l);
    for (const f of l.review?.unlocked || []) unlocked.push({ word: l.item.word, lang: l.item.lang, facet: f });
  }
  const intros = logs.filter((l) => l.item.kind === "intro").length;
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

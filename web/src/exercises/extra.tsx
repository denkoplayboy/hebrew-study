import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Volume2, Zap, Droplets, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { normHe, normEn, stripNikud } from "../../../shared/lang";
import type { ExerciseItem } from "../../../shared/types";
import { He } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";
import { useSpeak, hasVoice, useApp } from "../lib/app";
import { Diff } from "../pages/Journal";
import { ContinueBar, Feedback, KindLabel, targetOf, type ExProps, type ExResult } from "./common";

/** Диктант: слушаешь предложение — записываешь его целиком. */
export function DictationEx({ item, onNext }: ExProps) {
  const ex = item.example!;
  const lang = item.lang;
  const speak = useSpeak();
  const [val, setVal] = useState("");
  const [res, setRes] = useState<{ score: number; targetOk: boolean; ms: number } | null>(null);
  const plays = useRef(0);
  const t0 = useRef(Date.now());
  const audio = lang === "he" ? ex.text_nikud || ex.text : ex.text;
  const play = (slow = false) => {
    plays.current++;
    speak(audio, lang, slow);
  };
  useEffect(() => {
    const t = setTimeout(() => play(), 400);
    return () => clearTimeout(t);
  }, [ex.text]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (s: string) => (lang === "he" ? normHe(s) : normEn(s));
  const check = () => {
    if (!val.trim() || res) return;
    const want = ex.text.split(/\s+/).map(n).filter(Boolean);
    const got = val.split(/\s+/).map(n).filter(Boolean);
    // доля слов эталона, найденных по порядку (LCS)
    const dp = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
    for (let i = want.length - 1; i >= 0; i--)
      for (let j = got.length - 1; j >= 0; j--) dp[i][j] = want[i] === got[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const score = want.length ? dp[0][0] / Math.max(want.length, got.length) : 0;
    const targetOk = got.includes(n(ex.target));
    setRes({ score, targetOk, ms: Date.now() - t0.current });
  };
  const finish = () => {
    if (!res) return;
    const g = res.score >= 0.999 ? (plays.current <= 2 ? 4 : 3) : res.score >= 0.7 ? 2 : 1;
    onNext({
      grade: g as 1 | 2 | 3 | 4,
      correct: res.score >= 0.7,
      ms: res.ms,
      also: [{ facet: "spell", grade: res.targetOk ? 3 : 1 }],
      requeue: res.score < 0.7,
      detail: { given: val, score: Math.round(res.score * 100), plays: plays.current },
    });
  };

  return (
    <div className="ex-card">
      <KindLabel icon={<Headphones size={14} />}>Диктант · запиши, что слышишь</KindLabel>
      <div className="ex-prompt col gap-16" style={{ alignItems: "center" }}>
        <button className="btn primary lg" style={{ width: 88, height: 88, borderRadius: 30 }} onClick={() => play()}>
          <Volume2 size={34} />
        </button>
        <button className="btn ghost sm" onClick={() => play(true)}>
          медленнее
        </button>
        {!hasVoice(lang) && <div className="small" style={{ color: "var(--clay)" }}>На устройстве нет голоса для этого языка — диктант не прозвучит.</div>}
      </div>
      <HebrewInput lang={lang} value={val} onChange={setVal} big autoFocus wordMode={false} disabled={!!res} onEnter={() => (res ? finish() : check())} />
      {!res ? (
        <button className="btn primary lg block" onClick={check} disabled={!val.trim()}>
          Проверить
        </button>
      ) : (
        <>
          <Feedback kind={res.score >= 0.999 ? "ok" : res.score >= 0.7 ? "close" : "bad"} title={res.score >= 0.999 ? "Слово в слово" : `Совпало ${Math.round(res.score * 100)}%`}>
            <Diff a={val} b={ex.text} he={lang === "he"} />
            {lang === "he" && ex.text_nikud && (
              <div className="mt-8">
                <He text={ex.text_nikud} nikud style={{ fontSize: "1.2rem" }} />
              </div>
            )}
            <div className="small text-2 mt-8">{ex.ru}</div>
          </Feedback>
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

/** Блиц: 60 секунд, только знакомые слова. */
export function BlitzGame({
  items,
  onAnswer,
  onFinish,
}: {
  items: ExerciseItem[];
  onAnswer: (item: ExerciseItem, r: ExResult) => void;
  onFinish: (correct: number, total: number, seconds: number) => Promise<{ dew: number; best: number; record: boolean } | null>;
}) {
  const { perks } = useApp();
  const [DURATION, setDuration] = useState(60);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(60);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [flash, setFlash] = useState<null | "ok" | "bad">(null);
  const [result, setResult] = useState<{ dew: number; best: number; record: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const shown = useRef(Date.now());
  const scoreRef = useRef(score);
  scoreRef.current = score;

  useEffect(() => {
    if (!started || over) return;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [started, over]);
  useEffect(() => {
    if (left <= 0 && !over) {
      setOver(true);
      onFinish(scoreRef.current.ok, scoreRef.current.total, DURATION).then(setResult);
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = items[i % items.length];
  const toRu = item?.direction !== "to_target";
  const choose = (id: number) => {
    if (over || flash) return;
    const ok = id === item.word.id;
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    onAnswer(item, { grade: ok ? 3 : 1, correct: ok, ms: Date.now() - shown.current, practice: true, confusedWith: ok ? undefined : id });
    setFlash(ok ? "ok" : "bad");
    setTimeout(
      () => {
        setFlash(null);
        setI((x) => x + 1);
        shown.current = Date.now();
      },
      ok ? 180 : 650,
    );
  };
  useEffect(() => {
    if (!started || over) return;
    const h = (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (k >= 1 && k <= (item?.options?.length || 0)) choose(item.options![k - 1].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const label = useMemo(() => (toRu ? null : item?.word.ru), [item, toRu]);

  if (!started)
    return (
      <div className="ex-card" style={{ alignItems: "center", textAlign: "center", justifyContent: "center" }}>
        <Zap size={40} color="var(--gold)" />
        <h2>Блиц</h2>
        <p className="text-2">60 секунд. Только знакомые слова. Ошибка стоит времени, а не очков. Клавиши 1–4 работают.</p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <button className="btn primary lg" onClick={() => (setDuration(60), setLeft(60), setStarted(true), (shown.current = Date.now()))}>
            Старт · 60 с
          </button>
          {perks.blitzMarathon && (
            <button className="btn lg" onClick={() => (setDuration(120), setLeft(120), setStarted(true), (shown.current = Date.now()))}>
              Марафон · 120 с
            </button>
          )}
        </div>
      </div>
    );

  if (over)
    return (
      <div className="ex-card celebrate" style={{ alignItems: "center", textAlign: "center" }}>
        <Zap size={36} color="var(--gold)" />
        <div style={{ fontSize: "3rem", fontWeight: 500 }}>{score.ok}</div>
        <p className="text-2">
          верных из {score.total} · точность {score.total ? Math.round((score.ok / score.total) * 100) : 0}%
        </p>
        {result && (
          <>
            {result.record && <span className="badge gold">новый рекорд!</span>}
            <p className="small muted">лучший результат: {result.best}</p>
            {result.dew > 0 && (
              <p className="row gap-4">
                <Droplets size={16} className="drop" /> +{result.dew} росы
              </p>
            )}
          </>
        )}
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <button className="btn lg" onClick={() => window.location.reload()}>
            <RotateCcw size={17} /> Ещё раз
          </button>
          <Link to="/" className="btn primary lg">
            В сад
          </Link>
        </div>
      </div>
    );

  return (
    <div className="ex-card" style={{ outline: flash ? `3px solid ${flash === "ok" ? "var(--ok)" : "var(--bad)"}` : undefined, transition: "outline 0.1s" }}>
      <div className="row between">
        <KindLabel icon={<Zap size={14} />}>Блиц</KindLabel>
        <span className="badge gold">{score.ok}</span>
      </div>
      <div className="bar thin">
        <i style={{ width: `${(left / DURATION) * 100}%`, background: left < 10 ? "var(--bad)" : "var(--gold)", transition: "width 1s linear" }} />
      </div>
      <div className="ex-prompt">
        {toRu ? (
          item.lang === "he" ? (
            <He text={item.word.he_nikud || item.word.he} className="big-he" />
          ) : (
            <span className="big-en">{item.word.en}</span>
          )
        ) : (
          <span style={{ fontSize: "1.7rem", fontWeight: 500 }}>{label}</span>
        )}
      </div>
      <div className="options">
        {(item.options || []).map((o, k) => (
          <button
            key={o.id + ":" + k}
            className={"option" + (flash && o.id === item.word.id ? " correct" : "") + (!toRu && item.lang === "he" ? " he-opt" : "")}
            onClick={() => choose(o.id)}
          >
            {!toRu && item.lang === "he" ? <He text={o.label} /> : <span>{o.label}</span>}
            <span className="kbd">{k + 1}</span>
          </button>
        ))}
      </div>
      <div className="tiny muted center">{left} с</div>
    </div>
  );
}

export { targetOf, stripNikud };

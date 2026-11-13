import { useEffect, useMemo, useRef, useState } from "react";
import { PenLine, Microscope, Lightbulb, Star, Puzzle } from "lucide-react";
import { BINYANIM, TENSES, PERSONS, normHe, binyanLabel, tenseLabel, personLabel, type Tense } from "../../../shared/lang";
import type { ExerciseItem, WordSummary } from "../../../shared/types";
import { He, Mixed, SpeakBtn } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";
import { api } from "../lib/api";
import { useApp, useSpeak } from "../lib/app";
import { ContinueBar, Feedback, KindLabel, Reveal, targetOf, WordHint, type ExProps, type ExResult } from "./common";

interface ProduceResp {
  check: { uses_target: boolean; form_used: string; usage_correct: boolean; grammar_ok: boolean; corrected: string; explanation: string; naturalness: number };
  grade: 1 | 2 | 3 | 4;
  review: any;
  bonus: { id: number; he: string; en: string; ru: string; surface: string; spontaneous: boolean; first: boolean }[];
}

/** Своя фраза: видишь только смысл, сам вспоминаешь слово и строишь предложение. */
export function ProduceEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const { ai, toast } = useApp();
  const [val, setVal] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ProduceResp | null>(null);
  const [selfMode, setSelfMode] = useState(false);
  const start = useRef(Date.now());

  const submit = async () => {
    if (!val.trim()) return;
    if (!ai) {
      setSelfMode(true);
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<ProduceResp>("/api/produce/check", { word_id: w.id, lang, sentence: val, ms: Date.now() - start.current, hinted: revealed });
      setResp(r);
    } catch (e) {
      toast((e as Error).message, true);
      setSelfMode(true);
    } finally {
      setBusy(false);
    }
  };

  const selfGrade = (g: 1 | 2 | 3) =>
    onNext({ grade: revealed && g > 2 ? 2 : g, correct: g > 1, ms: Date.now() - start.current, detail: { sentence: val, self: true }, also: g > 1 ? [{ facet: "recall", grade: 3 }] : [] });

  return (
    <div className="ex-card">
      <KindLabel icon={<PenLine size={14} />}>Своя фраза · употребление</KindLabel>
      <div className="ex-prompt col gap-6" style={{ alignItems: "center" }}>
        <span className="small muted">Вспомни слово и напиши с ним предложение {lang === "he" ? "на иврите" : "по-английски"}:</span>
        <span style={{ fontSize: "1.8rem", fontWeight: 500 }}>{w.ru}</span>
        <WordHint w={w} lang={lang} />
        {revealed && (
          <div className="row">
            {lang === "he" ? <He text={w.he_nikud || w.he} style={{ fontSize: "1.6rem" }} /> : <span style={{ fontSize: "1.4rem" }}>{w.en}</span>}
            <SpeakBtn text={targetOf(w, lang)} lang={lang} />
          </div>
        )}
      </div>
      <HebrewInput lang={lang} value={val} onChange={setVal} multiline rows={3} wordMode={false} autoFocus disabled={!!resp || selfMode} onEnter={submit} />
      {!resp && !selfMode && (
        <div className="row wrap">
          <button className="btn primary lg grow" onClick={submit} disabled={!val.trim() || busy}>
            {busy ? <span className="spinner" /> : null} {ai ? "Проверить" : "Готово"}
          </button>
          {!revealed && (
            <button className="btn ghost" onClick={() => setRevealed(true)}>
              <Lightbulb size={16} /> Не вспоминается
            </button>
          )}
        </div>
      )}
      {resp && (
        <>
          <Feedback
            kind={resp.grade >= 3 ? "ok" : resp.grade === 2 ? "close" : "bad"}
            title={
              !resp.check.uses_target
                ? "Целевое слово не найдено в предложении"
                : resp.check.usage_correct
                  ? resp.check.grammar_ok
                    ? "Слово употреблено верно"
                    : "Слово употреблено верно, но есть ошибки"
                  : "Слово употреблено не совсем так"
            }
          >
            {resp.check.corrected && resp.check.corrected.trim() !== val.trim() && (
              <div className={lang === "he" ? "he" : ""} style={{ fontSize: lang === "he" ? "1.3rem" : "1.05rem" }}>
                {resp.check.corrected}
              </div>
            )}
            <div className="small mt-8" style={{ color: "var(--text-2)" }}>
              <Mixed text={resp.check.explanation} />
            </div>
            <div className="tiny mt-8 muted">естественность: {"●".repeat(Math.max(0, Math.min(5, resp.check.naturalness)))}{"○".repeat(5 - Math.max(0, Math.min(5, resp.check.naturalness)))}</div>
          </Feedback>
          {resp.bonus.length > 0 && (
            <div className="feedback close">
              <div className="row gap-6">
                <Star size={16} /> Ещё ты сам употребил:
              </div>
              <div className="chips mt-8">
                {resp.bonus.map((b) => (
                  <span key={b.id} className="chip static">
                    <span className="he">{b.he || b.en}</span> {b.ru}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!resp.check.uses_target && (
            <div className="card soft">
              <Reveal w={w} lang={lang} />
            </div>
          )}
          <ContinueBar onNext={() => onNext({ grade: resp.grade, correct: resp.grade > 1, ms: Date.now() - start.current, serverApplied: true, review: resp.review })} />
        </>
      )}
      {selfMode && (
        <>
          <div className="card soft">
            <Reveal w={w} lang={lang} />
          </div>
          <div className="small muted center">Сравни со словом выше и оцени себя честно:</div>
          <div className="grid grid-3" style={{ gap: 8 }}>
            <button className="btn" onClick={() => selfGrade(1)}>
              Не вспомнил
            </button>
            <button className="btn" onClick={() => selfGrade(2)}>
              Есть сомнения
            </button>
            <button className="btn primary" onClick={() => selfGrade(3)}>
              Употребил верно
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Разбор формы: биньян, время, лицо, корень. */
export function AnalyzeEx({ item, onNext }: ExProps) {
  const w = item.word;
  const f = item.form!;
  const speak = useSpeak();
  const [binyan, setBinyan] = useState<string | null>(null);
  const [tense, setTense] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [root, setRoot] = useState("");
  const [done, setDone] = useState<null | { b: boolean; tp: boolean; r: boolean; ms: number }>(null);
  const start = useRef(Date.now());

  // все разборы, дающие ту же форму (например, קָם — и прошедшее, и настоящее)
  const valid = useMemo(() => (item.forms || []).filter((x) => normHe(x.form) === normHe(f.form)).map((x) => `${x.tense}:${x.person}`), [item.forms, f.form]);
  const rootLetters = normHe(w.root || "").replace(/[\s-]/g, "");
  const isPassive = w.binyan === "pual" || w.binyan === "hufal";
  const tenses = TENSES.filter((t) => !isPassive || (t.id !== "imperative" && t.id !== "infinitive"));

  useEffect(() => {
    const t = setTimeout(() => speak(f.nikud || f.form, "he"), 300);
    return () => clearTimeout(t);
  }, [f, speak]);

  const check = () => {
    const tp = valid.includes(`${tense}:${tense === "infinitive" ? "inf" : person}`);
    const b = binyan === w.binyan;
    const r = !rootLetters || normHe(root).replace(/[\s-]/g, "") === rootLetters;
    setDone({ b, tp, r, ms: Date.now() - start.current });
  };
  const score = done ? [done.b, done.tp, done.r].filter(Boolean).length : 0;
  const finish = () => {
    if (!done) return;
    const g = score === 3 ? (done.ms < 15000 ? 4 : 3) : score === 2 ? 2 : 1;
    onNext({ grade: g as 1 | 2 | 3 | 4, correct: score === 3, ms: done.ms, requeue: score < 2, detail: { tense: f.tense, person: f.person, binyan: w.binyan, parts: done, mode: "analyze" } });
  };

  const persons = tense && tense !== "infinitive" ? PERSONS[tense as Tense] : [];
  const ready = binyan && tense && (tense === "infinitive" || person) && (!rootLetters || root.trim());

  return (
    <div className="ex-card">
      <KindLabel icon={<Microscope size={14} />}>Разбор формы</KindLabel>
      <div className="ex-prompt col gap-4" style={{ alignItems: "center" }}>
        <He text={f.nikud || f.form} nikud className="big-he" />
        <SpeakBtn text={f.nikud || f.form} lang="he" slowToo />
      </div>
      <div className="col gap-16">
        <div>
          <div className="label">Биньян</div>
          <div className="chips">
            {BINYANIM.map((b) => (
              <button
                key={b.id}
                className={"chip" + (binyan === b.id ? " on" : "")}
                style={done ? { borderColor: b.id === w.binyan ? "var(--ok)" : binyan === b.id ? "var(--bad)" : undefined } : undefined}
                onClick={() => !done && setBinyan(b.id)}
              >
                <span className="he">{b.plain}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">Время</div>
          <div className="chips">
            {tenses.map((t) => (
              <button
                key={t.id}
                className={"chip" + (tense === t.id ? " on" : "")}
                onClick={() => {
                  if (done) return;
                  setTense(t.id);
                  setPerson(null);
                }}
              >
                <span className="he">{t.he}</span> {t.ru}
              </button>
            ))}
          </div>
        </div>
        {persons.length > 0 && (
          <div>
            <div className="label">Лицо (גוף)</div>
            <div className="chips">
              {persons.map((p) => (
                <button key={p.id} className={"chip" + (person === p.id ? " on" : "")} onClick={() => !done && setPerson(p.id)}>
                  <span className="he">{p.he}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {rootLetters && (
          <div>
            <div className="label">Корень (שורש)</div>
            <HebrewInput lang="he" value={root} onChange={setRoot} disabled={!!done} placeholder="ת-פ-ס" onEnter={() => ready && !done && check()} />
          </div>
        )}
      </div>
      {!done ? (
        <button className="btn primary lg block" disabled={!ready} onClick={check}>
          Проверить разбор
        </button>
      ) : (
        <>
          <Feedback kind={score === 3 ? "ok" : score === 2 ? "close" : "bad"} title={score === 3 ? "Разбор верный" : `Верно ${score} из 3`}>
            <div className="col gap-4 small">
              <div>
                {done.b ? "✓" : "✗"} биньян: <span className="he">{binyanLabel(w.binyan)?.plain}</span> ({binyanLabel(w.binyan)?.ru})
              </div>
              <div>
                {done.tp ? "✓" : "✗"} {valid
                  .map((v) => {
                    const [t, p] = v.split(":");
                    return `${tenseLabel(t).ru}${t !== "infinitive" ? ", " + personLabel(t, p).he : ""}`;
                  })
                  .join(" или ")}
              </div>
              {rootLetters && (
                <div>
                  {done.r ? "✓" : "✗"} корень: <span className="he">{w.root}</span>
                </div>
              )}
              <div className="mt-8">
                Глагол: <He text={w.he_nikud || w.he} /> — {w.ru}
              </div>
            </div>
          </Feedback>
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

/** Пары: соедини слово и перевод на время. */
export function MatchGame({ items, onResult, onFinish }: { items: ExerciseItem[]; onResult: (item: ExerciseItem, r: ExResult) => void; onFinish: () => void }) {
  const rounds = useMemo(() => {
    const out: ExerciseItem[][] = [];
    for (let i = 0; i < items.length; i += 6) out.push(items.slice(i, i + 6));
    return out.filter((r) => r.length >= 2);
  }, [items]);
  const [round, setRound] = useState(0);
  const cur = rounds[round] || [];
  const [left, setLeft] = useState<ExerciseItem[]>([]);
  const [right, setRight] = useState<ExerciseItem[]>([]);
  const [sel, setSel] = useState<{ side: "l" | "r"; key: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [misses, setMisses] = useState<Set<string>>(new Set());
  const [t0, setT0] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const speak = useSpeak();

  useEffect(() => {
    const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
    setLeft(shuffle(cur));
    setRight(shuffle(cur));
    setMatched(new Set());
    setMisses(new Set());
    setSel(null);
    setT0(Date.now());
  }, [round, rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const pick = (side: "l" | "r", it: ExerciseItem) => {
    if (matched.has(it.key)) return;
    if (side === "l") speak(targetOf(it.word, it.lang), it.lang);
    if (!sel || sel.side === side) return setSel({ side, key: it.key });
    const other = cur.find((x) => x.key === sel.key)!;
    if (other.key === it.key) {
      const m = new Set(matched);
      m.add(it.key);
      setMatched(m);
      setSel(null);
      onResult(it, { grade: misses.has(it.key) ? 2 : 3, correct: true, ms: 0, practice: true });
      if (m.size === cur.length) setTimeout(() => (round + 1 < rounds.length ? setRound(round + 1) : onFinish()), 500);
    } else {
      setWrong(it.key + "|" + other.key);
      setMisses(new Set([...misses, it.key, other.key]));
      onResult(it, { grade: 1, correct: false, ms: 0, practice: true, confusedWith: other.word.id });
      setTimeout(() => setWrong(null), 450);
      setSel(null);
    }
  };

  const cell = (side: "l" | "r", it: ExerciseItem) => {
    const isSel = sel?.side === side && sel.key === it.key;
    const isMatched = matched.has(it.key);
    const isWrong = wrong?.includes(it.key);
    const w: WordSummary = it.word;
    return (
      <button
        key={side + it.key}
        className={"option" + (isMatched ? " correct" : isWrong ? " wrong" : "") + (side === "l" && it.lang === "he" ? " he-opt" : "")}
        style={{ opacity: isMatched ? 0.35 : 1, outline: isSel ? "2px solid var(--accent)" : undefined, justifyContent: "center", minHeight: 58 }}
        onClick={() => pick(side, it)}
        disabled={isMatched}
      >
        {side === "l" ? it.lang === "he" ? <He text={w.he_nikud || w.he} /> : w.en : <span style={{ fontSize: "0.95rem" }}>{w.ru}</span>}
      </button>
    );
  };

  if (!rounds.length) return null;
  return (
    <div className="ex-card">
      <KindLabel icon={<Puzzle size={14} />}>
        Пары · раунд {round + 1} из {rounds.length} · {Math.round((now - t0) / 1000)} с
      </KindLabel>
      <div className="grid grid-2" style={{ gap: 10 }}>
        <div className="col gap-6">{left.map((it) => cell("l", it))}</div>
        <div className="col gap-6">{right.map((it) => cell("r", it))}</div>
      </div>
    </div>
  );
}

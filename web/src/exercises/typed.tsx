import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, TextCursorInput, Table2, Lightbulb } from "lucide-react";
import { checkAnswer, stripNikud, tenseLabel, personLabel, binyanLabel, normHe, EN_FORMS, PERSONS, type Tense } from "../../../shared/lang";
import { He, SpeakBtn } from "../components/ui";
import { HebrewInput, type HebrewInputHandle } from "../components/HebrewInput";
import { useSpeak } from "../lib/app";
import { acceptedOf, CheckButtons, ContinueBar, Feedback, gradeTyped, KindLabel, Reveal, RetryOffer, targetOf, useTokens, WordHint, type ExProps } from "./common";
import type { Facet } from "../../../shared/memory";

type Verdict = "exact" | "close" | "wrong";

function confidenceNote(verdict: Verdict, conf: 1 | 2 | 3 | null) {
  if (verdict === "wrong" && conf === 3) return "Уверенная ошибка — такие исправления запоминаются лучше всего. Посмотри внимательно.";
  if (verdict === "exact" && conf === 1) return "Угадал верно — слово вернётся пораньше, чтобы закрепить.";
  return null;
}

/** Вспомни сам: по-русски → пишешь слово. */
export function RecallEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const [val, setVal] = useState("");
  const [hint, setHint] = useState(0);
  const [res, setRes] = useState<{ verdict: Verdict; conf: 1 | 2 | 3 | null; ms: number } | null>(null);
  const tokens = useTokens();
  const [freeHint, setFreeHint] = useState(false);
  const [retried, setRetried] = useState(false);
  const [offerRetry, setOfferRetry] = useState(false);
  const [override, setOverride] = useState(false);
  const start = useRef(Date.now());
  const speak = useSpeak();
  const inputRef = useRef<HebrewInputHandle>(null);
  const target = lang === "he" ? w.he : w.en;

  const check = (conf: 1 | 2 | 3 | null) => {
    if (!val.trim() || res) return;
    const verdict = checkAnswer(lang, val, acceptedOf(w, lang));
    setRes({ verdict, conf, ms: Date.now() - start.current });
    if (verdict === "wrong" && !retried && tokens.retry > 0) return setOfferRetry(true);
    speak(targetOf(w, lang), lang);
  };

  const finish = () => {
    if (!res) return;
    const verdict: Verdict = override ? "exact" : res.verdict;
    let g = gradeTyped(verdict, res.conf, res.ms, hint > 0 && !freeHint);
    if (retried && verdict !== "wrong") g = Math.min(g, 2) as typeof g;
    const main = item.facet as Facet;
    const other: Facet = main === "spell" ? "recall" : "spell";
    const otherGrade = other === "spell" ? (verdict === "exact" ? g : 1) : verdict === "wrong" ? 1 : 3;
    onNext({
      grade: main === "spell" && verdict === "close" ? 1 : g,
      correct: verdict !== "wrong",
      confidence: res.conf,
      ms: res.ms,
      also: [{ facet: other, grade: otherGrade as 1 | 2 | 3 | 4 }],
      requeue: verdict === "wrong",
      detail: { given: val, verdict, hint, freeHint, retried },
    });
  };

  const hintText = useMemo(() => {
    const t = stripNikud(target);
    if (!hint) return "";
    const shown = t.slice(0, hint);
    return shown + t.slice(hint).replace(/\S/g, " _");
  }, [hint, target]);

  return (
    <div className="ex-card">
      <KindLabel icon={<Brain size={14} />}>
        Вспомни сам · {lang === "he" ? "на иврите" : "по-английски"}
      </KindLabel>
      <div className="ex-prompt col gap-6" style={{ alignItems: "center" }}>
        <span style={{ fontSize: "1.9rem", fontWeight: 500, lineHeight: 1.2 }}>{w.ru}</span>
        {w.ru_alt && <span className="small muted">{w.ru_alt}</span>}
        <WordHint w={w} lang={lang} />
        {hint > 0 && !res && (
          <div className={lang === "he" ? "he" : ""} style={{ fontSize: "1.5rem", letterSpacing: "0.1em", color: "var(--muted)" }}>
            {hintText}
          </div>
        )}
      </div>
      <HebrewInput ref={inputRef} lang={lang} value={val} onChange={setVal} big autoFocus disabled={!!res} onEnter={() => (res ? finish() : check(2))} placeholder={lang === "he" ? "כתוב כאן…" : "type here…"} />
      {!res ? (
        <>
          <CheckButtons onCheck={check} disabled={!val.trim()} />
          <button
            className="btn ghost sm"
            style={{ alignSelf: "center" }}
            onClick={async () => {
              if (!freeHint && tokens.hint > 0 && (await tokens.use("hint"))) setFreeHint(true);
              setHint((h) => Math.min(h + 1, stripNikud(target).length - 1));
            }}
          >
            <Lightbulb size={15} /> Подсказка {hint > 0 && `(${hint})`}
            {(freeHint || tokens.hint > 0) && <span className="badge accent">без штрафа{!freeHint && ` · ${tokens.hint}`}</span>}
          </button>
        </>
      ) : offerRetry ? (
        <RetryOffer
          left={tokens.retry}
          onReveal={() => {
            setOfferRetry(false);
            speak(targetOf(w, lang), lang);
          }}
          onRetry={async () => {
            if (await tokens.use("retry")) {
              setRetried(true);
              setOfferRetry(false);
              setRes(null);
              setVal("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
        />
      ) : (
        <>
          {res.verdict === "exact" || override ? (
            <Feedback kind="ok" title={override ? "Засчитано" : "Верно"}>
              <Reveal w={w} lang={lang} />
            </Feedback>
          ) : res.verdict === "close" ? (
            <Feedback kind="close" title="Почти — слово верное, но написание другое">
              <Reveal w={w} lang={lang} />
              <div className="small mt-8">
                Ты написал: <span className={lang === "he" ? "he" : ""}>{val}</span>
              </div>
            </Feedback>
          ) : (
            <Feedback kind="bad" title="Не то слово">
              <Reveal w={w} lang={lang} />
              <div className="small mt-8">
                Ты написал: <span className={lang === "he" ? "he" : ""}>{val}</span>
              </div>
            </Feedback>
          )}
          {confidenceNote(res.verdict, res.conf) && <div className="small muted center">{confidenceNote(res.verdict, res.conf)}</div>}
          {res.verdict !== "exact" && !override && (
            <button className="btn ghost sm" style={{ alignSelf: "center" }} onClick={() => setOverride(true)} title="Если ты написал правильный синоним">
              Мой ответ тоже верный
            </button>
          )}
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

/** Контекст: предложение с пропуском. */
export function ClozeEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const ex = item.example!;
  const [val, setVal] = useState("");
  const [hint, setHint] = useState(false);
  const [res, setRes] = useState<{ verdict: Verdict; conf: 1 | 2 | 3 | null; ms: number; lemmaOnly: boolean } | null>(null);
  const tokens = useTokens();
  const [freeHint, setFreeHint] = useState(false);
  const [retried, setRetried] = useState(false);
  const [offerRetry, setOfferRetry] = useState(false);
  const start = useRef(Date.now());
  const speak = useSpeak();
  const parts = useMemo(() => {
    const i = ex.text.indexOf(ex.target);
    return i >= 0 ? [ex.text.slice(0, i), ex.text.slice(i + ex.target.length)] : [ex.text, ""];
  }, [ex]);

  const check = (conf: 1 | 2 | 3 | null) => {
    if (!val.trim() || res) return;
    let verdict = checkAnswer(lang, val, [ex.target]);
    let lemmaOnly = false;
    if (verdict === "wrong" && checkAnswer(lang, val, acceptedOf(w, lang)) !== "wrong") {
      verdict = "close";
      lemmaOnly = true;
    }
    setRes({ verdict, conf, ms: Date.now() - start.current, lemmaOnly });
    if (verdict === "wrong" && !retried && tokens.retry > 0) return setOfferRetry(true);
    speak(lang === "he" ? ex.text_nikud || ex.text : ex.text, lang);
  };
  const finish = () => {
    if (!res) return;
    let g = gradeTyped(res.verdict, res.conf, res.ms, hint && !freeHint);
    if (res.lemmaOnly) g = 2;
    if (retried && res.verdict !== "wrong") g = Math.min(g, 2) as typeof g;
    onNext({
      grade: g,
      correct: res.verdict !== "wrong",
      confidence: res.conf,
      ms: res.ms,
      also: res.verdict !== "wrong" ? [{ facet: "recall", grade: 3 }] : [],
      requeue: res.verdict === "wrong",
      detail: { given: val, verdict: res.verdict, target: ex.target, freeHint, retried },
    });
  };

  return (
    <div className="ex-card">
      <KindLabel icon={<TextCursorInput size={14} />}>В контексте · вставь слово в нужной форме</KindLabel>
      <div className={"cloze-sentence" + (lang === "en" ? " en" : "")} dir={lang === "he" ? "rtl" : "ltr"}>
        {res ? (
          <span>{lang === "he" ? ex.text_nikud || ex.text : ex.text}</span>
        ) : (
          <>
            {parts[0]}
            <span className="cloze-blank">{val || " "}</span>
            {parts[1]}
          </>
        )}
      </div>
      <div className="center text-2">{ex.ru}</div>
      {hint && !res && (
        <div className="center small">
          Словарная форма: <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.2rem" }}>{targetOf(w, lang)}</span> — {w.ru}
        </div>
      )}
      <HebrewInput lang={lang} value={val} onChange={setVal} big autoFocus disabled={!!res} onEnter={() => (res ? finish() : check(2))} />
      {!res ? (
        <>
          <CheckButtons onCheck={check} disabled={!val.trim()} />
          {!hint && (
            <button
              className="btn ghost sm"
              style={{ alignSelf: "center" }}
              onClick={async () => {
                if (tokens.hint > 0 && (await tokens.use("hint"))) setFreeHint(true);
                setHint(true);
              }}
            >
              <Lightbulb size={15} /> Какое это слово?
              {tokens.hint > 0 && <span className="badge accent">без штрафа · {tokens.hint}</span>}
            </button>
          )}
        </>
      ) : offerRetry ? (
        <RetryOffer
          left={tokens.retry}
          onReveal={() => {
            setOfferRetry(false);
            speak(lang === "he" ? ex.text_nikud || ex.text : ex.text, lang);
          }}
          onRetry={async () => {
            if (await tokens.use("retry")) {
              setRetried(true);
              setOfferRetry(false);
              setRes(null);
              setVal("");
            }
          }}
        />
      ) : (
        <>
          {res.verdict === "exact" ? (
            <Feedback kind="ok" title="Верно">
              <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.3rem" }}>{ex.target}</span> — форма слова{" "}
              <span className={lang === "he" ? "he" : ""}>{targetOf(w, lang)}</span>
            </Feedback>
          ) : res.lemmaOnly ? (
            <Feedback kind="close" title="Слово верное, но нужна другая форма">
              Нужно: <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.3rem" }}>{ex.target}</span>
            </Feedback>
          ) : res.verdict === "close" ? (
            <Feedback kind="close" title="Почти — проверь написание">
              Нужно: <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.3rem" }}>{ex.target}</span>
            </Feedback>
          ) : (
            <Feedback kind="bad" title="Здесь другое слово">
              Нужно: <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.3rem" }}>{ex.target}</span> — {w.ru}
            </Feedback>
          )}
          <div className="row" style={{ justifyContent: "center" }}>
            <SpeakBtn text={lang === "he" ? ex.text_nikud || ex.text : ex.text} lang={lang} slowToo />
          </div>
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

/** Спряжение: גוף + זמן → форма. */
export function ConjugateEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const f = item.form!;
  const [val, setVal] = useState("");
  const [res, setRes] = useState<{ verdict: Verdict; conf: 1 | 2 | 3 | null; ms: number } | null>(null);
  const start = useRef(Date.now());
  const speak = useSpeak();
  const tokens = useTokens();
  const [retried, setRetried] = useState(false);
  const [offerRetry, setOfferRetry] = useState(false);
  const t = tenseLabel(f.tense);
  const p = personLabel(f.tense, f.person);
  const row = (item.forms || []).filter((x) => x.tense === f.tense);

  const check = (conf: 1 | 2 | 3 | null) => {
    if (!val.trim() || res) return;
    const verdict = checkAnswer(lang, val, [f.form, f.nikud]);
    setRes({ verdict, conf, ms: Date.now() - start.current });
    if (verdict === "wrong" && !retried && tokens.retry > 0) return setOfferRetry(true);
    speak(f.nikud || f.form, lang);
  };
  const finish = () => {
    if (!res) return;
    onNext({
      grade: (retried && res.verdict !== "wrong" ? Math.min(2, gradeTyped(res.verdict, res.conf, res.ms, false)) : gradeTyped(res.verdict, res.conf, res.ms, false)) as 1 | 2 | 3 | 4,
      correct: res.verdict !== "wrong",
      confidence: res.conf,
      ms: res.ms,
      requeue: res.verdict === "wrong",
      detail: { tense: f.tense, person: f.person, binyan: w.binyan, given: val, verdict: res.verdict, retried },
    });
  };

  const enLabel = EN_FORMS.find((x) => x.id === f.tense)?.ru;

  return (
    <div className="ex-card">
      <KindLabel icon={<Table2 size={14} />}>Спряжение</KindLabel>
      <div className="ex-prompt col gap-6" style={{ alignItems: "center" }}>
        <div className="row">
          {lang === "he" ? <He text={w.he_nikud || w.he} style={{ fontSize: "2rem" }} /> : <span style={{ fontSize: "1.8rem", fontWeight: 500 }}>{w.en}</span>}
          <SpeakBtn text={targetOf(w, lang)} lang={lang} />
        </div>
        <div className="small muted">
          {w.ru}
          {lang === "he" && w.binyan && <> · <span className="he">{binyanLabel(w.binyan)?.plain}</span></>}
        </div>
        {lang === "he" ? (
          <div className="row mt-8 wrap" style={{ justifyContent: "center" }}>
            <span className="chip static on" style={{ height: 38, fontSize: "1rem" }}>
              <span className="he">{t.he}</span> · {t.ru}
            </span>
            {f.tense !== "infinitive" && (
              <span className="chip static on" style={{ height: 38, fontSize: "1rem" }}>
                <span className="he">{p.he}</span> · {p.ru}
              </span>
            )}
          </div>
        ) : (
          <span className="chip static on mt-8" style={{ height: 38, fontSize: "1rem" }}>
            {enLabel}
          </span>
        )}
      </div>
      <HebrewInput lang={lang} value={val} onChange={setVal} big autoFocus disabled={!!res} onEnter={() => (res ? finish() : check(2))} />
      {!res ? (
        <CheckButtons onCheck={check} disabled={!val.trim()} />
      ) : offerRetry ? (
        <RetryOffer
          left={tokens.retry}
          onReveal={() => {
            setOfferRetry(false);
            speak(f.nikud || f.form, lang);
          }}
          onRetry={async () => {
            if (await tokens.use("retry")) {
              setRetried(true);
              setOfferRetry(false);
              setRes(null);
              setVal("");
            }
          }}
        />
      ) : (
        <>
          <Feedback kind={res.verdict === "exact" ? "ok" : res.verdict === "close" ? "close" : "bad"} title={res.verdict === "exact" ? "Верно" : res.verdict === "close" ? "Почти — проверь написание" : "Правильная форма"}>
            <div className="row wrap">
              {lang === "he" ? <He text={f.nikud || f.form} nikud style={{ fontSize: "1.8rem" }} /> : <span style={{ fontSize: "1.5rem" }}>{f.form}</span>}
              {lang === "he" && f.nikud && <span className="muted he">{f.form}</span>}
            </div>
            {res.verdict !== "exact" && (
              <div className="small mt-8">
                Ты написал: <span className={lang === "he" ? "he" : ""}>{val}</span>
              </div>
            )}
          </Feedback>
          {lang === "he" && row.length > 1 && (
            <div className="card soft" style={{ padding: 12 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>
                {t.ru} целиком
              </div>
              <div className="grid grid-2" style={{ gap: 4, direction: "rtl" }}>
                {PERSONS[f.tense as Tense]
                  ?.map((pp) => ({ pp, form: row.find((r) => r.person === pp.id) }))
                  .filter((x) => x.form)
                  .map(({ pp, form }) => (
                    <div key={pp.id} className="row between" style={{ padding: "2px 6px", borderRadius: 8, background: pp.id === f.person ? "var(--accent-soft)" : undefined }}>
                      <span className="small muted he">{pp.he}</span>
                      <He text={form!.nikud || form!.form} nikud style={{ fontSize: "1.15rem" }} />
                    </div>
                  ))}
              </div>
            </div>
          )}
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

export { normHe, Reveal };

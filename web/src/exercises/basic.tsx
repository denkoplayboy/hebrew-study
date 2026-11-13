import { useEffect, useRef, useState } from "react";
import { Sparkles, Layers, ListChecks, Ear, Volume2 } from "lucide-react";
import { posLabel, binyanLabel } from "../../../shared/lang";
import { He, Mixed, SpeakBtn } from "../components/ui";
import { useSpeak, hasVoice } from "../lib/app";
import { ContinueBar, KindLabel, Reveal, targetOf, useKeys, type ExProps } from "./common";

/** Знакомство с новым словом. */
export function IntroEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const speak = useSpeak();
  const start = useRef(Date.now());
  useEffect(() => {
    const t = setTimeout(() => speak(targetOf(w, lang), lang), 300);
    return () => clearTimeout(t);
  }, [w, lang, speak]);
  return (
    <div className="ex-card">
      <KindLabel icon={<Sparkles size={14} />}>Новое слово · знакомство</KindLabel>
      <div className="ex-prompt col gap-6" style={{ alignItems: "center" }}>
        {lang === "he" ? <He text={w.he_nikud || w.he} className="big-he" nikud /> : <span className="big-en">{w.en}</span>}
        <div className="row">
          {lang === "he" && <span className="muted">{w.translit}</span>}
          <SpeakBtn text={targetOf(w, lang)} lang={lang} slowToo />
        </div>
        <div style={{ fontSize: "1.25rem" }}>{w.ru}</div>
        {w.ru_alt && <div className="small muted">{w.ru_alt}</div>}
      </div>
      <div className="chips" style={{ justifyContent: "center" }}>
        {w.pos && <span className="chip static">{posLabel(w.pos)}</span>}
        {w.gender && lang === "he" && <span className="chip static">{w.gender === "f" ? "ж. р." : w.gender === "m" ? "м. р." : "м./ж."}</span>}
        {w.root && lang === "he" && (
          <span className="chip static">
            корень <span className="he">{w.root}</span>
          </span>
        )}
        {w.binyan && lang === "he" && <span className="chip static he">{binyanLabel(w.binyan)?.plain}</span>}
        {lang === "he" && w.en && <span className="chip static">EN: {w.en}</span>}
        {lang === "en" && w.he && (
          <span className="chip static">
            <He text={w.he_nikud || w.he} />
          </span>
        )}
      </div>
      {w.notes && (
        <p className="small text-2">
          <Mixed text={w.notes} />
        </p>
      )}
      {w.mnemonic && (
        <p className="small" style={{ color: "var(--gold)" }}>
          <Mixed text={w.mnemonic} />
        </p>
      )}
      <div className="grow" />
      <ContinueBar
        label="Запомню — дальше"
        onNext={() => onNext({ grade: 3, correct: true, ms: Date.now() - start.current, practice: true, detail: { intro: true } })}
      />
    </div>
  );
}

/** Карточка: самооценка узнавания. */
export function FlashEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const [flipped, setFlipped] = useState(false);
  const start = useRef(Date.now());
  const flipMs = useRef(0);
  const speak = useSpeak();
  const flip = () => {
    if (!flipped) {
      flipMs.current = Date.now() - start.current;
      setFlipped(true);
      speak(targetOf(w, lang), lang);
    }
  };
  const grade = (g: 1 | 2 | 3 | 4) => onNext({ grade: g, correct: g > 1, ms: flipMs.current || Date.now() - start.current, requeue: g === 1 });
  useKeys(
    flipped
      ? { "1": () => grade(1), "2": () => grade(2), "3": () => grade(3), "4": () => grade(4), " ": () => grade(3) }
      : { " ": flip, Enter: flip },
  );
  return (
    <div className="ex-card flash" onClick={flip}>
      <KindLabel icon={<Layers size={14} />}>Карточка · узнавание</KindLabel>
      <div className="ex-prompt col gap-6" style={{ alignItems: "center" }}>
        {lang === "he" ? <He text={w.he_nikud || w.he} className="big-he" /> : <span className="big-en">{w.en}</span>}
        {!flipped && <div className="small muted mt-8">Вспомни значение и нажми, чтобы перевернуть</div>}
      </div>
      {flipped && (
        <div className="col gap-16" onClick={(e) => e.stopPropagation()}>
          <div className="card soft">
            <Reveal w={w} lang={lang} />
          </div>
          <div className="grades">
            <button className="btn" onClick={() => grade(1)}>
              Забыл<small>1</small>
            </button>
            <button className="btn" onClick={() => grade(2)}>
              С трудом<small>2</small>
            </button>
            <button className="btn primary" onClick={() => grade(3)}>
              Помню<small>3 · пробел</small>
            </button>
            <button className="btn" onClick={() => grade(4)}>
              Мгновенно<small>4</small>
            </button>
          </div>
        </div>
      )}
      {!flipped && (
        <>
          <div className="grow" />
          <button className="btn soft lg block" onClick={flip}>
            Показать
          </button>
        </>
      )}
    </div>
  );
}

/** Выбор из вариантов (в обе стороны). */
export function ChoiceEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const toRu = item.direction !== "to_target";
  const [picked, setPicked] = useState<number | null>(null);
  const start = useRef(Date.now());
  const ms = useRef(0);
  const speak = useSpeak();
  const opts = item.options || [];
  const correct = picked === w.id;

  const choose = (id: number) => {
    if (picked !== null) return;
    ms.current = Date.now() - start.current;
    setPicked(id);
    if (!toRu || id === w.id) speak(targetOf(w, lang), lang);
  };
  const finish = () =>
    onNext({
      grade: correct ? (ms.current < 2500 ? 4 : 3) : 1,
      correct,
      ms: ms.current,
      confusedWith: !correct && picked ? picked : undefined,
      requeue: !correct,
      detail: { direction: item.direction },
    });

  useEffect(() => {
    if (picked !== null && correct) {
      const t = setTimeout(finish, 900);
      return () => clearTimeout(t);
    }
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys: Record<string, () => void> = {};
  opts.forEach((o, i) => (keys[String(i + 1)] = () => choose(o.id)));
  useKeys(keys, picked === null);

  return (
    <div className="ex-card">
      <KindLabel icon={<ListChecks size={14} />}>{toRu ? "Что это значит?" : lang === "he" ? "Как это на иврите?" : "Как это по-английски?"}</KindLabel>
      <div className="ex-prompt">
        {toRu ? (
          lang === "he" ? (
            <He text={w.he_nikud || w.he} className="big-he" />
          ) : (
            <span className="big-en">{w.en}</span>
          )
        ) : (
          <div className="col gap-4" style={{ alignItems: "center" }}>
            <span style={{ fontSize: "1.7rem", fontWeight: 500 }}>{w.ru}</span>
            <span className="small muted">{posLabel(w.pos)}</span>
          </div>
        )}
      </div>
      <div className="options">
        {opts.map((o, i) => {
          const cls = picked === null ? "" : o.id === w.id ? " correct" : o.id === picked ? " wrong" : "";
          const heOpt = !toRu && lang === "he";
          return (
            <button key={o.id + ":" + i} className={"option" + cls + (heOpt ? " he-opt" : "")} onClick={() => choose(o.id)}>
              {heOpt ? <He text={o.label} /> : <span>{o.label}</span>}
              <span className="kbd">{i + 1}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && !correct && (
        <>
          <div className="card soft">
            <Reveal w={w} lang={lang} />
          </div>
          <ContinueBar onNext={finish} />
        </>
      )}
    </div>
  );
}

/** На слух. */
export function ListenEx({ item, onNext }: ExProps) {
  const w = item.word;
  const lang = item.lang;
  const speak = useSpeak();
  const [picked, setPicked] = useState<number | null>(null);
  const start = useRef(Date.now());
  const ms = useRef(0);
  const plays = useRef(0);
  const noVoice = !hasVoice(lang);
  const play = (slow = false) => {
    plays.current++;
    speak(targetOf(w, lang), lang, slow);
  };
  useEffect(() => {
    const t = setTimeout(() => play(), 350);
    return () => clearTimeout(t);
  }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const correct = picked === w.id;
  const choose = (id: number) => {
    if (picked !== null) return;
    ms.current = Date.now() - start.current;
    setPicked(id);
  };
  const finish = () =>
    onNext({
      grade: correct ? (plays.current <= 1 && ms.current < 5000 ? 4 : plays.current > 2 ? 2 : 3) : 1,
      correct,
      ms: ms.current,
      confusedWith: !correct && picked ? picked : undefined,
      requeue: !correct,
      detail: { plays: plays.current },
    });
  useEffect(() => {
    if (picked !== null && correct) {
      const t = setTimeout(finish, 1100);
      return () => clearTimeout(t);
    }
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys: Record<string, () => void> = { r: () => play(), " ": () => play() };
  (item.options || []).forEach((o, i) => (keys[String(i + 1)] = () => choose(o.id)));
  useKeys(keys, picked === null);

  return (
    <div className="ex-card">
      <KindLabel icon={<Ear size={14} />}>На слух · что ты услышал?</KindLabel>
      <div className="ex-prompt col gap-16" style={{ alignItems: "center" }}>
        <button className="btn primary lg" style={{ width: 96, height: 96, borderRadius: 32 }} onClick={() => play()}>
          <Volume2 size={36} />
        </button>
        <div className="row">
          <button className="btn ghost sm" onClick={() => play(true)}>
            медленнее
          </button>
          <span className="kbd-hint">пробел — повторить</span>
        </div>
        {noVoice && (
          <div className="small" style={{ color: "var(--clay)", maxWidth: 360 }}>
            На этом устройстве нет голоса для {lang === "he" ? "иврита" : "английского"} — вот транскрипция: <b>{w.translit || w.en}</b>
          </div>
        )}
        {picked !== null && (lang === "he" ? <He text={w.he_nikud || w.he} style={{ fontSize: "2rem" }} /> : <span style={{ fontSize: "1.6rem" }}>{w.en}</span>)}
      </div>
      <div className="options">
        {(item.options || []).map((o, i) => {
          const cls = picked === null ? "" : o.id === w.id ? " correct" : o.id === picked ? " wrong" : "";
          return (
            <button key={o.id + ":" + i} className={"option" + cls} onClick={() => choose(o.id)}>
              <span>{o.label}</span>
              <span className="kbd">{i + 1}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && !correct && <ContinueBar onNext={finish} />}
    </div>
  );
}

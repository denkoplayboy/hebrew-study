import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X, Download, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData } from "../lib/app";
import { checkAnswer, detectLang } from "../../../shared/lang";
import type { Pack, PackItem } from "../../../shared/types";
import { Bar, Loading, Mixed } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";
import { ContinueBar, Feedback } from "../exercises/common";

function shuffle<T>(a: T[]): T[] {
  return [...a].sort(() => Math.random() - 0.5);
}

const isHe = (s: string) => detectLang(s) === "he";

function Txt({ s, big }: { s: string; big?: boolean }) {
  const he = isHe(s);
  const mixed = /[\u0590-\u05FF]/.test(s) && /[A-Za-zА-Яа-яЁё]/.test(s);
  if (mixed)
    return (
      <span dir="ltr" style={{ fontSize: big ? "1.25rem" : undefined, whiteSpace: "pre-wrap" }}>
        <Mixed text={s} />
      </span>
    );
  return (
    <span className={he ? "he" : ""} dir="auto" style={{ fontSize: he ? (big ? "1.6rem" : "1.3rem") : big ? "1.25rem" : undefined, whiteSpace: "pre-wrap" }}>
      {s}
    </span>
  );
}

export default function PackRun() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast, touch } = useApp();
  const { data: pack } = useData<Pack>(`/api/packs/${id}`, [id]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setI(0);
    setScore(0);
    setTotal(0);
    setDone(false);
  }, [run, id]);

  if (!pack)
    return (
      <div className="session">
        <Loading h={300} />
      </div>
    );

  const items = pack.items || [];
  const item = items[i];

  const next = (ok: boolean | null) => {
    const s = score + (ok ? 1 : 0);
    const t = total + (ok === null ? 0 : 1);
    setScore(s);
    setTotal(t);
    if (i + 1 >= items.length) {
      setDone(true);
      if (t > 0) api.post(`/api/packs/${pack.id}/run`, { score: s, total: t }).then(touch).catch(() => {});
    } else setI(i + 1);
  };

  const importWords = async () => {
    setImporting(true);
    try {
      const r = await api.post<{ added: number; skipped: string[] }>(`/api/packs/${pack.id}/import-words`);
      toast(`Посажено: ${r.added}${r.skipped.length ? ` · дополнено существующих: ${r.skipped.length}` : ""}`);
      touch();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="session">
      <div className="session-top">
        <button className="btn ghost icon" onClick={() => nav("/lab")} aria-label="Выйти">
          <X size={20} />
        </button>
        <div className="grow">
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>
              <Mixed text={pack.title} />
            </span>
            <span className="muted">
              {Math.min(i + 1, items.length)} / {items.length}
            </span>
          </div>
          <Bar value={done ? 1 : i / Math.max(1, items.length)} thin />
        </div>
      </div>

      {pack.words && pack.words.length > 0 && i === 0 && !done && (
        <div className="card soft row between wrap" style={{ marginBottom: 14 }}>
          <span className="small">В наборе {pack.words.length} слов — их можно посадить в твой сад.</span>
          <button className="btn primary sm" onClick={importWords} disabled={importing}>
            <Download size={14} /> Добавить слова в словарь
          </button>
        </div>
      )}

      {!done && item && <PackItemView key={`${run}:${i}`} item={item} lang={pack.lang} onNext={next} />}

      {done && (
        <div className="ex-card celebrate" style={{ alignItems: "center", textAlign: "center" }}>
          <h2>Набор пройден</h2>
          <div style={{ fontSize: "3rem", fontWeight: 500 }}>
            {score}/{total}
          </div>
          <p className="text-2">{total ? (score / total >= 0.9 ? "Отлично — тема усвоена." : score / total >= 0.6 ? "Хорошо. Пройди ещё раз через пару дней." : "Стоит вернуться к теории и повторить.") : ""}</p>
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <button className="btn lg" onClick={() => setRun(run + 1)}>
              <RotateCcw size={17} /> Ещё раз
            </button>
            <button className="btn primary lg" onClick={() => nav("/lab")}>
              К наборам
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PackItemView({ item, lang, onNext }: { item: PackItem; lang: "he" | "en"; onNext: (ok: boolean | null) => void }) {
  switch (item.type) {
    case "info":
      return (
        <div className="ex-card">
          <div className="ex-kind">Теория</div>
          <h2>{item.title}</h2>
          <div className="text-2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            <Mixed text={item.body || ""} />
          </div>
          <div className="grow" />
          <ContinueBar onNext={() => onNext(null)} label="Понятно" />
        </div>
      );
    case "choice":
      return <ChoiceItem item={item} onNext={onNext} />;
    case "order":
      return <OrderItem item={item} onNext={onNext} />;
    default:
      return <TypedItem item={item} lang={lang} onNext={onNext} />;
  }
}

function ChoiceItem({ item, onNext }: { item: PackItem; onNext: (ok: boolean) => void }) {
  const correct = item.options?.[Number(item.answer)] ?? "";
  const opts = useMemo(() => shuffle(item.options || []), [item]);
  const [picked, setPicked] = useState<string | null>(null);
  const ok = picked === correct;
  return (
    <div className="ex-card">
      <div className="ex-kind">Выбери ответ</div>
      <div className="ex-prompt">
        <Txt s={item.prompt || ""} big />
      </div>
      <div className="options">
        {opts.map((o, k) => (
          <button key={k} className={"option" + (picked === null ? "" : o === correct ? " correct" : o === picked ? " wrong" : "")} onClick={() => picked === null && setPicked(o)}>
            <Txt s={o} />
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          {item.explain && (
            <Feedback kind={ok ? "ok" : "bad"} title={ok ? "Верно" : "Неверно"}>
              <Mixed text={item.explain} />
            </Feedback>
          )}
          <ContinueBar onNext={() => onNext(ok)} />
        </>
      )}
    </div>
  );
}

function TypedItem({ item, lang, onNext }: { item: PackItem; lang: "he" | "en"; onNext: (ok: boolean) => void }) {
  const answers = item.answers || (typeof item.answer === "string" ? [item.answer] : []);
  const ansLang = answers[0] ? detectLang(answers[0]) || lang : lang;
  const [val, setVal] = useState("");
  const [verdict, setVerdict] = useState<"exact" | "close" | "wrong" | null>(null);
  const [override, setOverride] = useState(false);
  const check = () => val.trim() && !verdict && setVerdict(checkAnswer(ansLang, val, answers));
  const ok = override || (verdict !== null && verdict !== "wrong");
  return (
    <div className="ex-card">
      <div className="ex-kind">{item.type === "translate" ? "Переведи" : "Заполни пропуск"}</div>
      <div className="ex-prompt">
        <Txt s={item.prompt || ""} big />
      </div>
      {item.hint && <div className="small muted center">{item.hint}</div>}
      <HebrewInput lang={ansLang === "he" ? "he" : "en"} value={val} onChange={setVal} big autoFocus disabled={!!verdict} onEnter={() => (verdict ? onNext(ok) : check())} wordMode={item.type !== "translate"} />
      {!verdict ? (
        <button className="btn primary lg block" onClick={check} disabled={!val.trim()}>
          Проверить
        </button>
      ) : (
        <>
          <Feedback kind={ok ? (verdict === "close" && !override ? "close" : "ok") : "bad"} title={ok ? (verdict === "close" && !override ? "Почти — проверь написание" : "Верно") : "Правильный ответ"}>
            <div className="col gap-4">
              {answers.slice(0, 3).map((a, k) => (
                <Txt key={k} s={a} />
              ))}
              {item.explain && (
                <div className="small text-2 mt-8">
                  <Mixed text={item.explain} />
                </div>
              )}
            </div>
          </Feedback>
          {!ok && (
            <button className="btn ghost sm" style={{ alignSelf: "center" }} onClick={() => setOverride(true)}>
              Мой вариант тоже верный
            </button>
          )}
          <ContinueBar onNext={() => onNext(ok)} />
        </>
      )}
    </div>
  );
}

function OrderItem({ item, onNext }: { item: PackItem; onNext: (ok: boolean) => void }) {
  const tokens = useMemo(() => shuffle((item.tokens || []).map((t, k) => ({ t, k }))), [item]);
  const [built, setBuilt] = useState<{ t: string; k: number }[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const answer = (item.answers || [])[0] || "";
  const he = isHe(answer);
  const norm = (s: string) => s.replace(/[.,!?״"']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const check = () => setChecked((item.answers || []).some((a) => norm(a) === norm(built.map((b) => b.t).join(" "))));
  const t0 = useRef(Date.now());
  void t0;
  return (
    <div className="ex-card">
      <div className="ex-kind">Собери предложение</div>
      {item.prompt && (
        <div className="center text-2">
          <Txt s={item.prompt} />
        </div>
      )}
      <div className="card soft" style={{ minHeight: 70, display: "flex", flexWrap: "wrap", gap: 8, direction: he ? "rtl" : "ltr", alignItems: "center" }}>
        {built.length === 0 && <span className="muted small">нажимай на слова по порядку</span>}
        {built.map((b) => (
          <button key={b.k} className="chip" style={{ height: 38, fontSize: he ? "1.25rem" : "1rem" }} onClick={() => checked === null && setBuilt(built.filter((x) => x.k !== b.k))}>
            <Txt s={b.t} />
          </button>
        ))}
      </div>
      <div className="chips" style={{ justifyContent: "center", direction: he ? "rtl" : "ltr" }}>
        {tokens
          .filter((t) => !built.some((b) => b.k === t.k))
          .map((t) => (
            <button key={t.k} className="chip" style={{ height: 42, fontSize: he ? "1.3rem" : "1rem" }} onClick={() => checked === null && setBuilt([...built, t])}>
              <Txt s={t.t} />
            </button>
          ))}
      </div>
      {checked === null ? (
        <button className="btn primary lg block" disabled={built.length !== tokens.length} onClick={check}>
          Проверить
        </button>
      ) : (
        <>
          <Feedback kind={checked ? "ok" : "bad"} title={checked ? "Верно" : "Правильный порядок"}>
            <Txt s={answer} />
            {item.explain && (
                <div className="small text-2 mt-8">
                  <Mixed text={item.explain} />
                </div>
              )}
          </Feedback>
          <ContinueBar onNext={() => onNext(checked)} />
        </>
      )}
    </div>
  );
}

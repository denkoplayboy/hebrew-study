import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Droplets, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, useSpeak } from "../lib/app";
import type { WordSummary } from "../../../shared/types";
import { He, Loading, Mixed, Plant, SpeakBtn, mainProgress } from "../components/ui";

interface StoryData {
  id: number;
  title: string;
  lang: "he" | "en";
  read_at: number | null;
  sentences: { text: string; text_nikud: string; ru: string }[];
  questions: { q: string; options: string[]; answer_index: number; explain: string }[];
  words: WordSummary[];
}
interface Tok {
  t: string;
  word: boolean;
  id?: number | null;
}

export default function Story() {
  const { id } = useParams();
  const nav = useNavigate();
  const { touch, toast } = useApp();
  const speak = useSpeak();
  const { data } = useData<StoryData>(`/api/stories/${id}`, [id]);
  const [nikud, setNikud] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [toks, setToks] = useState<Tok[][] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ dew: number; correct: number; total: number } | null>(null);

  useEffect(() => {
    if (!data) return;
    Promise.all(data.sentences.map((s) => api.post<{ tokens: Tok[] }>("/api/reader/analyze", { text: s.text }).then((r) => r.tokens)))
      .then(setToks)
      .catch(() => setToks(null));
  }, [data]);

  if (!data)
    return (
      <div className="page narrow">
        <Loading h={300} />
      </div>
    );

  const he = data.lang === "he";
  const mine = new Set(data.words.map((w) => w.id));
  const stageOf = (wid: number) => mainProgress(data.words.find((w) => w.id === wid)!)?.stage ?? 0;
  const allAnswered = data.questions.every((_, i) => answers[i] !== undefined);
  const correct = data.questions.filter((q, i) => answers[i] === q.answer_index).length;

  const finish = async () => {
    try {
      const r = await api.post<{ dew: number; correct: number; total: number }>(`/api/stories/${data.id}/read`, { correct, total: data.questions.length });
      setResult(r);
      touch();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="page narrow">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => nav(-1)}>
          <ArrowLeft size={16} /> Назад
        </button>
        <div className="row gap-6">
          {he && (
            <button className="btn soft sm" onClick={() => setNikud(!nikud)}>
              {nikud ? "без огласовок" : "с огласовками"}
            </button>
          )}
          <button className="btn soft sm" onClick={() => speak(data.sentences.map((s) => (he ? s.text_nikud || s.text : s.text)).join(" "), data.lang)}>
            слушать всё
          </button>
        </div>
      </div>

      <div className="card pad-lg col gap-16">
        <h1 className={/[\u0590-\u05FF]/.test(data.title) ? "he" : ""} style={/[\u0590-\u05FF]/.test(data.title) ? { textAlign: "right", fontSize: "1.9rem" } : undefined}>
          <Mixed text={data.title} />
        </h1>
        <div className="col gap-16">
          {data.sentences.map((s, i) => (
            <div key={i} className="row top">
              <div className="grow">
                <div className={he ? "reader-text" : "reader-text en"} dir={he ? "rtl" : "ltr"} style={{ lineHeight: 1.8 }} onClick={() => setShown(new Set([...shown, i]))}>
                  {nikud || !toks?.[i]
                    ? he
                      ? s.text_nikud || s.text
                      : s.text
                    : toks[i].map((t, k) =>
                        t.word && t.id && mine.has(t.id) ? (
                          <Link key={k} to={`/words/${t.id}`} className={`tok s${stageOf(t.id)}`} style={{ fontWeight: 600 }}>
                            {t.t}
                          </Link>
                        ) : (
                          <span key={k}>{t.t}</span>
                        ),
                      )}
                </div>
                {shown.has(i) ? (
                  <div className="small muted">{s.ru}</div>
                ) : (
                  <button className="btn ghost sm" style={{ padding: 0, height: 22 }} onClick={() => setShown(new Set([...shown, i]))}>
                    <Eye size={13} /> перевод
                  </button>
                )}
              </div>
              <SpeakBtn text={he ? s.text_nikud || s.text : s.text} lang={data.lang} />
            </div>
          ))}
        </div>
        {shown.size > 0 && (
          <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setShown(new Set())}>
            <EyeOff size={14} /> скрыть переводы
          </button>
        )}
      </div>

      <div className="section-title">Твои слова в этой сказке</div>
      <div className="chips">
        {data.words.map((w) => (
          <Link key={w.id} to={`/words/${w.id}`} className="chip">
            <Plant stage={mainProgress(w)?.stage ?? 0} size={16} />
            {he ? <He text={w.he_nikud || w.he} /> : w.en} · {w.ru}
          </Link>
        ))}
      </div>

      <div className="section-title">Вопросы</div>
      <div className="col gap-16">
        {data.questions.map((q, i) => (
          <div key={i} className="card col gap-6">
            <div style={{ fontWeight: 500 }}>
              <Mixed text={q.q} />
            </div>
            <div className="options">
              {q.options.map((o, k) => {
                const picked = answers[i];
                const cls = picked === undefined ? "" : k === q.answer_index ? " correct" : k === picked ? " wrong" : "";
                return (
                  <button key={k} className={"option" + cls} style={{ minHeight: 46 }} onClick={() => picked === undefined && !result && setAnswers({ ...answers, [i]: k })}>
                    <span>
                      <Mixed text={o} />
                    </span>
                  </button>
                );
              })}
            </div>
            {answers[i] !== undefined && q.explain && (
              <div className="small text-2">
                <Mixed text={q.explain} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-24">
        {result ? (
          <div className="card row between wrap">
            <span>
              Верно {result.correct} из {result.total}.
            </span>
            {result.dew > 0 && (
              <span className="row gap-4">
                <Droplets size={16} className="drop" /> +{result.dew} росы
              </span>
            )}
            <Link to="/shop" className="btn soft sm">
              В лавку
            </Link>
          </div>
        ) : data.read_at ? (
          <p className="small muted center">Сказка уже прочитана — можно перечитывать сколько угодно.</p>
        ) : (
          <button className="btn primary lg block" disabled={!allAnswered} onClick={finish}>
            Прочитал — засчитать
          </button>
        )}
      </div>
    </div>
  );
}

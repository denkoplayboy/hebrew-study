import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ScanText, Plus, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { detectLang, normHe, stripNikud } from "../../../shared/lang";
import type { WordSummary } from "../../../shared/types";
import { He, Plant, SpeakBtn, mainProgress, useOutside } from "../components/ui";

interface Tok {
  t: string;
  word: boolean;
  id?: number | null;
}
interface Gloss {
  tokens: { surface: string; lemma: string; lemma_nikud: string; ru: string; pos: string }[];
  translation: string;
}

const SAMPLE = `בבוקר קמתי מוקדם ונסעתי לעבודה. בדרך הרגשתי שמשהו חיוני חסר לי: שכחתי את הטלפון בבית. בעבודה דיברנו על הפרויקט החדש, והמנהל אמר שאין ראיה שהשיטה הישנה עובדת.`;

export default function Reader() {
  const { ai, toast, openOmni, bump } = useApp();
  const nav = useNavigate();
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem("reader:text") || "";
    } catch {
      return "";
    }
  });
  const [toks, setToks] = useState<Tok[] | null>(null);
  const [words, setWords] = useState<WordSummary[]>([]);
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState<{ tok: Tok; x: number; y: number } | null>(null);
  const popRef = useOutside(() => setPop(null));
  const lang = detectLang(text) === "en" ? "en" : "he";

  const analyze = async (t = text) => {
    if (!t.trim()) return;
    try {
      localStorage.setItem("reader:text", t);
    } catch {
      /* noop */
    }
    const r = await api.post<{ tokens: Tok[]; words: WordSummary[] }>("/api/reader/analyze", { text: t });
    setToks(r.tokens);
    setWords(r.words);
  };

  useEffect(() => {
    if (toks) analyze();
  }, [bump]); // eslint-disable-line react-hooks/exhaustive-deps

  const runGloss = async () => {
    setBusy(true);
    try {
      setGloss(await api.post<Gloss>("/api/reader/gloss", { text }));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const stats = useMemo(() => {
    if (!toks) return null;
    const w = toks.filter((t) => t.word);
    const known = w.filter((t) => t.id);
    return { total: w.length, known: known.length, unknown: new Set(w.filter((t) => !t.id).map((t) => normHe(t.t) || t.t.toLowerCase())).size };
  }, [toks]);

  const glossFor = (t: string) => {
    if (!gloss) return null;
    const n = lang === "he" ? normHe(t) : t.toLowerCase();
    return gloss.tokens.find((g) => (lang === "he" ? normHe(g.surface) : g.surface.toLowerCase()) === n) || null;
  };

  const popWord = pop?.tok.id ? byId.get(pop.tok.id) : null;
  const popGloss = pop ? glossFor(pop.tok.t) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Читалка</h1>
          <p>Вставь текст — слова из сада подсветятся по стадии роста, незнакомые можно добавить одним касанием.</p>
        </div>
      </div>

      {!toks ? (
        <div className="card col gap-16">
          <textarea className="textarea" dir="auto" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставь сюда текст на иврите или английском: новость, сообщение, абзац из книги…" style={{ fontSize: "1.15rem" }} />
          <div className="row wrap">
            <button className="btn primary lg" onClick={() => analyze()} disabled={!text.trim()}>
              <ScanText size={18} /> Разметить
            </button>
            {!text && (
              <button className="btn ghost" onClick={() => setText(SAMPLE)}>
                вставить пример
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="col gap-16">
          <div className="row wrap between">
            {stats && (
              <div className="row wrap small text-2">
                <span>слов: {stats.total}</span>
                <span>из сада: {stats.known} ({Math.round((stats.known / Math.max(1, stats.total)) * 100)}%)</span>
                <span>незнакомых: {stats.unknown}</span>
              </div>
            )}
            <div className="row">
              {ai && (
                <button className="btn soft" onClick={runGloss} disabled={busy}>
                  {busy ? <span className="spinner" /> : <Sparkles size={16} />} Глоссы ИИ
                </button>
              )}
              <button className="btn ghost" onClick={() => (setToks(null), setGloss(null))}>
                Другой текст
              </button>
            </div>
          </div>
          <div className="card pad-lg">
            <div className={"reader-text" + (lang === "en" ? " en" : "")} dir={lang === "he" ? "rtl" : "ltr"}>
              {toks.map((t, i) => {
                if (!t.word) return <span key={i}>{t.t}</span>;
                const w = t.id ? byId.get(t.id) : null;
                const st = w ? mainProgress(w)?.stage ?? 0 : null;
                return (
                  <span
                    key={i}
                    className={"tok " + (w ? `s${st}` : "unknown")}
                    onClick={(e) => {
                      const r = (e.target as HTMLElement).getBoundingClientRect();
                      setPop({ tok: t, x: Math.min(window.innerWidth - 330, Math.max(10, r.left)), y: r.bottom + 8 });
                    }}
                  >
                    {t.t}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="row wrap small muted">
            <span className="tok unknown">незнакомое</span>
            <span className="tok s1">росток</span>
            <span className="tok s2">саженец</span>
            <span className="tok s3">деревце</span>
            <span>дерево и выше — без подчёркивания</span>
          </div>
          {gloss?.translation && (
            <div className="card soft">
              <div className="small muted">Перевод</div>
              <p className="mt-8">{gloss.translation}</p>
            </div>
          )}
        </div>
      )}

      {pop && (
        <div className="popover" ref={popRef} style={{ left: pop.x, top: Math.min(pop.y, window.innerHeight - 220) }}>
          {popWord ? (
            <div className="col gap-6">
              <div className="row">
                <Plant stage={mainProgress(popWord)?.stage ?? 0} size={24} />
                {popWord.he ? <He text={popWord.he_nikud || popWord.he} style={{ fontSize: "1.5rem" }} /> : <b>{popWord.en}</b>}
                <SpeakBtn text={lang === "he" ? popWord.he_nikud || popWord.he : popWord.en} lang={lang} />
              </div>
              <div>{popWord.ru}</div>
              {stripNikud(pop.tok.t) !== popWord.he && <div className="small muted">в тексте: {pop.tok.t}</div>}
              <button className="btn soft sm" onClick={() => nav(`/words/${popWord.id}`)}>
                Открыть <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="col gap-6">
              <div className="row">
                <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.5rem" }}>
                  {pop.tok.t}
                </span>
                <SpeakBtn text={pop.tok.t} lang={lang} />
              </div>
              {popGloss ? (
                <>
                  <div className="small muted">
                    словарная форма: <span className={lang === "he" ? "he" : ""}>{popGloss.lemma_nikud || popGloss.lemma}</span>
                  </div>
                  <div>{popGloss.ru}</div>
                </>
              ) : (
                <div className="small muted">Этого слова нет в саду{ai ? " — нажми «Глоссы ИИ», чтобы увидеть перевод" : ""}.</div>
              )}
              <button
                className="btn primary sm"
                onClick={() => {
                  openOmni(popGloss?.lemma || pop.tok.t);
                  setPop(null);
                }}
              >
                <Plus size={14} /> Добавить в сад
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

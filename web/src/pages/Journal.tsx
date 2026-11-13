import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Star, Check, Eye, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime } from "../lib/app";
import { HebrewInput } from "../components/HebrewInput";
import { He, Collapsible, Mixed } from "../components/ui";
import type { WordSummary } from "../../../shared/types";

interface PromptResp {
  prompt: string;
  lang: "he" | "en";
  invited: WordSummary[];
}
interface Credited {
  id: number;
  he: string;
  en: string;
  ru: string;
  surface: string;
  spontaneous: boolean;
  first: boolean;
}
interface JournalResp {
  feedback: { corrected?: string; issues?: { fragment: string; fix: string; why: string }[]; comment?: string };
  credited: Credited[];
  ai: boolean;
}
interface Entry {
  id: number;
  ts: number;
  lang: string;
  prompt: string;
  text: string;
  corrected: string;
  feedback: JournalResp["feedback"];
  words_used: Credited[];
}

/** Пословное сравнение для подсветки правок. */
export function diffWords(a: string, b: string) {
  const A = a.split(/(\s+)/).filter((x) => x !== "");
  const B = b.split(/(\s+)/).filter((x) => x !== "");
  const n = A.length,
    m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: string; k: "same" | "add" | "del" }[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) out.push({ t: A[i++], k: "same" }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: A[i++], k: "del" });
    else out.push({ t: B[j++], k: "add" });
  }
  while (i < n) out.push({ t: A[i++], k: "del" });
  while (j < m) out.push({ t: B[j++], k: "add" });
  return out;
}

export function Diff({ a, b, he }: { a: string; b: string; he: boolean }) {
  const parts = diffWords(a, b);
  return (
    <div className={he ? "he" : ""} style={{ fontSize: he ? "1.3rem" : "1.05rem", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) => (p.k === "same" ? <span key={i}>{p.t}</span> : <span key={i} className={p.k === "add" ? "mark-add" : "mark-del"}>{p.t}</span>))}
    </div>
  );
}

export default function Journal() {
  const { ai, toast, touch } = useApp();
  const [lang, setLang] = useState<"he" | "en">("he");
  const { data: pr, reload: newPrompt } = useData<PromptResp>(`/api/journal/prompt?lang=${lang}`, [lang]);
  const { data: entries, reload: reloadEntries } = useData<Entry[]>("/api/journal");
  const [text, setText] = useState("");
  const [showWords, setShowWords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(JournalResp & { text: string }) | null>(null);

  const submit = async () => {
    if (!text.trim() || !pr) return;
    setBusy(true);
    try {
      const r = await api.post<JournalResp>("/api/journal", { text, lang, prompt: pr.prompt, invited: pr.invited.map((w) => w.id) });
      setRes({ ...r, text });
      setText("");
      touch();
      reloadEntries();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Дневник</h1>
          <p>Свободное письмо — самая сильная проверка. Слова, которые ты употребишь сам, без подсказки, засчитываются вдвойне.</p>
        </div>
        <div className="pill-tabs">
          <button className={lang === "he" ? "on" : ""} onClick={() => setLang("he")}>
            עברית
          </button>
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
            English
          </button>
        </div>
      </div>

      {!res ? (
        <div className="card col gap-16">
          <div className="row between top">
            <div>
              <div className="small muted">Тема</div>
              <div style={{ fontSize: "1.15rem" }}>{pr?.prompt || "…"}</div>
            </div>
            <button className="btn ghost sm icon" title="Другая тема" onClick={newPrompt}>
              <RefreshCw size={16} />
            </button>
          </div>
          {pr && pr.invited.length > 0 && (
            <div>
              <div className="row between">
                <span className="small muted">Попробуй вспомнить и использовать слова:</span>
                <button className="btn ghost sm" onClick={() => setShowWords(!showWords)}>
                  <Eye size={14} /> {showWords ? "скрыть" : "подсказать"}
                </button>
              </div>
              <div className="chips mt-8">
                {pr.invited.map((w) => (
                  <span key={w.id} className="chip static">
                    {w.ru}
                    {showWords && <> — {lang === "he" ? <He text={w.he_nikud || w.he} /> : w.en}</>}
                  </span>
                ))}
              </div>
            </div>
          )}
          <HebrewInput lang={lang} value={text} onChange={setText} multiline rows={7} wordMode={false} hint placeholder={lang === "he" ? "כתוב כמה משפטים…" : "Write a few sentences…"} onEnter={submit} />
          <div className="row between wrap">
            <span className="small muted">{ai ? "ИИ исправит ошибки и найдёт слова из твоего сада" : "Без ИИ — только поиск слов из сада"} · Ctrl+Enter</span>
            <button className="btn primary lg" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? <span className="spinner" /> : <Check size={18} />} Отправить
            </button>
          </div>
        </div>
      ) : (
        <div className="col gap-16">
          <div className="card col gap-16">
            {res.feedback.corrected ? (
              <>
                <div className="small muted">Исправления</div>
                <Diff a={res.text} b={res.feedback.corrected} he={lang === "he"} />
              </>
            ) : (
              <div className={lang === "he" ? "he" : ""} style={{ fontSize: "1.25rem" }}>
                {res.text}
              </div>
            )}
            {res.feedback.comment && (
              <p className="text-2">
                <Mixed text={res.feedback.comment} />
              </p>
            )}
            {res.feedback.issues && res.feedback.issues.length > 0 && (
              <div className="col gap-6">
                {res.feedback.issues.map((i, k) => (
                  <div key={k} className="card soft" style={{ padding: 12 }}>
                    <div className="row wrap">
                      <span className="mark-del">{i.fragment}</span> → <span className="mark-add">{i.fix}</span>
                    </div>
                    <div className="small text-2 mt-8">
                      <Mixed text={i.why} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">
              <h3>Слова из сада в твоём тексте</h3>
            </div>
            {res.credited.length ? (
              <div className="col gap-6">
                {res.credited.map((c) => (
                  <Link key={c.id} to={`/words/${c.id}`} className="row hit" style={{ padding: "6px 8px" }}>
                    {c.spontaneous ? <Star size={16} color="var(--gold)" fill="var(--gold)" /> : <Check size={16} color="var(--accent)" />}
                    <span className={lang === "he" ? "he" : ""} style={{ fontSize: "1.15rem" }}>
                      {c.surface}
                    </span>
                    <span className="small text-2 grow">
                      {c.he || c.en} — {c.ru}
                    </span>
                    {c.spontaneous && <span className="badge gold">{c.first ? "впервые сам!" : "сам вспомнил"}</span>}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="small muted">Слов из сада не нашлось. Попробуй в следующий раз использовать приглашённые слова.</p>
            )}
          </div>
          <button className="btn primary lg" onClick={() => (setRes(null), newPrompt())}>
            Написать ещё
          </button>
        </div>
      )}

      <div className="section-title">Записи</div>
      <div className="col gap-6">
        {(entries || []).length === 0 && <p className="small muted">Пока пусто.</p>}
        {(entries || []).map((e) => (
          <div key={e.id} className="card flat">
            <div className="row between">
              <span className="small muted">
                {relTime(e.ts)} · {e.prompt}
              </span>
              <button
                className="btn ghost sm icon"
                title="Удалить"
                onClick={async () => {
                  if (!confirm("Удалить запись?")) return;
                  await api.del(`/api/journal/${e.id}`);
                  reloadEntries();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className={e.lang === "he" ? "he" : ""} style={{ fontSize: e.lang === "he" ? "1.2rem" : "1rem", whiteSpace: "pre-wrap" }}>
              {e.text}
            </div>
            {e.corrected && e.corrected !== e.text && (
              <Collapsible title="исправления">
                <Diff a={e.text} b={e.corrected} he={e.lang === "he"} />
              </Collapsible>
            )}
            {e.words_used.length > 0 && (
              <div className="chips mt-8">
                {e.words_used.map((c) => (
                  <span key={c.id} className={"chip static" + (c.spontaneous ? " on" : "")}>
                    {c.spontaneous && "★ "}
                    <span className={e.lang === "he" ? "he" : ""}>{c.surface}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

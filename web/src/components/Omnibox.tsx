import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Sparkles, Check, ArrowRight, GitMerge } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useApp } from "../lib/app";
import { detectLang, posLabel } from "../../../shared/lang";
import type { WordDraft, WordSummary } from "../../../shared/types";
import { Plant, Thirst, mainProgress, WordFace, He } from "./ui";
import { DraftEditor } from "./DraftEditor";

interface Hit {
  word: WordSummary;
  match: "exact" | "form" | "prefix" | "partial";
  via?: string;
}

const MATCH_LABEL = { exact: "есть в словаре", form: "словоформа", prefix: "начинается так", partial: "похоже" };

function splitBatch(text: string): string[] {
  if (!/[,\n;،]/.test(text)) return [];
  return [...new Set(text.split(/[,\n;،]+/).map((s) => s.trim()).filter(Boolean))];
}

export function HitRow({ h, onOpen }: { h: Hit; onOpen: () => void }) {
  const w = h.word;
  const p = mainProgress(w);
  const lang = w.study.includes("he") ? "he" : "en";
  return (
    <div className="hit" onClick={onOpen}>
      <Plant stage={p?.stage ?? 0} size={26} />
      <div className="grow">
        <div className="row gap-6">
          <WordFace w={w} lang={lang} className={lang === "he" ? "" : ""} />
          {lang === "he" && w.en && <span className="muted small">· {w.en}</span>}
        </div>
        <div className="small text-2">{w.ru}</div>
      </div>
      <div className="col gap-4" style={{ alignItems: "flex-end" }}>
        <span className={"badge " + (h.match === "exact" ? "accent" : h.match === "form" ? "water" : "")}>
          {h.match === "form" && h.via ? <>форма: <span className="he">{h.via}</span></> : MATCH_LABEL[h.match]}
        </span>
        <Thirst on={!!p?.thirsty} />
      </div>
    </div>
  );
}

/** Единое окно: ищет по всем трём языкам и формам; если слова нет — добавляет. */
export function Omnibox({ initial = "", autoFocus, onDone, compact }: { initial?: string; autoFocus?: boolean; onDone?: () => void; compact?: boolean }) {
  const { ai, toast, touch } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<WordDraft | null>(null);
  const [dups, setDups] = useState<Hit[]>([]);
  const [batch, setBatch] = useState<{ text: string; status: "exists" | "new" | "busy" | "draft" | "saved" | "error"; hit?: Hit; draft?: WordDraft; error?: string }[] | null>(null);
  const timer = useRef<number>(0);

  const items = useMemo(() => splitBatch(q), [q]);

  useEffect(() => {
    setDraft(null);
    window.clearTimeout(timer.current);
    if (!q.trim() || items.length) {
      setHits(null);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        setHits(await api.get<Hit[]>(`/api/search?q=${encodeURIComponent(q.trim())}`));
      } catch {
        setHits([]);
      }
    }, 180);
  }, [q, items.length]);

  useEffect(() => {
    if (!items.length) return setBatch(null);
    let alive = true;
    (async () => {
      const rows = await Promise.all(
        items.map(async (text) => {
          const h = await api.get<Hit[]>(`/api/search?q=${encodeURIComponent(text)}`).catch(() => [] as Hit[]);
          const exact = h.find((x) => x.match === "exact" || x.match === "form");
          return { text, status: exact ? ("exists" as const) : ("new" as const), hit: exact };
        }),
      );
      if (alive) setBatch(rows);
    })();
    return () => {
      alive = false;
    };
  }, [items.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const exact = hits?.find((h) => h.match === "exact");

  const analyze = async (text: string) => {
    setBusy(true);
    try {
      const r = await api.post<{ draft: WordDraft; duplicates: Hit[] }>("/api/words/analyze", { input: text });
      setDraft(r.draft);
      setDups(r.duplicates);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const save = async (d: WordDraft, force = false) => {
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>("/api/words", { draft: d, force });
      toast(`Посажено: ${d.he || d.en || d.ru}`);
      touch();
      setDraft(null);
      setQ("");
      onDone?.();
      if (!compact) nav(`/words/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDups(e.data.duplicates);
        toast("Похоже, такое слово уже есть — посмотри ниже", true);
      } else toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const merge = async (id: number, d: WordDraft) => {
    setBusy(true);
    try {
      await api.post(`/api/words/${id}/merge`, { draft: d });
      toast("Карточка дополнена");
      touch();
      onDone?.();
      nav(`/words/${id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    if (!batch) return;
    const next = [...batch];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status !== "new" && next[i].status !== "error") continue;
      next[i] = { ...next[i], status: "busy" };
      setBatch([...next]);
      try {
        const r = await api.post<{ draft: WordDraft; duplicates: Hit[] }>("/api/words/analyze", { input: next[i].text });
        const dup = r.duplicates[0];
        next[i] = dup ? { ...next[i], status: "exists", hit: dup, draft: r.draft } : { ...next[i], status: "draft", draft: r.draft };
      } catch (e) {
        next[i] = { ...next[i], status: "error", error: (e as Error).message };
      }
      setBatch([...next]);
    }
  };

  const saveBatch = async () => {
    if (!batch) return;
    const next = [...batch];
    let n = 0;
    for (let i = 0; i < next.length; i++) {
      const d = next[i].draft;
      if (next[i].status !== "draft" || !d) continue;
      try {
        await api.post("/api/words", { draft: d, force: true });
        next[i] = { ...next[i], status: "saved" };
        n++;
      } catch (e) {
        next[i] = { ...next[i], status: "error", error: (e as Error).message };
      }
      setBatch([...next]);
    }
    touch();
    toast(`Посажено слов: ${n}`);
  };

  const lang = detectLang(q);

  return (
    <div className="col gap-16">
      <div className="omni">
        <Search size={20} className="omni-icon" />
        <input
          className="input"
          value={q}
          autoFocus={autoFocus}
          dir="auto"
          placeholder="Найти или добавить: חשוף, доказательство, evidence…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim() && !items.length) {
              if (exact) nav(`/words/${exact.word.id}`), onDone?.();
              else if (!draft && !busy) analyze(q.trim());
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* пакетный режим */}
      {batch && (
        <div className="card flat">
          <div className="card-title">
            <h3>Список из {batch.length}</h3>
            <span className="muted small">
              новых: {batch.filter((b) => b.status === "new").length} · уже есть: {batch.filter((b) => b.status === "exists").length}
            </span>
          </div>
          <div className="col gap-6">
            {batch.map((b, i) => (
              <div key={i} className="row between" style={{ padding: "6px 4px" }}>
                <div className="row grow">
                  <span dir="auto" style={{ fontSize: "1.1rem" }} className={detectLang(b.text) === "he" ? "he" : ""}>
                    {b.text}
                  </span>
                  {b.draft && b.status === "draft" && (
                    <span className="small text-2">
                      → {b.draft.he && <He text={b.draft.he_nikud || b.draft.he} />} {b.draft.ru}
                    </span>
                  )}
                  {b.error && <span className="small" style={{ color: "var(--bad)" }}>{b.error}</span>}
                </div>
                {b.status === "exists" && b.hit && (
                  <button className="badge accent" style={{ border: 0, cursor: "pointer" }} onClick={() => nav(`/words/${b.hit!.word.id}`)}>
                    уже есть ✓
                  </button>
                )}
                {b.status === "new" && <span className="badge">новое</span>}
                {b.status === "busy" && <span className="spinner" />}
                {b.status === "draft" && <span className="badge water">готово к посадке</span>}
                {b.status === "saved" && <span className="badge gold">посажено</span>}
                {b.status === "error" && <span className="badge clay">ошибка</span>}
              </div>
            ))}
          </div>
          <div className="row mt-16 wrap">
            {batch.some((b) => b.status === "new" || b.status === "error") && (
              <button className="btn primary" onClick={runBatch} disabled={!ai}>
                <Sparkles size={17} /> Разобрать новые с ИИ
              </button>
            )}
            {batch.some((b) => b.status === "draft") && (
              <button className="btn primary" onClick={saveBatch}>
                <Check size={17} /> Посадить все ({batch.filter((b) => b.status === "draft").length})
              </button>
            )}
            {!ai && <span className="small muted">Без ИИ добавляй слова по одному — с ручным заполнением.</span>}
          </div>
        </div>
      )}

      {/* результаты поиска */}
      {!batch && hits && hits.length > 0 && !draft && (
        <div className="card flat" style={{ padding: 6 }}>
          {hits.slice(0, compact ? 6 : 10).map((h) => (
            <HitRow
              key={h.word.id}
              h={h}
              onOpen={() => {
                onDone?.();
                nav(`/words/${h.word.id}`);
              }}
            />
          ))}
        </div>
      )}

      {!batch && q.trim() && !draft && hits && (
        <div className="row wrap">
          <button className={"btn " + (exact ? "soft" : "primary")} onClick={() => analyze(q.trim())} disabled={busy}>
            {busy ? <span className="spinner" /> : ai ? <Sparkles size={17} /> : <Plus size={17} />}
            {exact ? "Всё равно добавить" : "Добавить"} «{q.trim()}»
          </button>
          {ai && !exact && (
            <span className="small muted">
              ИИ приведёт к словарной форме, переведёт на {lang === "he" ? "русский и английский" : lang === "en" ? "иврит и русский" : "иврит и английский"}, найдёт корень и
              примеры
            </span>
          )}
        </div>
      )}

      {draft && (
        <div className="col gap-16">
          {dups.length > 0 && (
            <div className="card soft">
              <div className="small" style={{ marginBottom: 8 }}>
                Похоже, это уже растёт в саду:
              </div>
              {dups.map((h) => (
                <div key={h.word.id} className="row between wrap" style={{ padding: "4px 0" }}>
                  <div className="row">
                    <Plant stage={mainProgress(h.word)?.stage ?? 0} size={22} />
                    <WordFace w={h.word} lang={h.word.study.includes("he") ? "he" : "en"} />
                    <span className="small text-2">{h.word.ru}</span>
                    <span className="small muted">{posLabel(h.word.pos)}</span>
                  </div>
                  <div className="row gap-6">
                    <button className="btn sm soft" onClick={() => (onDone?.(), nav(`/words/${h.word.id}`))}>
                      Открыть <ArrowRight size={14} />
                    </button>
                    <button className="btn sm soft" onClick={() => merge(h.word.id, draft)} title="Добавить недостающие поля и язык в существующую карточку">
                      <GitMerge size={14} /> Дополнить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DraftEditor draft={draft} onChange={setDraft} />
          <div className="row wrap">
            <button className="btn primary lg" onClick={() => save(draft, dups.length > 0)} disabled={busy}>
              {busy ? <span className="spinner" /> : <Check size={18} />} {dups.length ? "Всё равно посадить отдельно" : "Посадить в сад"}
            </button>
            <button className="btn ghost" onClick={() => setDraft(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {busy && !draft && !batch && (
        <div className="card soft row">
          <span className="spinner" /> <span className="text-2">ИИ разбирает слово: словарная форма, переводы, корень, примеры…</span>
        </div>
      )}
    </div>
  );
}

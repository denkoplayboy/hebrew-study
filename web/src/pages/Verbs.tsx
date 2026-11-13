import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table2, Microscope, Download } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData } from "../lib/app";
import { BINYANIM, GZAROT, TENSES, PERSONS, binyanLabel, gizraLabel, type Tense } from "../../../shared/lang";
import type { WordSummary } from "../../../shared/types";
import { Bar, He, Plant, Empty, Loading } from "../components/ui";

const PATTERNS = [
  { id: "paal", past: "פָּעַל", pres: "פּוֹעֵל", fut: "יִפְעֹל", inf: "לִפְעֹל", ex: "כָּתַב" },
  { id: "nifal", past: "נִפְעַל", pres: "נִפְעָל", fut: "יִפָּעֵל", inf: "לְהִפָּעֵל", ex: "נִתְפַּס" },
  { id: "piel", past: "פִּעֵל", pres: "מְפַעֵל", fut: "יְפַעֵל", inf: "לְפַעֵל", ex: "דִּבֵּר" },
  { id: "pual", past: "פֻּעַל", pres: "מְפֻעָל", fut: "יְפֻעַל", inf: "—", ex: "סֻדַּר" },
  { id: "hifil", past: "הִפְעִיל", pres: "מַפְעִיל", fut: "יַפְעִיל", inf: "לְהַפְעִיל", ex: "הִרְגִּישׁ" },
  { id: "hufal", past: "הֻפְעַל", pres: "מֻפְעָל", fut: "יֻפְעַל", inf: "—", ex: "הוּזְמַן" },
  { id: "hitpael", past: "הִתְפַּעֵל", pres: "מִתְפַּעֵל", fut: "יִתְפַּעֵל", inf: "לְהִתְפַּעֵל", ex: "הִתְלַבֵּשׁ" },
];

interface StatsLite {
  conjCells: { key: string; n: number; ok: number }[];
  binyanCells: { binyan: string; n: number; ok: number }[];
}

export default function Verbs() {
  const nav = useNavigate();
  const { toast, touch } = useApp();
  const [lang, setLang] = useState<"he" | "en">("he");
  const [binyanim, setBinyanim] = useState<string[]>([]);
  const [tenses, setTenses] = useState<string[]>([]);
  const [gizra, setGizra] = useState<string[]>([]);
  const { data: verbs, reload } = useData<WordSummary[]>("/api/words?pos=verb");
  const { data: stats } = useData<StatsLite>("/api/stats");
  const [importing, setImporting] = useState(false);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const q = () => {
    const p = new URLSearchParams();
    p.set("lang", lang);
    if (lang === "he") {
      if (binyanim.length) p.set("binyanim", binyanim.join(","));
      if (tenses.length) p.set("tenses", tenses.join(","));
      if (gizra.length) p.set("gizra", gizra.join(","));
    }
    return p.toString();
  };

  const heVerbs = useMemo(() => (verbs || []).filter((v) => v.study.includes("he") && v.he), [verbs]);
  const enVerbs = useMemo(() => (verbs || []).filter((v) => v.study.includes("en")), [verbs]);
  const grouped = useMemo(() => BINYANIM.map((b) => ({ b, list: heVerbs.filter((v) => v.binyan === b.id) })).filter((g) => g.list.length), [heVerbs]);
  const other = heVerbs.filter((v) => !v.binyan);

  const importStarter = async () => {
    setImporting(true);
    try {
      const r = await api.post<{ added: number; skipped: string[] }>("/api/packs/starter-verbs/import-words");
      toast(`Добавлено глаголов: ${r.added}${r.skipped.length ? `, уже были: ${r.skipped.length}` : ""}`);
      touch();
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setImporting(false);
    }
  };

  const cell = (t: string, p: string) => stats?.conjCells.find((c) => c.key === `${t}:${p}`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Глаголы</h1>
          <p>
            <span className="he">גוף · זמן · בניין · שורש · גזרה</span> — тренажёр форм и разбора
          </p>
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

      <div className="card col gap-16">
        {lang === "he" ? (
          <>
            <div>
              <div className="label">Биньяны {binyanim.length === 0 && "· все"}</div>
              <div className="chips">
                {BINYANIM.map((b) => (
                  <button key={b.id} className={"chip" + (binyanim.includes(b.id) ? " on" : "")} onClick={() => toggle(binyanim, setBinyanim, b.id)} title={b.hint}>
                    <span className="he">{b.plain}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Времена {tenses.length === 0 && "· все"}</div>
              <div className="chips">
                {TENSES.map((t) => (
                  <button key={t.id} className={"chip" + (tenses.includes(t.id) ? " on" : "")} onClick={() => toggle(tenses, setTenses, t.id)}>
                    <span className="he">{t.he}</span> {t.ru}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Гзарот {gizra.length === 0 && "· все"}</div>
              <div className="chips">
                {GZAROT.map((g) => (
                  <button key={g.id} className={"chip" + (gizra.includes(g.id) ? " on" : "")} onClick={() => toggle(gizra, setGizra, g.id)} title={g.ru}>
                    <span className="he">{g.he}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-2 small">Неправильные английские глаголы: base → Past Simple / Past Participle. Глагол попадает сюда, если у него есть неправильные формы.</p>
        )}
        <div className="row wrap">
          <button className="btn primary lg" onClick={() => nav(`/practice/conjugate?${q()}`)}>
            <Table2 size={18} /> Спряжение
          </button>
          {lang === "he" && (
            <button className="btn lg" onClick={() => nav(`/practice/analyze?${q()}`)}>
              <Microscope size={18} /> Разбор формы
            </button>
          )}
        </div>
      </div>

      {lang === "he" && (
        <>
          <div className="section-title">Мои глаголы</div>
          {!verbs ? (
            <Loading h={140} />
          ) : heVerbs.length === 0 ? (
            <div className="card">
              <Empty icon={<Table2 size={30} />} title="Глаголов пока нет">
                Добавь глаголы через поиск или возьми готовый набор — 12 глаголов-моделей по всем биньянам и гзарот.
              </Empty>
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={importStarter} disabled={importing}>
                  <Download size={16} /> Добавить «Опорные глаголы»
                </button>
              </div>
            </div>
          ) : (
            <div className="col gap-16">
              {[...grouped, ...(other.length ? [{ b: { id: "", plain: "без биньяна", ru: "" } as any, list: other }] : [])].map(({ b, list }) => (
                <div key={b.id} className="card">
                  <div className="card-title">
                    <h3>
                      <span className="he">{b.plain}</span> <span className="muted small">{b.ru}</span>
                    </h3>
                    <span className="small muted">{list.length}</span>
                  </div>
                  <div className="grid grid-auto" style={{ gap: 8 }}>
                    {list.map((v: WordSummary) => {
                      const p = v.progress.find((x) => x.lang === "he");
                      const conj = p?.facets.find((f) => f.facet === "conjugate");
                      return (
                        <div key={v.id} className="hit" style={{ background: "var(--surface-2)" }} onClick={() => nav(`/words/${v.id}`)}>
                          <Plant stage={p?.stage ?? 0} size={24} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <He text={v.he_nikud || v.he} style={{ fontSize: "1.2rem" }} />
                            <div className="tiny muted">
                              {v.ru} · {v.gizra.map((g) => gizraLabel(g)?.he).join(", ")}
                            </div>
                            {conj && conj.state !== "locked" && <Bar value={conj.strength} thin />}
                          </div>
                          {v.conj_status === "pending" && <span className="spinner" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {heVerbs.length < 12 && (
                <button className="btn soft" style={{ alignSelf: "flex-start" }} onClick={importStarter} disabled={importing}>
                  <Download size={16} /> Добавить «Опорные глаголы» (12 моделей)
                </button>
              )}
            </div>
          )}

          {stats && stats.conjCells.length > 0 && (
            <>
              <div className="section-title">Где ошибаешься</div>
              <div className="card">
                <div className="grid grid-3 stack-sm" style={{ gap: 16 }}>
                  {(["past", "present", "future"] as Tense[]).map((t) => (
                    <div key={t}>
                      <div className="small" style={{ marginBottom: 6 }}>
                        {TENSES.find((x) => x.id === t)?.ru}
                      </div>
                      <div className="col gap-4">
                        {PERSONS[t].map((p) => {
                          const c = cell(t, p.id);
                          const acc = c ? c.ok / c.n : null;
                          return (
                            <div key={p.id} className="row between small" style={{ padding: "2px 8px", borderRadius: 8, background: acc === null ? "var(--surface-2)" : acc > 0.85 ? "var(--ok-soft)" : acc > 0.6 ? "var(--gold-soft)" : "var(--bad-soft)" }}>
                              <span className="he">{p.he}</span>
                              <span className="muted">{c ? `${Math.round(acc! * 100)}% · ${c.n}` : "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {stats.binyanCells.length > 0 && (
                  <div className="chips mt-16">
                    {stats.binyanCells.map((b) => (
                      <span key={b.binyan} className="chip static">
                        <span className="he">{binyanLabel(b.binyan)?.plain}</span> {Math.round((b.ok / b.n) * 100)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="section-title">Шпаргалка по биньянам</div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="conj-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Биньян</th>
                  {["Прош.", "Наст.", "Буд.", "Инф.", "Пример"].map((h) => (
                    <th key={h} style={{ textAlign: "right" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PATTERNS.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="he">{binyanLabel(p.id)?.plain}</span>
                      <div className="tiny muted">{binyanLabel(p.id)?.hint}</div>
                    </td>
                    {[p.past, p.pres, p.fut, p.inf, p.ex].map((x, i) => (
                      <td key={i} className="he" style={{ fontSize: "1.15rem" }}>
                        {x}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {lang === "en" && (
        <>
          <div className="section-title">Мои английские глаголы</div>
          <div className="card" style={{ padding: 6 }}>
            {enVerbs.length ? (
              enVerbs.map((v) => (
                <div key={v.id} className="hit" onClick={() => nav(`/words/${v.id}`)}>
                  <Plant stage={v.progress.find((p) => p.lang === "en")?.stage ?? 0} size={24} />
                  <b style={{ fontWeight: 500 }}>{v.en}</b>
                  <span className="small text-2 grow">{v.ru}</span>
                </div>
              ))
            ) : (
              <Empty title="Английских глаголов пока нет">В «Лаборатории» есть набор «15 неправильных глаголов».</Empty>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { gizraLabel };

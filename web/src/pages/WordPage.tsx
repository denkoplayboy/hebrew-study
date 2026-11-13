import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Target, Sparkles, RefreshCw, GitCompare } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime } from "../lib/app";
import { FACETS, STAGES, facetInfo } from "../../../shared/memory";
import { PERSONS, TENSES, binyanLabel, gizraLabel, posLabel, EN_FORMS, type Tense } from "../../../shared/lang";
import type { WordFull, WordForm } from "../../../shared/types";
import { Bar, FacetFlower, He, Loading, Mixed, Plant, SpeakBtn, StageBadge } from "../components/ui";
import { DraftEditor } from "../components/DraftEditor";

export default function WordPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { ai, toast, touch } = useApp();
  const { data: w, setData, reload } = useData<WordFull>(`/api/words/${id}`, [id]);
  const [lang, setLang] = useState<"he" | "en">("he");
  const [edit, setEdit] = useState<WordFull | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (w && !w.study.includes(lang)) setLang(w.study[0]);
  }, [w, lang]);

  // пока ИИ строит таблицу спряжения — опрашиваем
  useEffect(() => {
    if (w?.conj_status !== "pending") return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [w?.conj_status, reload]);

  if (!w)
    return (
      <div className="page">
        <Loading h={240} />
      </div>
    );

  const prog = w.progress.find((p) => p.lang === lang) || w.progress[0];
  const heForms = w.forms.filter((f) => f.lang === "he" && f.tense !== "infl");
  const inflForms = w.forms.filter((f) => f.lang === "he" && f.tense === "infl");
  const enForms = w.forms.filter((f) => f.lang === "en");

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = () =>
    act(
      "save",
      async () => {
        const e = edit!;
        const r = await api.patch<WordFull>(`/api/words/${w.id}`, {
          he: e.he,
          he_nikud: e.he_nikud,
          translit: e.translit,
          ru: e.ru,
          ru_alt: e.ru_alt,
          en: e.en,
          en_alt: e.en_alt,
          pos: e.pos,
          gender: e.gender,
          plural: e.plural,
          plural_nikud: e.plural_nikud,
          root: e.root,
          binyan: e.binyan,
          gizra: e.gizra,
          notes: e.notes,
          mnemonic: e.mnemonic,
          tags: e.tags,
          study: e.study,
        });
        setData(r);
        setEdit(null);
        touch();
      },
      "Сохранено",
    );

  const toggleStudy = (l: "he" | "en") =>
    act("study", async () => {
      const study = w.study.includes(l) ? w.study.filter((x) => x !== l) : [...w.study, l];
      if (!study.length) return;
      setData(await api.patch<WordFull>(`/api/words/${w.id}`, { study }));
    });

  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => nav(-1)}>
          <ArrowLeft size={16} /> Назад
        </button>
        <div className="row gap-6">
          <button className="btn soft sm" onClick={() => setEdit(edit ? null : w)}>
            <Pencil size={15} /> {edit ? "Отмена" : "Изменить"}
          </button>
          <button
            className="btn ghost sm icon danger"
            title="Удалить"
            onClick={() => {
              if (confirm(`Удалить «${w.he || w.en}» вместе с историей повторений?`))
                act("del", async () => {
                  await api.del(`/api/words/${w.id}`);
                  touch();
                  nav("/words");
                });
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {edit ? (
        <div className="col gap-16">
          <DraftEditor draft={edit} onChange={setEdit} showExamples={false} />
          <button className="btn primary lg" onClick={saveEdit} disabled={busy === "save"}>
            Сохранить
          </button>
        </div>
      ) : (
        <>
          <div className="card pad-lg">
            <div className="row between top wrap gap-16">
              <div className="col gap-6" style={{ minWidth: 0, alignItems: "flex-start", flex: "1 1 320px" }}>
                {w.he ? <He text={w.he_nikud || w.he} className="big-he" /> : <span className="big-en">{w.en}</span>}
                <div className="row wrap gap-6">
                  {w.translit && <span className="muted">{w.translit}</span>}
                  {w.he && <SpeakBtn text={w.he_nikud || w.he} lang="he" slowToo />}
                </div>
                <div style={{ fontSize: "1.3rem" }}>{w.ru}</div>
                {w.ru_alt && <div className="text-2 small">{w.ru_alt}</div>}
                {w.he && w.en && (
                  <div className="row gap-6">
                    <span className="text-2">
                      EN: <b style={{ fontWeight: 500 }}>{w.en}</b>
                      {w.en_alt && <span className="muted"> · {w.en_alt}</span>}
                    </span>
                    <SpeakBtn text={w.en} lang="en" />
                  </div>
                )}
              </div>
              <div className="col gap-6" style={{ alignItems: "center" }}>
                {prog && <FacetFlower progress={prog} size={130} />}
                {prog && <StageBadge stage={prog.stage} />}
              </div>
            </div>
            <div className="chips mt-16">
              {w.pos && <span className="chip static">{posLabel(w.pos)}</span>}
              {w.gender && <span className="chip static">{w.gender === "f" ? "ж. р." : w.gender === "m" ? "м. р." : "м./ж."}</span>}
              {w.plural && (
                <span className="chip static">
                  мн.: <He text={w.plural_nikud || w.plural} />
                </span>
              )}
              {w.root && (
                <Link to={`/roots?root=${encodeURIComponent(w.root)}`} className="chip">
                  корень <span className="he">{w.root}</span>
                </Link>
              )}
              {w.binyan && (
                <span className="chip static">
                  <span className="he">{binyanLabel(w.binyan)?.plain}</span>
                </span>
              )}
              {w.gizra.map((g) => (
                <span key={g} className="chip static" title={gizraLabel(g)?.ru}>
                  <span className="he">{gizraLabel(g)?.he}</span>
                </span>
              ))}
              {w.tags.map((t) => (
                <span key={t} className="chip static">
                  #{t}
                </span>
              ))}
            </div>
            {(w.notes || w.mnemonic) && (
              <div className="col gap-6 mt-16">
                {w.notes && (
                  <p className="text-2">
                    <Mixed text={w.notes} />
                  </p>
                )}
                {w.mnemonic && (
                  <p style={{ color: "var(--gold)" }}>
                    <Mixed text={w.mnemonic} />
                  </p>
                )}
              </div>
            )}
            <div className="row wrap mt-16">
              <button className="btn primary" onClick={() => nav(`/practice/word?wordId=${w.id}`)}>
                <Target size={17} /> Потренировать
              </button>
              <span className="small muted">учить как:</span>
              <button className={"chip" + (w.study.includes("he") ? " on" : "")} onClick={() => toggleStudy("he")} disabled={!w.he}>
                иврит
              </button>
              <button className={"chip" + (w.study.includes("en") ? " on" : "")} onClick={() => toggleStudy("en")} disabled={!w.en}>
                English
              </button>
            </div>
          </div>

          {/* навыки */}
          <div className="row between mt-24">
            <div className="section-title" style={{ margin: 0 }}>
              Навыки
            </div>
            {w.study.length > 1 && (
              <div className="pill-tabs">
                {w.study.map((l) => (
                  <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                    {l === "he" ? "иврит" : "English"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {prog && (
            <div className="card mt-16">
              <div className="facet-list">
                {FACETS.filter((f) => prog.facets.some((x) => x.facet === f.id)).map((f) => {
                  const st = prog.facets.find((x) => x.facet === f.id)!;
                  return (
                    <div key={f.id} className="facet-item" title={f.hint}>
                      <span>{f.ru}</span>
                      {st.state === "locked" ? <span className="small muted">откроется позже</span> : <Bar value={st.strength} color={st.strength > 0.8 ? "var(--gold)" : undefined} />}
                      <span className="small muted nowrap">
                        {st.state === "locked"
                          ? "🔒"
                          : st.reps === 0
                            ? "ещё не было"
                            : st.due <= Date.now()
                              ? "пора повторить"
                              : relTime(st.due)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="divider" />
              <div className="row wrap small text-2 gap-16">
                <span>мастерство: {Math.round(prog.mastery * 100)}%</span>
                <span>
                  стадия: {STAGES[prog.stage].ru} <span className="he muted">{STAGES[prog.stage].he}</span>
                </span>
                {w.fluency.find((f) => f.lang === lang)?.medianMs && (
                  <span title="Медианное время правильного ответа">беглость: {(w.fluency.find((f) => f.lang === lang)!.medianMs! / 1000).toFixed(1)} с</span>
                )}
                <span>ошибок всего: {prog.facets.reduce((s, f) => s + f.lapses, 0)}</span>
              </div>
            </div>
          )}

          {/* спряжение */}
          {w.pos === "verb" && w.he && (
            <>
              <div className="row between mt-24">
                <div className="section-title" style={{ margin: 0 }}>
                  Спряжение
                </div>
                {ai && w.conj_status !== "pending" && (
                  <button className="btn ghost sm" onClick={() => act("conj", async () => setData(await api.post<WordFull>(`/api/words/${w.id}/conjugate`)), "Таблица обновлена")} disabled={busy === "conj"}>
                    {busy === "conj" ? <span className="spinner" /> : <RefreshCw size={14} />} {heForms.length ? "Перестроить" : "Построить с ИИ"}
                  </button>
                )}
              </div>
              <div className="card mt-16">
                {w.conj_status === "pending" || busy === "conj" ? (
                  <div className="row">
                    <span className="spinner" /> ИИ строит таблицу спряжения…
                  </div>
                ) : heForms.length ? (
                  <ConjTable forms={heForms} />
                ) : (
                  <p className="muted small">{w.conj_status === "error" ? "Не удалось построить таблицу — попробуй ещё раз." : ai ? "Таблицы пока нет." : "Таблицы нет: подключи ИИ или попроси меня добавить её в репозиторий."}</p>
                )}
              </div>
            </>
          )}

          {inflForms.length > 0 && (
            <>
              <div className="section-title">Формы</div>
              <div className="card chips">
                {inflForms.map((f) => (
                  <span key={f.id} className="chip static">
                    <span className="muted small">{({ ms: "м. ед.", fs: "ж. ед.", mp: "м. мн.", fp: "ж. мн." } as Record<string, string>)[f.person] || f.person}</span>
                    <He text={f.nikud || f.form} style={{ fontSize: "1.1rem" }} />
                  </span>
                ))}
              </div>
            </>
          )}

          {enForms.length > 0 && (
            <>
              <div className="section-title">English forms</div>
              <div className="card chips">
                {enForms.map((f) => (
                  <span key={f.id} className="chip static">
                    <span className="muted small">{EN_FORMS.find((x) => x.id === f.tense)?.ru || f.tense}</span> <b style={{ fontWeight: 500 }}>{f.form}</b>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* примеры */}
          <div className="row between mt-24">
            <div className="section-title" style={{ margin: 0 }}>
              Примеры
            </div>
            {ai && (
              <button className="btn ghost sm" onClick={() => act("ex", async () => setData(await api.post<WordFull>(`/api/words/${w.id}/examples`)), "Примеры добавлены")} disabled={busy === "ex"}>
                {busy === "ex" ? <span className="spinner" /> : <Sparkles size={14} />} Ещё примеры
              </button>
            )}
          </div>
          <div className="card mt-16">
            {w.examples.length ? (
              <div className="col gap-16">
                {w.examples.map((e) => (
                  <div key={e.id} className="row top">
                    <div className="grow">
                      <div className={e.lang === "he" ? "he" : ""} style={{ fontSize: e.lang === "he" ? "1.35rem" : "1.05rem" }}>
                        {e.lang === "he" ? <He text={e.text_nikud || e.text} /> : e.text}
                      </div>
                      <div className="small muted">{e.ru}</div>
                    </div>
                    <SpeakBtn text={e.lang === "he" ? e.text_nikud || e.text : e.text} lang={e.lang} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">Примеров пока нет. {ai ? "Нажми «Ещё примеры»." : ""} Без примеров не открывается навык «в контексте».</p>
            )}
          </div>

          {/* семья корня и путаница */}
          <div className="grid grid-2 stack-sm mt-24">
            <div className="card">
              <div className="card-title">
                <h3>Семья корня {w.root && <span className="he muted">{w.root}</span>}</h3>
              </div>
              {w.family.length ? (
                <div className="col gap-4">
                  {w.family.map((f) => (
                    <Link key={f.id} to={`/words/${f.id}`} className="row hit" style={{ padding: "6px 8px" }}>
                      <He text={f.he_nikud || f.he} style={{ fontSize: "1.2rem" }} />
                      <span className="small text-2 grow">{f.ru}</span>
                      <span className="tiny muted">{posLabel(f.pos)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="small muted">{w.root ? "Других слов от этого корня в саду пока нет." : "Корень не указан."}</p>
              )}
            </div>
            <div className="card">
              <div className="card-title">
                <h3>
                  <GitCompare size={15} /> Путаю с
                </h3>
              </div>
              {w.confusions.length ? (
                <div className="col gap-4">
                  {w.confusions.map((c) => (
                    <Link key={c.id} to={`/words/${c.id}`} className="row hit" style={{ padding: "6px 8px" }}>
                      {c.he ? <He text={c.he} style={{ fontSize: "1.2rem" }} /> : <b>{c.en}</b>}
                      <span className="small text-2 grow">{c.ru}</span>
                      <span className="badge clay">×{c.count}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="small muted">Пока ни с чем не путал. Если перепутаешь — пара попадёт в режим «Близнецы».</p>
              )}
            </div>
          </div>

          {/* история */}
          <div className="section-title">История слова</div>
          <div className="card">
            {w.history.length ? (
              <div className="timeline">
                {w.history.slice(0, 25).map((h, i) => (
                  <div key={i} className="t-item">
                    <span className="dot" style={{ background: h.grade >= 3 ? "var(--accent)" : h.grade === 2 ? "var(--gold)" : "var(--bad)" }} />
                    <div className="grow small">
                      {facetInfo(h.facet)?.ru || h.facet} · {modeLabel(h.mode)} ·{" "}
                      <span className="muted">{["", "забыл", "с трудом", "помню", "легко"][h.grade]}</span>
                    </div>
                    <span className="tiny muted nowrap">{relTime(h.ts)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">Посажено {relTime(w.created_at)}. Повторений ещё не было.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function modeLabel(m: string) {
  return (
    {
      mix: "полив",
      flash: "карточка",
      choice: "выбор",
      recall: "вспоминание",
      listen: "на слух",
      context: "контекст",
      produce: "своя фраза",
      "produce-bonus": "сам употребил",
      journal: "дневник",
      conjugate: "спряжение",
      analyze: "разбор",
      intro: "знакомство",
      match: "пары",
      twins: "близнецы",
      weak: "слабые места",
      word: "тренировка слова",
    } as Record<string, string>
  )[m] || m;
}

export function ConjTable({ forms }: { forms: WordForm[] }) {
  const tenses = TENSES.filter((t) => forms.some((f) => f.tense === t.id));
  const inf = forms.find((f) => f.tense === "infinitive");
  return (
    <div className="col gap-16">
      {inf && (
        <div className="row">
          <span className="small muted">שם הפועל</span>
          <He text={inf.nikud || inf.form} nikud style={{ fontSize: "1.4rem" }} />
          <SpeakBtn text={inf.nikud || inf.form} lang="he" />
        </div>
      )}
      <div className="grid grid-2 stack-sm" style={{ gap: 18 }}>
        {tenses
          .filter((t) => t.id !== "infinitive")
          .map((t) => (
            <div key={t.id}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <b style={{ fontWeight: 500 }}>{t.ru}</b>
                <span className="he muted">{t.he}</span>
              </div>
              <table className="conj-table">
                <tbody>
                  {PERSONS[t.id as Tense].map((p) => {
                    const f = forms.find((x) => x.tense === t.id && x.person === p.id);
                    if (!f) return null;
                    return (
                      <tr key={p.id}>
                        <td className="small muted he" style={{ textAlign: "left", fontSize: "0.85rem", width: "40%" }}>
                          {p.he}
                        </td>
                        <td className="he">
                          <He text={f.nikud || f.form} nikud />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>
  );
}

export { Plant };

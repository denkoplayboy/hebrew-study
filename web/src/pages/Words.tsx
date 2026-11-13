import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useData, plural } from "../lib/app";
import { Omnibox } from "../components/Omnibox";
import { Plant, Thirst, Empty, Loading, mainProgress, He } from "../components/ui";
import { POS, posLabel } from "../../../shared/lang";
import { STAGES } from "../../../shared/memory";
import type { WordSummary } from "../../../shared/types";

type Sort = "new" | "alpha" | "weak" | "thirsty";

export default function Words() {
  const [lang, setLang] = useState<"" | "he" | "en">("");
  const [pos, setPos] = useState("");
  const [stage, setStage] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("new");
  const { data } = useData<WordSummary[]>(`/api/words?lang=${lang}&pos=${pos}`, []);
  const nav = useNavigate();

  const list = useMemo(() => {
    if (!data) return [];
    let l = data;
    if (stage !== null) l = l.filter((w) => w.progress.some((p) => p.stage === stage && (!lang || p.lang === lang)));
    const m = (w: WordSummary) => mainProgress(w)?.mastery ?? 0;
    if (sort === "alpha") l = [...l].sort((a, b) => (a.he || a.en).localeCompare(b.he || b.en, "he"));
    if (sort === "weak") l = [...l].sort((a, b) => m(a) - m(b));
    if (sort === "thirsty") l = [...l].sort((a, b) => Number(!!mainProgress(b)?.thirsty) - Number(!!mainProgress(a)?.thirsty));
    return l;
  }, [data, stage, sort, lang]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Словарь</h1>
          <p>Одна карточка — три языка. Ищи на любом, в любой форме.</p>
        </div>
      </div>
      <Omnibox />

      <div className="col gap-6 mt-24">
        <div className="row wrap between">
          <div className="pill-tabs">
            {(
              [
                ["", "Все"],
                ["he", "Иврит"],
                ["en", "English"],
              ] as const
            ).map(([id, l]) => (
              <button key={id} className={lang === id ? "on" : ""} onClick={() => setLang(id)}>
                {l}
              </button>
            ))}
          </div>
          <select className="select" style={{ width: "auto", height: 38, padding: "0 12px" }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">сначала новые</option>
            <option value="alpha">по алфавиту</option>
            <option value="weak">сначала слабые</option>
            <option value="thirsty">сначала «хотят пить»</option>
          </select>
        </div>
        <div className="chips">
          <button className={"chip" + (!pos ? " on" : "")} onClick={() => setPos("")}>
            все части речи
          </button>
          {POS.filter((p) => p.id !== "other").map((p) => (
            <button key={p.id} className={"chip" + (pos === p.id ? " on" : "")} onClick={() => setPos(pos === p.id ? "" : p.id)}>
              {p.ru}
            </button>
          ))}
        </div>
        <div className="chips">
          {STAGES.map((s) => (
            <button key={s.id} className={"chip" + (stage === s.id ? " on" : "")} onClick={() => setStage(stage === s.id ? null : s.id)}>
              <Plant stage={s.id} size={16} /> {s.ru}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-16" style={{ padding: 6 }}>
        {!data ? (
          <Loading h={200} />
        ) : list.length === 0 ? (
          <Empty icon={<BookOpen size={32} />} title="Здесь пока пусто">
            Введи слово в поле выше — на иврите, русском или английском.
          </Empty>
        ) : (
          <div className="word-list">
            {list.map((w) => {
              const p = mainProgress(w);
              return (
                <div key={w.id} className="word-row" onClick={() => nav(`/words/${w.id}`)}>
                  <Plant stage={p?.stage ?? 0} size={28} />
                  <div style={{ minWidth: 0 }}>
                    {w.he ? <He text={w.he_nikud || w.he} style={{ fontSize: "1.3rem" }} /> : <span style={{ fontSize: "1.1rem", fontWeight: 500 }}>{w.en}</span>}
                    {w.translit && <div className="tiny muted">{w.translit}</div>}
                  </div>
                  <div className="col-tr" style={{ minWidth: 0 }}>
                    <div className="text-2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.ru}
                    </div>
                    <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.he && w.en ? w.en : ""} {posLabel(w.pos) && `· ${posLabel(w.pos)}`}
                    </div>
                  </div>
                  <div className="col-meta row gap-6">
                    {w.study.includes("en") && w.study.includes("he") && <span className="badge">he+en</span>}
                    {w.study.length === 1 && w.study[0] === "en" && <span className="badge">en</span>}
                    <Thirst on={w.progress.some((x) => x.thirsty)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {data && (
        <p className="small muted center mt-16">
          {list.length} {plural(list.length, "слово", "слова", "слов")}
        </p>
      )}
    </div>
  );
}

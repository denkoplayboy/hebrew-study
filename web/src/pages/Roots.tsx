import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TreeDeciduous } from "lucide-react";
import { useData, plural } from "../lib/app";
import { He, Plant, Empty, Loading, Bar } from "../components/ui";
import { posLabel, normHe } from "../../../shared/lang";
import { HebrewInput } from "../components/HebrewInput";

interface RootRow {
  root: string;
  strength: number;
  words: { id: number; he: string; he_nikud: string; ru: string; pos: string; stage: number; mastery: number }[];
}

export default function Roots() {
  const { data } = useData<RootRow[]>("/api/roots");
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("root") || "");
  const nav = useNavigate();
  const list = useMemo(() => {
    if (!data) return [];
    const n = normHe(q).replace(/[\s-]/g, "");
    return n ? data.filter((r) => normHe(r.root).replace(/[\s-]/g, "").includes(n)) : data;
  }, [data, q]);
  const families = data?.filter((r) => r.words.length > 1).length || 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Корни</h1>
          <p>
            Каждый <span className="he">שורש</span> — грядка, слова от него — побеги. Знание одного слова семьи облегчает остальные.
          </p>
        </div>
      </div>
      <div style={{ maxWidth: 360 }}>
        <HebrewInput lang="he" value={q} onChange={setQ} placeholder="найти корень: ת-פ-ס" />
      </div>
      {data && (
        <p className="small muted mt-8">
          {data.length} {plural(data.length, "корень", "корня", "корней")}, из них {families} {plural(families, "семья", "семьи", "семей")} из 2+ слов
        </p>
      )}
      <div className="grid grid-auto mt-16">
        {!data ? (
          <Loading h={160} />
        ) : list.length === 0 ? (
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <Empty icon={<TreeDeciduous size={32} />} title="Корней пока нет">
              Корень появляется, когда у слова указан שורש (ИИ определяет его автоматически).
            </Empty>
          </div>
        ) : (
          list.map((r) => {
            const avg = r.strength / r.words.length;
            return (
              <div key={r.root} className="card col gap-6">
                <div className="row between">
                  <span className="root-letters">{r.root.split("-").join(" · ")}</span>
                  <span className="badge">{r.words.length}</span>
                </div>
                <Bar value={avg} thin />
                <div className="col gap-4 mt-8">
                  {r.words.map((w) => (
                    <div key={w.id} className="row hit" style={{ padding: "4px 6px" }} onClick={() => nav(`/words/${w.id}`)}>
                      <Plant stage={w.stage} size={22} />
                      <He text={w.he_nikud || w.he} style={{ fontSize: "1.15rem" }} />
                      <span className="small text-2 grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.ru}
                      </span>
                      <span className="tiny muted">{posLabel(w.pos)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

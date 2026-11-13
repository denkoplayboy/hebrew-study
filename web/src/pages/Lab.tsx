import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Sparkles, Trash2, BookOpen } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime } from "../lib/app";
import { Empty, Loading, Mixed, Switch } from "../components/ui";

interface PackRow {
  id: string;
  title: string;
  description: string;
  lang: string;
  level: string | null;
  source: string;
  count: number;
  words: number;
  runs: { ts: number; score: number; total: number }[];
}

const IDEAS = {
  he: ["סמיכות — сопряжённое состояние", "Предлоги ב/ל/מ с глаголами движения", "Числительные: мужской и женский род", "Безличные конструкции: צריך, אפשר, אסור", "Прошедшее время פעל: гортанные буквы"],
  en: ["Phrasal verbs with 'get'", "Conditionals: first and second", "Articles a / an / the", "Prepositions of time: in / on / at", "Reported speech"],
};

export default function Lab() {
  const { ai, toast, touch } = useApp();
  const nav = useNavigate();
  const { data, reload } = useData<PackRow[]>("/api/packs");
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState<"he" | "en">("he");
  const [count, setCount] = useState(10);
  const [useWords, setUseWords] = useState(true);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const p = await api.post<{ id: string }>("/api/packs/generate", { topic, lang, count, useWords });
      toast("Набор готов");
      touch();
      nav(`/lab/${p.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Лаборатория</h1>
          <p>Наборы упражнений по грамматике и темам. Новые наборы создаёт ИИ по твоему запросу — или я добавляю их в репозиторий.</p>
        </div>
      </div>

      <div className="card col gap-16">
        <div className="row between wrap">
          <h3 className="row gap-6">
            <Sparkles size={17} /> Новый набор с ИИ
          </h3>
          <div className="pill-tabs">
            <button className={lang === "he" ? "on" : ""} onClick={() => setLang("he")}>
              עברית
            </button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              English
            </button>
          </div>
        </div>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Тема: например, «סמיכות» или «Present Perfect»" onKeyDown={(e) => e.key === "Enter" && generate()} disabled={!ai} />
        <div className="chips">
          {IDEAS[lang].map((i) => (
            <button key={i} className="chip" onClick={() => setTopic(i)} disabled={!ai}>
              <Mixed text={i} />
            </button>
          ))}
        </div>
        <div className="row wrap gap-16">
          <label className="row small">
            Упражнений:
            <select className="select" style={{ width: 80, padding: "6px 10px" }} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[6, 10, 15, 20].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="row small">
            <Switch on={useWords} onChange={setUseWords} /> использовать слова из моего сада
          </label>
          <div className="grow" />
          <button className="btn primary" onClick={generate} disabled={!ai || busy || !topic.trim()}>
            {busy ? <span className="spinner" /> : <FlaskConical size={17} />} Создать
          </button>
        </div>
        {!ai && <p className="small" style={{ color: "var(--clay)" }}>Генерация доступна, когда подключён ИИ (ANTHROPIC_API_KEY). Готовые наборы ниже работают и без него.</p>}
      </div>

      <div className="section-title">Наборы</div>
      {!data ? (
        <Loading h={160} />
      ) : data.length === 0 ? (
        <Empty icon={<FlaskConical size={30} />} title="Наборов пока нет" />
      ) : (
        <div className="grid grid-auto">
          {data.map((p) => {
            const last = p.runs[0];
            return (
              <div key={p.id} className="card link col gap-6" onClick={() => nav(`/lab/${p.id}`)}>
                <div className="row between">
                  <span className="badge">{p.lang === "he" ? "עברית" : "English"}</span>
                  <div className="row gap-4">
                    {p.source === "ai" && <span className="badge water">ИИ</span>}
                    {p.level && <span className="badge">{p.level}</span>}
                  </div>
                </div>
                <div style={{ fontWeight: 500 }}>
                  <Mixed text={p.title} />
                </div>
                <div className="small text-2">
                  <Mixed text={p.description} />
                </div>
                <div className="grow" />
                <div className="row between small muted">
                  <span className="row gap-6">
                    {p.count} упр.{p.words > 0 && <> · <BookOpen size={13} /> {p.words} слов</>}
                  </span>
                  {last ? (
                    <span>
                      {last.score}/{last.total} · {relTime(last.ts)}
                    </span>
                  ) : (
                    <span>не пройден</span>
                  )}
                </div>
                {p.source !== "repo" && (
                  <button
                    className="btn ghost sm icon"
                    style={{ alignSelf: "flex-end" }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Удалить набор?")) return;
                      await api.del(`/api/packs/${p.id}`);
                      reload();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

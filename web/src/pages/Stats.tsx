import { useState } from "react";
import { Link } from "react-router-dom";
import { useData, relTime, plural } from "../lib/app";
import { FACETS, STAGES, facetInfo } from "../../../shared/memory";
import { Bar, Loading, Plant } from "../components/ui";

interface LangGarden {
  total: number;
  stages: number[];
  stages7: number[];
  passive: number;
  active: number;
  living: number;
  passive7: number;
  active7: number;
}
interface StatsData {
  garden: { he: LangGarden; en: LangGarden };
  facets: { facet: string; locked: number; open: number; practiced: number; avg: number }[];
  calibration: { confidence: number; n: number; accuracy: number | null }[];
  leeches: { id: number; he: string; he_nikud: string; en: string; ru: string; lapses: number }[];
  slow: { id: number; he: string; he_nikud: string; en: string; ru: string; ms: number }[];
  confusions: { count: number; a_id: number; a_he: string; a_en: string; a_ru: string; b_id: number; b_he: string; b_en: string; b_ru: string }[];
  heat: { days: { day: number; count: number; minutes: number }[]; consistency: number };
  moments: { id: number; ts: number; kind: string; text: string; word_id: number | null }[];
  totals: { reviews: number; ok: number };
  modes: { mode: string; n: number }[];
}

const STAGE_COLORS = ["var(--surface-3)", "color-mix(in srgb, var(--clay) 55%, var(--surface))", "color-mix(in srgb, var(--gold) 60%, var(--surface))", "color-mix(in srgb, var(--accent) 55%, var(--surface))", "var(--accent)", "var(--gold)"];

function StageBar({ stages }: { stages: number[] }) {
  const total = stages.reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "var(--surface-3)" }}>
      {stages.map((n, i) => (n ? <div key={i} title={`${STAGES[i].ru}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: STAGE_COLORS[i] }} /> : null))}
    </div>
  );
}

export default function Stats() {
  const { data } = useData<StatsData>("/api/stats");
  const [lang, setLang] = useState<"he" | "en">("he");
  if (!data)
    return (
      <div className="page">
        <Loading h={300} />
      </div>
    );
  const g = data.garden[lang];
  const maxHeat = Math.max(1, ...data.heat.days.map((d) => d.count));
  const totalMin = data.heat.days.reduce((s, d) => s + d.minutes, 0);
  const label = (he: string, en: string) => he || en;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Статистика</h1>
          <p>Не очки, а честная картина памяти: что живо, что увядает и где ты ошибаешься.</p>
        </div>
        {data.garden.en.total > 0 && (
          <div className="pill-tabs">
            <button className={lang === "he" ? "on" : ""} onClick={() => setLang("he")}>
              עברית
            </button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              English
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Сад сейчас и через неделю без полива</h3>
          <span className="small muted">
            {g.total} {plural(g.total, "слово", "слова", "слов")}
          </span>
        </div>
        <div className="col gap-6">
          <div className="small muted">сейчас</div>
          <StageBar stages={g.stages} />
          <div className="small muted mt-8">через 7 дней без практики</div>
          <StageBar stages={g.stages7} />
        </div>
        <div className="chips mt-16">
          {STAGES.map((s) => (
            <span key={s.id} className="chip static">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: STAGE_COLORS[s.id], display: "inline-block" }} /> {s.ru}: {g.stages[s.id]}
            </span>
          ))}
        </div>
        <div className="grid grid-3 mt-16">
          <div className="metric">
            <span className="v">{g.passive}</span>
            <span className="l">пассивный запас</span>
            <span className="d">через неделю: {g.passive7}</span>
          </div>
          <div className="metric">
            <span className="v">{g.active}</span>
            <span className="l">активный запас</span>
            <span className="d">через неделю: {g.active7}</span>
          </div>
          <div className="metric">
            <span className="v">{g.living}</span>
            <span className="l">живая речь</span>
            <span className="d">своё употребление</span>
          </div>
        </div>
      </div>

      <div className="grid grid-2 stack-sm mt-16">
        <div className="card">
          <div className="card-title">
            <h3>Навыки по всему саду</h3>
          </div>
          <div className="facet-list">
            {FACETS.map((f) => {
              const s = data.facets.find((x) => x.facet === f.id);
              if (!s) return null;
              return (
                <div key={f.id} className="facet-item" title={f.hint}>
                  <span>{f.ru}</span>
                  <Bar value={s.avg} />
                  <span className="tiny muted nowrap">
                    {s.open}/{s.open + s.locked}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="tiny muted mt-8">Полоса — средняя сила открытых навыков; справа — сколько слов открыли этот навык.</p>
        </div>
        <div className="card">
          <div className="card-title">
            <h3>Калибровка уверенности</h3>
          </div>
          <div className="col gap-6">
            {data.calibration.map((c) => (
              <div key={c.confidence} className="facet-item">
                <span>{["", "Наугад", "Думаю", "Уверен"][c.confidence]}</span>
                <Bar value={c.accuracy ?? 0} color={c.confidence === 3 ? "var(--gold)" : undefined} />
                <span className="tiny muted nowrap">{c.accuracy === null ? "—" : `${Math.round(c.accuracy * 100)}% · ${c.n}`}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted mt-8">
            Хорошая калибровка: «уверен» ≈ 95%+, «наугад» заметно ниже. Если «уверен» часто ошибается — ты переоцениваешь знание, и такие слова полезно повторять чаще.
          </p>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-title">
          <h3>16 недель</h3>
          <span className="small muted">
            {Math.round(data.heat.consistency * 100)}% дней с практикой · ~{totalMin} мин · {data.totals.reviews} ответов
          </span>
        </div>
        <div className="heat">
          {data.heat.days.map((d) => (
            <i
              key={d.day}
              title={`${new Date(d.day).toLocaleDateString("ru-RU")}: ${d.count}`}
              style={d.count ? { background: `color-mix(in srgb, var(--accent) ${25 + (75 * d.count) / maxHeat}%, var(--surface-3))` } : undefined}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-2 stack-sm mt-16">
        <div className="card">
          <div className="card-title">
            <h3>Капризные слова</h3>
          </div>
          {data.leeches.length ? (
            <div className="col gap-4">
              {data.leeches.map((w) => (
                <Link key={w.id} to={`/words/${w.id}`} className="row hit" style={{ padding: "6px 8px" }}>
                  <span className={w.he ? "he" : ""} style={{ fontSize: w.he ? "1.2rem" : "1rem" }}>
                    {w.he_nikud || label(w.he, w.en)}
                  </span>
                  <span className="small text-2 grow">{w.ru}</span>
                  <span className="badge clay">{w.lapses} срывов</span>
                </Link>
              ))}
              <p className="tiny muted mt-8">Совет: придумай мнемонику или напиши с этим словом фразу в дневнике — личная история держит слово лучше повторов.</p>
            </div>
          ) : (
            <p className="small muted">Слова, которые постоянно забываются, появятся здесь.</p>
          )}
        </div>
        <div className="card">
          <div className="card-title">
            <h3>Медленные</h3>
          </div>
          {data.slow.length ? (
            <div className="col gap-4">
              {data.slow.map((w) => (
                <Link key={w.id} to={`/words/${w.id}`} className="row hit" style={{ padding: "6px 8px" }}>
                  <span className={w.he ? "he" : ""} style={{ fontSize: w.he ? "1.2rem" : "1rem" }}>
                    {w.he_nikud || label(w.he, w.en)}
                  </span>
                  <span className="small text-2 grow">{w.ru}</span>
                  <span className="badge">{(w.ms / 1000).toFixed(1)} с</span>
                </Link>
              ))}
              <p className="tiny muted mt-8">Знаешь, но вспоминаешь долго — значит, слово ещё не стало автоматическим.</p>
            </div>
          ) : (
            <p className="small muted">Здесь появятся слова, которые ты вспоминаешь верно, но медленно.</p>
          )}
        </div>
      </div>

      <div className="grid grid-2 stack-sm mt-16">
        <div className="card">
          <div className="card-title">
            <h3>Близнецы (путаница)</h3>
          </div>
          {data.confusions.length ? (
            <div className="col gap-4">
              {data.confusions.map((c, k) => (
                <div key={k} className="row small" style={{ padding: "4px 0" }}>
                  <Link to={`/words/${c.a_id}`} className={c.a_he ? "he" : ""} style={{ fontSize: "1.15rem" }}>
                    {label(c.a_he, c.a_en)}
                  </Link>
                  <span className="muted">⇄</span>
                  <Link to={`/words/${c.b_id}`} className={c.b_he ? "he" : ""} style={{ fontSize: "1.15rem" }}>
                    {label(c.b_he, c.b_en)}
                  </Link>
                  <span className="grow" />
                  <span className="badge clay">×{c.count}</span>
                </div>
              ))}
              <Link to="/practice/twins" className="btn soft sm mt-8" style={{ alignSelf: "flex-start" }}>
                Тренировать близнецов
              </Link>
            </div>
          ) : (
            <p className="small muted">Пары слов, которые ты путаешь, появятся здесь.</p>
          )}
        </div>
        <div className="card">
          <div className="card-title">
            <h3>Хроника</h3>
          </div>
          {data.moments.length ? (
            <div className="timeline">
              {data.moments.slice(0, 12).map((m) => (
                <div key={m.id} className="t-item">
                  <span className="dot" style={{ background: m.kind === "spontaneous" ? "var(--gold)" : m.kind === "stage" ? "var(--accent)" : "var(--border-strong)" }} />
                  <div className="grow small">
                    {m.word_id ? <Link to={`/words/${m.word_id}`}>{m.text}</Link> : m.text}
                  </div>
                  <span className="tiny muted nowrap">{relTime(m.ts)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">Пока пусто.</p>
          )}
        </div>
      </div>

      {data.modes.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">
            <h3>Режимы за 30 дней</h3>
          </div>
          <div className="chips">
            {data.modes.map((m) => (
              <span key={m.mode} className="chip static">
                {m.mode} · {m.n}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="tiny muted center mt-24">
        <Plant stage={5} size={18} /> Стадии: {STAGES.map((s) => s.ru).join(" → ")}. Навыки: {FACETS.map((f) => facetInfo(f.id).ru.toLowerCase()).join(", ")}.
      </p>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Droplet, Sprout, ArrowRight, Leaf, NotebookPen, Table2 } from "lucide-react";
import { useApp, useData, plural, relTime } from "../lib/app";
import { Omnibox } from "../components/Omnibox";
import { Plant, Thirst, WordFace, Loading, mainProgress } from "../components/ui";
import { STAGES } from "../../../shared/memory";
import type { WordSummary } from "../../../shared/types";

interface LangGarden {
  total: number;
  stages: number[];
  stages7: number[];
  passive: number;
  active: number;
  living: number;
  passive7: number;
  active7: number;
  today: { dueFacets: number; thirstyWords: number; newWaiting: number; newRoom: number };
}
interface HomeData {
  garden: { he: LangGarden; en: LangGarden };
  today: { dueFacets: number; thirstyWords: number; newWaiting: number; newRoom: number; byFacet: Record<string, number> };
  rhythm: { days: { day: number; count: number; minutes: number }[]; consistency: number };
  recent: WordSummary[];
  moments: { id: number; ts: number; kind: string; text: string; word_id: number | null }[];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function Home() {
  const { data } = useData<HomeData>("/api/home");
  const nav = useNavigate();
  const [lang, setLang] = useState<"he" | "en">("he");
  const heDay = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(new Date());
  const ruDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date());

  if (!data)
    return (
      <div className="page">
        <Loading h={60} />
        <div className="mt-16" />
        <Loading h={180} />
      </div>
    );

  const g = data.garden[lang];
  const t = data.today;
  const items = Math.min(40, t.dueFacets + Math.min(t.newRoom, 6) * 2);
  const minutes = Math.max(1, Math.round((items * 18) / 60));
  const hasEn = data.garden.en.total > 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <p>
            {ruDate} · <span className="he">{heDay}</span>
          </p>
        </div>
      </div>

      <Omnibox />

      <div className="hero mt-24">
        <div className="row between top wrap gap-16">
          <div className="col gap-6" style={{ maxWidth: 460 }}>
            {t.thirstyWords + t.newRoom > 0 ? (
              <>
                <h2>
                  {t.thirstyWords > 0 ? (
                    <>
                      {t.thirstyWords} {plural(t.thirstyWords, "слово хочет", "слова хотят", "слов хотят")} пить
                    </>
                  ) : (
                    <>Пора посадить новые слова</>
                  )}
                </h2>
                <p className="text-2">
                  {t.newRoom > 0 && (
                    <>
                      {t.newRoom} {plural(t.newRoom, "новое ждёт", "новых ждут", "новых ждут")} посадки.{" "}
                    </>
                  )}
                  Полив займёт около {minutes} мин — карточки, вспоминание, контекст и формы вперемешку.
                </p>
              </>
            ) : (
              <>
                <h2>Сад полит</h2>
                <p className="text-2">
                  Всё, что нужно было повторить, повторено. Добавь новые слова, напиши пару фраз в дневник или пройдись по слабым местам.
                </p>
              </>
            )}
          </div>
          <div className="row wrap">
            {t.thirstyWords + t.newRoom > 0 ? (
              <button className="btn primary lg" onClick={() => nav("/practice/mix")}>
                <Droplet size={18} /> Полить сад
              </button>
            ) : (
              <>
                <button className="btn primary lg" onClick={() => nav("/journal")}>
                  <NotebookPen size={18} /> Дневник
                </button>
                <button className="btn lg" onClick={() => nav("/practice/weak")}>
                  Слабые места
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="row between mt-24">
        <div className="section-title" style={{ margin: 0 }}>
          Что ты знаешь на самом деле
        </div>
        {hasEn && (
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

      <div className="grid grid-3 mt-16">
        <Metric
          v={g.passive}
          l="Пассивный запас"
          hint="Слова, которые ты сейчас узнаёшь (сумма вероятностей вспомнить)"
          d={g.passive7 < g.passive ? `через неделю без практики: ${g.passive7}` : "стабильно"}
        />
        <Metric
          v={g.active}
          l="Активный запас"
          hint="Слова, которые ты можешь вспомнить сам по-русски"
          d={g.active7 < g.active ? `через неделю без практики: ${g.active7}` : "стабильно"}
        />
        <Metric v={g.living} l="Живая речь" hint="Слова, которые ты сам употребляешь в своих фразах" d="употреблены в своих фразах" />
      </div>

      <div className="card mt-16">
        <div className="card-title">
          <h3>Сад · {g.total} {plural(g.total, "слово", "слова", "слов")}</h3>
          <Link to="/stats" className="small muted row gap-4">
            подробнее <ArrowRight size={14} />
          </Link>
        </div>
        <div className="stage-strip">
          {STAGES.map((s) => (
            <div className="stage-cell" key={s.id} title={s.hint}>
              <Plant stage={s.id} size={30} />
              <b>{g.stages[s.id]}</b>
              <span>{s.ru}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2 stack-sm mt-16">
        <div className="card">
          <div className="card-title">
            <h3>Ритм</h3>
            <span className="small muted">
              {Math.round(data.rhythm.consistency * 14)} из 14 дней
            </span>
          </div>
          <Rhythm days={data.rhythm.days} />
          <p className="small muted mt-8">Регулярность важнее длительности: 10 минут каждый день лучше, чем час раз в неделю.</p>
        </div>
        <div className="card">
          <div className="card-title">
            <h3>Хроника сада</h3>
          </div>
          {data.moments.length ? (
            <div className="timeline">
              {data.moments.map((m) => (
                <div className="t-item" key={m.id}>
                  <span className="dot" style={{ background: m.kind === "spontaneous" ? "var(--gold)" : m.kind === "stage" ? "var(--accent)" : "var(--border-strong)" }} />
                  <div className="grow">
                    {m.word_id ? <Link to={`/words/${m.word_id}`}>{m.text}</Link> : m.text}
                    <div className="tiny muted">{relTime(m.ts)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">Здесь будут появляться события: новые побеги, укоренившиеся слова, первые самостоятельные употребления.</p>
          )}
        </div>
      </div>

      <div className="section-title">Недавно посажено</div>
      <div className="card" style={{ padding: 6 }}>
        {data.recent.length ? (
          data.recent.map((w) => {
            const p = mainProgress(w);
            const l = w.study.includes("he") ? "he" : "en";
            return (
              <div key={w.id} className="hit" onClick={() => nav(`/words/${w.id}`)}>
                <Plant stage={p?.stage ?? 0} size={26} />
                <WordFace w={w} lang={l} className={l === "he" ? "" : ""} />
                <span className="grow small text-2">{w.ru}</span>
                <Thirst on={!!p?.thirsty} />
              </div>
            );
          })
        ) : (
          <div className="empty">
            <Sprout />
            <div>Сад пока пуст — добавь первое слово в поле выше.</div>
          </div>
        )}
      </div>

      <div className="grid grid-3 mt-16">
        <QuickLink to="/verbs" icon={<Table2 size={18} />} title="Глаголы" text="Спряжение и разбор форм" />
        <QuickLink to="/journal" icon={<NotebookPen size={18} />} title="Дневник" text="Свободное письмо с разбором" />
        <QuickLink to="/roots" icon={<Leaf size={18} />} title="Корни" text="Семьи слов от одного шореша" />
      </div>
    </div>
  );
}

function Metric({ v, l, d, hint }: { v: number; l: string; d: string; hint: string }) {
  return (
    <div className="card metric" title={hint}>
      <span className="v">{v}</span>
      <span className="l">{l}</span>
      <span className="d">{d}</span>
    </div>
  );
}

export function Rhythm({ days }: { days: { day: number; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="rhythm" style={{ height: 54 }}>
      {days.map((d) => (
        <i
          key={d.day}
          className={d.count ? "on" : ""}
          style={{ height: d.count ? `${20 + (80 * d.count) / max}%` : "10%", opacity: d.count ? 0.45 + (0.55 * d.count) / max : 1 }}
          title={`${new Date(d.day).toLocaleDateString("ru-RU")}: ${d.count}`}
        />
      ))}
    </div>
  );
}

function QuickLink({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="card link row">
      <span className="brand-mark" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)", width: 38, height: 38 }}>
        {icon}
      </span>
      <div>
        <div style={{ fontWeight: 500 }}>{title}</div>
        <div className="small muted">{text}</div>
      </div>
    </Link>
  );
}

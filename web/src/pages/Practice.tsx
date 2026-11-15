import { useNavigate } from "react-router-dom";
import { Droplet, Layers, ListChecks, Brain, Ear, TextCursorInput, PenLine, Table2, Microscope, Shuffle, GitCompare, Activity, Puzzle, Headphones, Zap, Lock, Telescope } from "lucide-react";
import { useApp, useData } from "../lib/app";
import { QuarterHead } from "../components/City";

interface Today {
  dueFacets: number;
  thirstyWords: number;
  newWaiting: number;
  newRoom: number;
  byFacet: Record<string, number>;
  freshFacets: Record<string, number>;
}

const MODES = [
  { id: "flash", icon: Layers, title: "Карточки", text: "Видишь слово — вспоминаешь смысл и честно оцениваешь себя.", facets: ["recognize"], skill: "узнавание" },
  { id: "choice", icon: ListChecks, title: "Быстрый выбор", text: "Четыре варианта, в обе стороны. Путаницы запоминаются и возвращаются.", facets: ["recognize"], skill: "узнавание" },
  { id: "recall", icon: Brain, title: "Вспомни сам", text: "По-русски → пишешь слово без подсказок. Ставка уверенности перед проверкой.", facets: ["recall", "spell"], skill: "вспоминание + написание" },
  { id: "listen", icon: Ear, title: "На слух", text: "Слово звучит — выбираешь смысл. Тренирует понимание речи.", facets: ["listen"], skill: "слух" },
  { id: "context", icon: TextCursorInput, title: "В контексте", text: "Предложение с пропуском: подставь слово в нужной форме.", facets: ["context"], skill: "контекст" },
  { id: "produce", icon: PenLine, title: "Своя фраза", text: "Видишь только смысл — сам вспоминаешь слово и пишешь с ним предложение.", facets: ["produce"], skill: "употребление" },
  { id: "conjugate", icon: Table2, title: "Спряжение", text: "גוף / זמן / בניין — образуй нужную форму глагола.", facets: ["conjugate"], skill: "формы" },
  { id: "analyze", icon: Microscope, title: "Разбор формы", text: "Видишь форму — определи биньян, время, лицо и корень.", facets: ["conjugate"], skill: "формы" },
  { id: "match", icon: Puzzle, title: "Пары", text: "Соедини слова и переводы на время. Лёгкая разминка.", facets: [], skill: "узнавание" },
  { id: "twins", icon: GitCompare, title: "Близнецы", text: "Слова, которые ты путал между собой, — в одной тренировке.", facets: [], skill: "различение" },
  { id: "weak", icon: Activity, title: "Слабые места", text: "Самые хрупкие навыки по всему саду, даже если ещё не пора.", facets: [], skill: "всё" },
  { id: "edge", icon: Telescope, title: "На грани", text: "Слова, которые вот-вот начнут увядать: успеть до жажды.", facets: [], skill: "всё" },
  { id: "dictation", icon: Headphones, title: "Диктант", text: "Слышишь целое предложение из примеров — записываешь его.", facets: [], skill: "слух + письмо", perk: "dictation", where: "Арена Тверии ур. 2" },
  { id: "blitz", icon: Zap, title: "Блиц", text: "Знакомые слова на скорость. Рекорды и немного росы.", facets: [], skill: "беглость", perk: "blitz", where: "Арена Тверии" },
] as { id: string; icon: typeof Zap; title: string; text: string; facets: string[]; skill: string; perk?: "dictation" | "blitz"; where?: string }[];

export default function Practice() {
  const { data } = useData<{ today: Today }>("/api/home");
  const { ai, perks } = useApp();
  const nav = useNavigate();
  const t = data?.today;
  const count = (facets: string[]) => facets.reduce((s, f) => s + (t?.byFacet[f] || 0), 0);
  const fresh = (facets: string[]) => facets.reduce((s, f) => s + (t?.freshFacets?.[f] || 0), 0);

  return (
    <div className="page">
      <QuarterHead quarter="ulpan" color="var(--q-practice)" title="Практика" sub="У каждого слова несколько навыков — каждый режим «поливает» свои." />

      <button className="hero card link" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => nav("/practice/mix")}>
        <div className="row between wrap gap-16">
          <div className="col gap-4" style={{ flex: "1 1 300px" }}>
            <div className="row">
              <Droplet size={20} className="drop" />
              <h2>Полив</h2>
            </div>
            <p className="text-2">
              Умная смесь: всё, что пора повторить, + знакомство с новыми словами. Сложные навыки открываются по мере роста слова.
            </p>
          </div>
          <div className="col gap-4" style={{ alignItems: "flex-end" }}>
            <span className="badge water">{t ? `${t.dueFacets} к повторению` : "…"}</span>
            {t && t.newRoom > 0 && <span className="badge accent">{t.newRoom} новых</span>}
          </div>
        </div>
      </button>

      <h2 className="section-title">Отдельные навыки</h2>
      <div className="grid grid-auto">
        {MODES.map((m) => {
          const due = count(m.facets);
          const nw = fresh(m.facets);
          const isLocked = !!m.perk && !perks[m.perk];
          return (
            <button
              key={m.id}
              className="card link col gap-6"
              style={{ textAlign: "left", cursor: "pointer", background: isLocked ? "var(--surface-2)" : undefined }}
              onClick={() => nav(isLocked ? "/shop" : `/practice/${m.id}`)}
            >
              <div className="row between">
                <span style={{ color: isLocked ? "var(--muted)" : "var(--q-practice)", display: "grid", placeItems: "center", width: 28, height: 28 }}>
                  <m.icon size={18} />
                </span>
                <div className="row gap-4">
                  {isLocked && (
                    <span className="badge gold">
                      <Lock size={11} /> на поле
                    </span>
                  )}
                  {due > 0 && <span className="badge water">{due}</span>}
                  {nw > 0 && ["recall", "context", "produce", "conjugate"].includes(m.id) && <span className="badge accent" title="Навыки, которые недавно открылись">+{nw} новых</span>}
                </div>
              </div>
              <div style={{ fontWeight: 500 }}>{m.title}</div>
              <div className="small text-2">{m.text}</div>
              <div className="tiny muted">{isLocked ? `откроет: ${m.where}` : `навык: ${m.skill}`}</div>
              {m.id === "produce" && !ai && <div className="tiny" style={{ color: "var(--clay)" }}>без ИИ — самопроверка</div>}
            </button>
          );
        })}
      </div>

      <div className="card soft mt-24">
        <h3>Как растёт слово</h3>
        <p className="small text-2 mt-8">
          Новое слово открывает <b>узнавание</b> и <b>слух</b>. Как только узнал его — открывается <b>вспоминание</b> и <b>написание</b>. Вспомнил сам — открывается{" "}
          <b>контекст</b> и <b>формы</b> (для глаголов). Вспомнил уверенно пару раз — открывается <b>употребление</b>: самое сильное доказательство знания. Если ты
          сам, без подсказки, использовал слово в дневнике или в чужом упражнении — это засчитывается вдвойне. Каждый навык забывается со своей скоростью, и сад
          напоминает о нём ровно тогда, когда вероятность вспомнить падает до ~90%.
        </p>
      </div>
    </div>
  );
}

export { Shuffle };

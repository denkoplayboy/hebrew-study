import { useState } from "react";
import { Scale, Check } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, type AIOp, type AIProfile } from "../lib/app";
import { binyanLabel, gizraLabel, posLabel } from "../../../shared/lang";
import type { WordDraft } from "../../../shared/types";
import { He, Mixed } from "./ui";

interface UsageRow {
  op: string;
  label: string;
  model: string;
  n: number;
  avg: number | null;
  total: number | null;
  avg_in: number;
  avg_out: number;
  cache_read: number;
  all_in: number;
}
interface UsageResp {
  today: { n: number; cost: number };
  month: { n: number; cost: number };
  byOp: UsageRow[];
  wordsAdded30: number;
}
interface CompareResult {
  config: AIProfile;
  draft?: WordDraft;
  error?: string;
  usage: { model: string; cost: number | null; ms: number; input: number; output: number; cacheRead: number; cacheWrite: number } | null;
}

const OPS: { id: AIOp; label: string; hint: string }[] = [
  { id: "analyze", label: "Разбор слов", hint: "словарная форма, переводы, корень, огласовки, примеры; наборы упражнений" },
  { id: "conjugate", label: "Спряжения", hint: "таблица из 25 форм для каждого нового глагола" },
  { id: "check", label: "Проверки", hint: "своя фраза, дневник, глоссы в читалке" },
];

const EFFORTS = [
  { id: "low", label: "низкое" },
  { id: "medium", label: "среднее" },
  { id: "high", label: "высокое" },
] as const;

export function money(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  if (v < 0.01) return `${(v * 100).toFixed(2)}¢`;
  return `$${v.toFixed(v < 1 ? 3 : 2)}`;
}

export function AISection() {
  const { me, settings, updateSettings, toast } = useApp();
  const { data: usage } = useData<UsageResp>("/api/ai/usage");
  const models = me?.ai.models || [];
  const def = me?.ai.defaultModel || "claude-opus-5-5";
  const modelName = (id: string) => models.find((m) => m.id === (id || def))?.name || id || def;

  const setProfile = (op: AIOp, patch: Partial<AIProfile>) =>
    updateSettings({ aiProfile: { ...settings.aiProfile, [op]: { ...settings.aiProfile[op], ...patch } } })
      .then(() => toast("Сохранено"))
      .catch((e) => toast(e.message, true));

  const analyzeRows = usage?.byOp.filter((r) => r.op === "analyze") || [];
  const conjRows = usage?.byOp.filter((r) => r.op === "conjugate") || [];
  const avgWord = analyzeRows.length ? analyzeRows.reduce((s, r) => s + (r.total || 0), 0) / Math.max(1, analyzeRows.reduce((s, r) => s + r.n, 0)) : null;
  const avgConj = conjRows.length ? conjRows.reduce((s, r) => s + (r.total || 0), 0) / Math.max(1, conjRows.reduce((s, r) => s + r.n, 0)) : null;

  return (
    <div className="col gap-16">
      <div className="card col gap-16">
        <div className="grid grid-3 stack-sm">
          <div className="metric">
            <span className="v">{money(usage?.today.cost)}</span>
            <span className="l">сегодня</span>
            <span className="d">{usage?.today.n ?? 0} запросов</span>
          </div>
          <div className="metric">
            <span className="v">{money(usage?.month.cost)}</span>
            <span className="l">за 30 дней</span>
            <span className="d">{usage?.month.n ?? 0} запросов</span>
          </div>
          <div className="metric">
            <span className="v">{money(avgWord)}</span>
            <span className="l">разбор одного слова</span>
            <span className="d">{avgConj !== null ? `+ ${money(avgConj)} на спряжение глагола` : "в среднем"}</span>
          </div>
        </div>
        {usage && usage.byOp.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="conj-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Операция</th>
                  <th>Модель</th>
                  <th>Запросов</th>
                  <th>В среднем</th>
                  <th>Токены ввод / вывод</th>
                  <th>Из кэша</th>
                </tr>
              </thead>
              <tbody>
                {usage.byOp.map((r) => (
                  <tr key={r.op + r.model}>
                    <td>{r.label}</td>
                    <td>{modelName(r.model)}</td>
                    <td>{r.n}</td>
                    <td>{money(r.avg)}</td>
                    <td>
                      {Math.round(r.avg_in)} / {Math.round(r.avg_out)}
                    </td>
                    <td>{r.all_in ? `${Math.round((r.cache_read / r.all_in) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted">
          Учитываются запросы с момента обновления. Основная часть цены — ответ модели (вывод стоит в 5 раз дороже ввода), включая её «размышления».
          Инструкции модели кэшируются: если добавляешь несколько слов подряд, каждое следующее читает их в 20 раз дешевле. Повторный разбор того же слова
          берётся из памяти бесплатно.
        </p>
      </div>

      <div className="card col gap-16">
        <div>
          <h3>Какая модель что делает</h3>
          <p className="small muted mt-8">
            «Усилие» — сколько модель думает перед ответом. Ниже усилие и проще модель — дешевле, но возможны ошибки в огласовках и формах. Сначала проверь на
            своих словах в сравнении ниже.
          </p>
        </div>
        {OPS.map((op) => (
          <div key={op.id} className="row between wrap gap-16">
            <div className="grow" style={{ minWidth: 200 }}>
              <div>{op.label}</div>
              <div className="small muted">{op.hint}</div>
            </div>
            <div className="row">
              <select className="select" style={{ width: "auto" }} value={settings.aiProfile[op.id].model} onChange={(e) => setProfile(op.id, { model: e.target.value })}>
                <option value="">{modelName("")} (по умолчанию)</option>
                {models
                  .filter((m) => m.id !== def)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.note}
                    </option>
                  ))}
              </select>
              <select className="select" style={{ width: "auto" }} value={settings.aiProfile[op.id].effort} onChange={(e) => setProfile(op.id, { effort: e.target.value as AIProfile["effort"] })}>
                {EFFORTS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <Compare onUse={(cfg) => setProfile("analyze", cfg)} modelName={modelName} current={{ ...settings.aiProfile.analyze, model: settings.aiProfile.analyze.model || def }} />
    </div>
  );
}

function Compare({ onUse, modelName, current }: { onUse: (cfg: AIProfile) => void; modelName: (id: string) => string; current: AIProfile }) {
  const { toast } = useApp();
  const presets: AIProfile[] = [
    current,
    { model: "claude-opus-5-5", effort: "low" },
    { model: "claude-sonnet-5-5", effort: "medium" },
    { model: "claude-haiku-5-5", effort: "medium" },
    { model: "claude-haiku-5-5", effort: "high" },
  ];
  const uniq = presets.filter((p, i) => presets.findIndex((x) => x.model === p.model && x.effort === p.effort) === i);
  const key = (p: AIProfile) => `${p.model}:${p.effort}`;
  const [on, setOn] = useState<Set<string>>(new Set(uniq.slice(0, 4).map(key)));
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CompareResult[] | null>(null);

  const run = async () => {
    if (!word.trim()) return;
    setBusy(true);
    setRes(null);
    try {
      const r = await api.post<{ results: CompareResult[] }>("/api/ai/compare", { input: word, configs: uniq.filter((p) => on.has(key(p))) });
      setRes(r.results);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const label = (p: AIProfile) => `${modelName(p.model)} · ${EFFORTS.find((e) => e.id === p.effort)?.label}`;

  return (
    <div className="card col gap-16">
      <div>
        <h3 className="row gap-6">
          <Scale size={17} /> Сравнить модели на слове
        </h3>
        <p className="small muted mt-8">
          Одно и то же слово разбирается несколькими моделями — видно, где ошибки и сколько стоит каждый вариант. Само сравнение тоже платное (примерно как
          добавить 2–3 слова), в словарь ничего не попадает. Лучше брать «трудные» слова: глагол в спряжённой форме, слово с приставками.
        </p>
      </div>
      <div className="chips">
        {uniq.map((p) => (
          <button
            key={key(p)}
            className={"chip" + (on.has(key(p)) ? " on" : "")}
            onClick={() => {
              const n = new Set(on);
              if (n.has(key(p))) n.delete(key(p));
              else n.add(key(p));
              setOn(n);
            }}
          >
            {label(p)}
            {key(p) === key(current) && " (сейчас)"}
          </button>
        ))}
      </div>
      <div className="row wrap">
        <input className="input grow" dir="auto" value={word} onChange={(e) => setWord(e.target.value)} placeholder="например: והתלבשנו или נתפסתי" onKeyDown={(e) => e.key === "Enter" && run()} style={{ minWidth: 200 }} />
        <button className="btn primary" onClick={run} disabled={busy || !word.trim() || on.size === 0}>
          {busy ? <span className="spinner" /> : <Scale size={16} />} Сравнить
        </button>
      </div>
      {busy && <p className="small muted">Модели думают параллельно, обычно 10–40 секунд…</p>}
      {res && (
        <div className="grid grid-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {res.map((r) => (
            <div key={key(r.config)} className="card soft col gap-6" style={{ padding: 14 }}>
              <div className="row between">
                <b style={{ fontWeight: 500 }}>{label(r.config)}</b>
                <span className="badge accent">{money(r.usage?.cost)}</span>
              </div>
              <div className="tiny muted">
                {r.usage ? `${(r.usage.ms / 1000).toFixed(1)} с · ввод ${r.usage.input + r.usage.cacheRead + r.usage.cacheWrite} · вывод ${r.usage.output} токенов` : ""}
              </div>
              {r.error ? (
                <p className="small" style={{ color: "var(--bad)" }}>
                  {r.error}
                </p>
              ) : (
                r.draft && <DraftPreview d={r.draft} />
              )}
              {r.draft && key(r.config) !== key(current) && (
                <button className="btn sm soft" onClick={() => onUse(r.config)}>
                  <Check size={14} /> Использовать для разбора слов
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftPreview({ d }: { d: WordDraft }) {
  const rows: [string, React.ReactNode][] = [
    ["слово", <He text={d.he_nikud || d.he} nikud style={{ fontSize: "1.4rem" }} />],
    ["транскр.", d.translit],
    ["рус.", d.ru + (d.ru_alt ? ` · ${d.ru_alt}` : "")],
    ["англ.", d.en + (d.en_alt ? ` · ${d.en_alt}` : "")],
    ["часть речи", [posLabel(d.pos), d.gender === "f" ? "ж. р." : d.gender === "m" ? "м. р." : ""].filter(Boolean).join(", ")],
    ["мн. ч.", d.plural_nikud ? <He text={d.plural_nikud} nikud /> : "—"],
    ["корень", d.root ? <span className="he">{d.root}</span> : "—"],
    ["биньян", d.binyan ? <span className="he">{binyanLabel(d.binyan)?.plain}</span> : "—"],
    ["гизра", d.gizra.length ? <span className="he">{d.gizra.map((g) => gizraLabel(g)?.he).join(", ")}</span> : "—"],
  ];
  return (
    <div className="col gap-4 small">
      {d.lemma_note && (
        <div className="text-2">
          <Mixed text={d.lemma_note} />
        </div>
      )}
      {rows.map(([k, v]) => (
        <div key={k} className="row top gap-6">
          <span className="muted" style={{ width: 78, flexShrink: 0 }}>
            {k}
          </span>
          <span className="grow">{v}</span>
        </div>
      ))}
      {d.notes && (
        <div className="text-2 mt-8">
          <Mixed text={d.notes} />
        </div>
      )}
      {d.examples
        .filter((e) => e.lang === "he")
        .map((e, i) => (
          <div key={i} className="mt-8">
            <He text={e.text_nikud || e.text} nikud style={{ fontSize: "1.1rem" }} />
            <div className="tiny muted">{e.ru}</div>
          </div>
        ))}
    </div>
  );
}

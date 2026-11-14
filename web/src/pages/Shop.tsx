import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Droplets, Headphones, Zap, BookHeart, Package, Search, Sprout, Palette, Check, Clock, Lock, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime, plural } from "../lib/app";
import { Loading, Modal } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";

interface Item {
  id: string;
  kind: "mechanic" | "consumable" | "theme";
  title: string;
  he: string;
  description: string;
  price: number;
  finalPrice: number;
  onFair: boolean;
  qty: number;
  ai?: boolean;
  icon: string;
  accent?: { light: string; dark: string };
}
interface ShopData {
  balance: number;
  today: number;
  week: number;
  ai: boolean;
  fair: { week: number; items: string[]; discount: number; endsAt: number };
  items: Item[];
  ledger: { id: number; ts: number; amount: number; reason: string }[];
  stories: { id: number; ts: number; title: string; read_at: number | null }[];
  offers: { id: number; ts: number; kind: string; title: string }[];
  blitzBest: number;
}

const ICONS: Record<string, typeof Zap> = { Headphones, Zap, BookHeart, Package, Search, Sprout, Palette };

const THEME_OF: Record<string, string> = {
  "theme-olive": "olive",
  "theme-sea": "sea",
  "theme-negev": "negev",
  "theme-lavender": "lavender",
  "theme-rimon": "rimon",
};

const SEED_IDEAS = ["У врача", "Банк и деньги", "Аренда квартиры", "На работе", "Эмоции и характер", "Покупки и рынок", "Государственные учреждения", "Сленг и разговорные фразы"];

export default function Shop() {
  const { data, reload } = useData<ShopData>("/api/shop");
  const { toast, touch, settings, updateSettings } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [use, setUse] = useState<null | "seeds" | "root-lens">(null);
  const [topic, setTopic] = useState("");

  if (!data)
    return (
      <div className="page">
        <Loading h={300} />
      </div>
    );

  const buy = async (it: Item) => {
    setBusy(it.id);
    try {
      await api.post("/api/shop/buy", { item: it.id });
      toast(`Куплено: ${it.title}`);
      touch();
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const useStory = async () => {
    setBusy("use-story");
    try {
      const r = await api.post<{ id: number }>("/api/shop/use/story", { lang: "he" });
      touch();
      nav(`/stories/${r.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const useSuggest = async () => {
    if (!use || !topic.trim()) return;
    setBusy("use-suggest");
    try {
      const r = await api.post<{ id: number }>("/api/shop/use/suggest", { kind: use === "root-lens" ? "root" : "theme", topic });
      touch();
      setUse(null);
      setTopic("");
      nav(`/offers/${r.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const applyTheme = (accent: string) => updateSettings({ accent }).then(() => toast("Тема применена")).catch((e) => toast(e.message, true));

  const fairItems = data.items.filter((i) => i.onFair);
  const groups: { kind: Item["kind"]; title: string; hint: string }[] = [
    { kind: "mechanic", title: "Механики", hint: "Новые режимы тренировок — открываются навсегда." },
    { kind: "consumable", title: "Подарки сада", hint: "Одноразовые: каждый раз ИИ создаёт что-то новое под твой словарь." },
    { kind: "theme", title: "Оформление", hint: "Цвет сада. Покупается навсегда, переключается когда угодно." },
  ];

  const daysLeft = Math.max(1, Math.ceil((data.fair.endsAt - Date.now()) / 86400000));

  const card = (it: Item, fair = false) => {
    const Icon = ICONS[it.icon] || Package;
    const owned = it.kind !== "consumable" && it.qty > 0;
    const themeId = THEME_OF[it.id];
    const active = themeId && settings.accent === themeId;
    const canAfford = data.balance >= it.finalPrice;
    return (
      <div key={(fair ? "f-" : "") + it.id} className="card col gap-6" style={fair ? { borderColor: "color-mix(in srgb, var(--gold) 45%, var(--border))" } : undefined}>
        <div className="row between">
          <span
            className="brand-mark"
            style={{
              background: it.accent ? `linear-gradient(135deg, ${it.accent.light}, ${it.accent.dark})` : "var(--surface-2)",
              color: it.accent ? "#fff" : "var(--accent-strong)",
              width: 38,
              height: 38,
            }}
          >
            <Icon size={18} />
          </span>
          <div className="row gap-4">
            {it.ai && <span className="badge water">ИИ</span>}
            {it.kind === "consumable" && it.qty > 0 && <span className="badge accent">есть: {it.qty}</span>}
            {it.onFair && <span className="badge gold">−{Math.round(data.fair.discount * 100)}%</span>}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 500 }}>{it.title}</div>
          <div className="he muted small" style={{ textAlign: "left" }}>
            {it.he}
          </div>
        </div>
        <div className="small text-2 grow">{it.description}</div>
        <div className="row between mt-8">
          {owned ? (
            themeId ? (
              active ? (
                <span className="badge accent">
                  <Check size={12} /> включена
                </span>
              ) : (
                <button className="btn sm soft" onClick={() => applyTheme(themeId)}>
                  Применить
                </button>
              )
            ) : (
              <span className="badge accent">
                <Check size={12} /> открыто
              </span>
            )
          ) : (
            <span className="row gap-4" style={{ fontWeight: 500 }}>
              <Droplets size={15} className="drop" />
              {it.onFair && <s className="muted small">{it.price}</s>} {it.finalPrice}
            </span>
          )}
          {!owned && (
            <button className="btn sm primary" disabled={!canAfford || busy === it.id || (it.ai && !data.ai)} onClick={() => buy(it)} title={!canAfford ? "Не хватает росы" : ""}>
              {busy === it.id ? <span className="spinner" /> : !canAfford ? <Lock size={13} /> : null} Купить
            </button>
          )}
          {it.id === "mech-dictation" && owned && (
            <Link to="/practice/dictation" className="btn sm soft">
              Открыть <ArrowRight size={13} />
            </Link>
          )}
          {it.id === "mech-blitz" && owned && (
            <Link to="/practice/blitz" className="btn sm soft">
              Играть <ArrowRight size={13} />
            </Link>
          )}
        </div>
        {it.kind === "consumable" && it.qty > 0 && (
          <>
            {it.id === "story" && (
              <button className="btn sm soft" onClick={useStory} disabled={busy === "use-story"}>
                {busy === "use-story" ? <span className="spinner" /> : null} Написать сказку
              </button>
            )}
            {(it.id === "seeds" || it.id === "root-lens") && (
              <button className="btn sm soft" onClick={() => setUse(it.id as "seeds" | "root-lens")}>
                Использовать
              </button>
            )}
            {it.id === "fertilizer" && <span className="tiny muted">Применяется на странице слова — кнопка «Удобрить». Капризные слова — в статистике.</span>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Лавка садовника</h1>
          <p>Роса капает за настоящую работу памяти и тратится на новые механики, подарки ИИ и оформление.</p>
        </div>
        <div className="card row" style={{ padding: "10px 16px" }}>
          <Droplets size={22} className="drop" />
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 500, lineHeight: 1 }}>{data.balance}</div>
            <div className="tiny muted">
              сегодня +{data.today} · за неделю +{data.week}
            </div>
          </div>
        </div>
      </div>

      <div className="hero">
        <div className="row between wrap">
          <div>
            <h2>Ярмарка недели</h2>
            <p className="text-2 small">
              Три товара со скидкой {Math.round(data.fair.discount * 100)}%. Ассортимент сменится через {daysLeft} {plural(daysLeft, "день", "дня", "дней")}.
            </p>
          </div>
          <span className="badge gold">
            <Clock size={12} /> неделя {data.fair.week}
          </span>
        </div>
        <div className="grid grid-3 stack-sm mt-16">{fairItems.map((i) => card(i, true))}</div>
      </div>

      {groups.map((g) => (
        <div key={g.kind}>
          <div className="section-title">{g.title}</div>
          <p className="small muted" style={{ marginTop: -4, marginBottom: 12 }}>
            {g.hint}
          </p>
          <div className="grid grid-auto">{data.items.filter((i) => i.kind === g.kind).map((i) => card(i))}</div>
          {g.kind === "theme" && settings.accent !== "sage" && (
            <button className="btn ghost sm mt-8" onClick={() => applyTheme("sage")}>
              Вернуть шалфей (по умолчанию)
            </button>
          )}
        </div>
      ))}

      {(data.stories.length > 0 || data.offers.length > 0) && (
        <>
          <div className="section-title">Твои подарки</div>
          <div className="grid grid-2 stack-sm">
            <div className="card">
              <div className="card-title">
                <h3>Сказки</h3>
              </div>
              {data.stories.length ? (
                data.stories.map((s) => (
                  <Link key={s.id} to={`/stories/${s.id}`} className="hit">
                    <BookHeart size={16} />
                    <span className="grow">{s.title}</span>
                    <span className="tiny muted">{s.read_at ? "прочитана" : "новая"}</span>
                  </Link>
                ))
              ) : (
                <p className="small muted">Пока нет.</p>
              )}
            </div>
            <div className="card">
              <div className="card-title">
                <h3>Семена и семьи корней</h3>
              </div>
              {data.offers.length ? (
                data.offers.map((o) => (
                  <Link key={o.id} to={`/offers/${o.id}`} className="hit">
                    {o.kind === "root" ? <Search size={16} /> : <Package size={16} />}
                    <span className="grow">{o.title}</span>
                    <span className="tiny muted">{relTime(o.ts)}</span>
                  </Link>
                ))
              ) : (
                <p className="small muted">Пока нет.</p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="section-title">Как капает роса</div>
      <div className="grid grid-2 stack-sm">
        <div className="card small text-2 col gap-6">
          <div>
            <b>Повторение в срок</b> — 1–4 капли в зависимости от навыка: узнавание 1, вспоминание и контекст 2, своя фраза 4. Повторять заранее ради росы
            бесполезно — капает только то, что «хотело пить».
          </div>
          <div>
            <b>Рост слова</b> — деревце +5, дерево +10, укоренилось +25.
          </div>
          <div>
            <b>Сам употребил слово</b> в дневнике или чужом упражнении — ещё +3, а в первый раз +6.
          </div>
          <div>
            <b>Сад полит полностью</b> — +10 раз в день. Наборы, сказки и блиц — немного сверху.
          </div>
          <div className="muted">Никаких наград за вход, серий и потерь — только за работу памяти.</div>
        </div>
        <div className="card">
          <div className="card-title">
            <h3>История росы</h3>
          </div>
          <div className="col gap-4" style={{ maxHeight: 260, overflowY: "auto" }}>
            {data.ledger.map((l) => (
              <div key={l.id} className="row small">
                <span className="grow text-2">{l.reason}</span>
                <span className="tiny muted">{relTime(l.ts)}</span>
                <b style={{ fontWeight: 500, color: l.amount > 0 ? "var(--ok)" : "var(--clay)", width: 44, textAlign: "right" }}>
                  {l.amount > 0 ? "+" : ""}
                  {l.amount}
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {use && (
        <Modal onClose={() => setUse(null)}>
          <div className="col gap-16">
            <h2>{use === "root-lens" ? "Лупа корня" : "Пакет семян"}</h2>
            <p className="small text-2">
              {use === "root-lens"
                ? "Введи корень — ИИ покажет всю его семью: глаголы во всех биньянах, существительные, прилагательные."
                : "Выбери тему — ИИ подберёт полезные слова, которых в твоём саду ещё нет."}
            </p>
            {use === "root-lens" ? (
              <HebrewInput lang="he" value={topic} onChange={setTopic} placeholder="ת-פ-ס" autoFocus onEnter={useSuggest} />
            ) : (
              <>
                <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Тема" autoFocus onKeyDown={(e) => e.key === "Enter" && useSuggest()} />
                <div className="chips">
                  {SEED_IDEAS.map((t) => (
                    <button key={t} className="chip" onClick={() => setTopic(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn primary lg" onClick={useSuggest} disabled={!topic.trim() || busy === "use-suggest"}>
              {busy === "use-suggest" ? <span className="spinner" /> : null} Подобрать слова
            </button>
          </div>
        </Modal>
      )}
      <p className="tiny muted center mt-24">Лучший блиц: {data.blitzBest || "—"}</p>
    </div>
  );
}

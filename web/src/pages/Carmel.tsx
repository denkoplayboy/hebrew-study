import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Droplets, Heart, Gift, MessageCircle, Sparkles, Star, Check, X } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useData, relTime } from "../lib/app";
import { He, Loading, Mixed, SpeakBtn, Bar } from "../components/ui";
import { HebrewInput } from "../components/HebrewInput";
import { QuarterHead } from "../components/City";

interface GiftDef {
  id: string;
  name: string;
  he: string;
  price: number;
  affinity: number;
  favorite: boolean;
}
interface LogRow {
  id: number;
  ts: number;
  kind: "chat" | "gift" | "money" | "present";
  me: string;
  her: string;
  her_ru: string;
  delta: number;
  meta: string;
}
interface Wish {
  id: number;
  ts: number;
  text: string;
  reply: string;
  price: number;
  status: "offered" | "refused" | "declined" | "paid";
  fulfil_text: string;
  result: { text: string; link?: string; body?: string }[];
}
interface GirlState {
  open: boolean;
  level: number;
  ai: boolean;
  balance: number;
  affinity: number;
  stage: number;
  stageName: string;
  discount: number;
  nextAt: number | null;
  nextName: string | null;
  nameKnown: boolean;
  name: { ru: string; he: string } | null;
  gainedToday: number;
  dailyCap: number;
  gifts: GiftDef[];
  history: LogRow[];
  requestsLeft: number;
  requestsPerDay: number;
  requestDiscount: number;
  wishes: Wish[];
  dailyGift: boolean;
}

/** Портрет: простая иллюстрация, меняется с близостью и подарками. */
function Portrait({ stage, earrings, size = 150 }: { stage: number; earrings: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="Девушка в кафе">
      <circle cx="80" cy="80" r="78" fill="var(--accent-soft)" />
      {/* окно кафе */}
      <rect x="18" y="22" width="44" height="40" rx="8" fill="var(--water-soft)" opacity="0.8" />
      <path d="M40 22 V62 M18 42 H62" stroke="var(--surface)" strokeWidth="3" />
      {/* волосы сзади */}
      <path d="M44 78 C38 40 64 26 82 28 C104 28 124 44 118 82 C122 104 112 118 106 124 L56 124 C46 116 40 100 44 78Z" fill="#3b2a22" />
      {/* плечи и свитер */}
      <path d="M34 160 C36 132 54 120 80 120 C106 120 124 132 126 160Z" fill="var(--clay)" />
      <path d="M70 120 C72 128 88 128 90 120" stroke="color-mix(in srgb, var(--clay) 60%, #000)" strokeWidth="2" fill="none" />
      {/* шея и лицо */}
      <rect x="71" y="100" width="18" height="22" rx="8" fill="#e2b896" />
      <ellipse cx="80" cy="76" rx="26" ry="31" fill="#ebc4a3" />
      {/* кудри спереди */}
      <path d="M54 66 C56 46 70 40 82 42 C96 42 106 52 106 66 C100 56 92 52 82 54 C70 54 60 58 54 66Z" fill="#3b2a22" />
      <circle cx="56" cy="74" r="6" fill="#3b2a22" />
      <circle cx="105" cy="74" r="6" fill="#3b2a22" />
      {/* глаза и брови */}
      <path d="M66 70 Q71 67 76 70 M84 70 Q89 67 94 70" stroke="#3b2a22" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {stage >= 2 ? (
        <path d="M67 77 Q71 80 75 77 M85 77 Q89 80 93 77" stroke="#2c211b" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="71" cy="77" r="2.3" fill="#2c211b" />
          <circle cx="89" cy="77" r="2.3" fill="#2c211b" />
        </>
      )}
      {/* улыбка становится теплее */}
      <path d={stage >= 3 ? "M70 91 Q80 99 90 91" : stage >= 1 ? "M72 92 Q80 96 88 92" : "M73 93 Q80 94 87 93"} stroke="#a0533f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {stage >= 3 && (
        <>
          <ellipse cx="64" cy="86" rx="4.5" ry="2.5" fill="#e79a8a" opacity="0.55" />
          <ellipse cx="96" cy="86" rx="4.5" ry="2.5" fill="#e79a8a" opacity="0.55" />
        </>
      )}
      {earrings && (
        <>
          <circle cx="54" cy="86" r="2.6" fill="var(--gold)" />
          <circle cx="106" cy="86" r="2.6" fill="var(--gold)" />
        </>
      )}
      {/* чашка */}
      <rect x="104" y="128" width="20" height="16" rx="4" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M124 132 C130 132 130 140 124 140" stroke="var(--border-strong)" strokeWidth="2" fill="none" />
      <path d="M110 122 C108 118 112 116 110 112 M117 122 C115 118 119 116 117 112" stroke="var(--muted)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Carmel() {
  const { data, reload } = useData<GirlState>("/api/girl");
  const { toast, touch } = useApp();
  const [tab, setTab] = useState<"chat" | "gifts" | "ask">("chat");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRu, setShowRu] = useState<Set<number>>(new Set());
  const [wish, setWish] = useState("");
  const [offer, setOffer] = useState<Wish | null>(null);
  const [give, setGive] = useState(10);
  const [credited, setCredited] = useState<{ he: string; ru: string }[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [data?.history.length]);

  if (!data)
    return (
      <div className="page narrow">
        <Loading h={360} />
      </div>
    );

  if (!data.open)
    return (
      <div className="page narrow">
        <QuarterHead quarter="carmel" color="var(--q-carmel)" title="Кафе на Кармеле" sub="Здесь ещё пустой холм." />
        <div className="card pad-lg col gap-16" style={{ alignItems: "center", textAlign: "center" }}>
          <Portrait stage={0} earrings={false} />
          <h2>Кафе на Кармеле закрыто</h2>
          <p className="text-2">Купи участок Кармель на игровом поле и построй там кафе. Говорят, за столиком у окна каждое утро сидит девушка, которую никто не знает.</p>
          <Link to="/shop" className="btn primary">
            В лавку
          </Link>
        </div>
      </div>
    );

  const earrings = data.history.some((h) => h.kind === "gift" && h.meta.includes('"earrings"'));
  const title = data.name ? `${data.name.ru}` : "Девушка у окна";
  const prevMin = [0, 40, 120, 300, 600][data.stage];
  const progress = data.nextAt ? (data.affinity - prevMin) / (data.nextAt - prevMin) : 1;

  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    msg.trim() &&
    run(async () => {
      const r = await api.post<{ credited: { he: string; ru: string; spontaneous: boolean }[]; delta: number }>("/api/girl/chat", { message: msg });
      setMsg("");
      setCredited(r.credited.filter((x) => x.spontaneous));
      if (r.delta) toast(r.delta > 0 ? `Близость +${r.delta}` : `Близость ${r.delta}`, r.delta < 0);
      await reload();
      touch();
    });

  const gift = (g: GiftDef) =>
    run(async () => {
      const r = await api.post<{ delta: number; favorite: boolean }>("/api/girl/gift", { id: g.id });
      toast(r.favorite ? `Попал в точку! Близость +${r.delta}` : `Близость +${r.delta}`);
      setTab("chat");
      await reload();
      touch();
    });

  const giveDew = () =>
    run(async () => {
      const r = await api.post<{ delta: number }>("/api/girl/give", { amount: give });
      toast(`Близость +${r.delta}`);
      setTab("chat");
      await reload();
      touch();
    });

  const daily = () =>
    run(async () => {
      const r = await api.post<{ text: string }>("/api/girl/daily");
      toast(r.text);
      await reload();
      touch();
    });

  const ask = () =>
    wish.trim() &&
    run(async () => {
      const w = await api.post<Wish>("/api/game/wish", { text: wish });
      setOffer(w);
      setWish("");
      await reload();
    });

  const accept = (w: Wish) =>
    run(async () => {
      const r = await api.post<Wish>(`/api/game/wish/${w.id}/accept`);
      setOffer(r);
      await reload();
      touch();
    });

  const decline = (w: Wish) =>
    run(async () => {
      await api.post(`/api/game/wish/${w.id}/decline`);
      setOffer(null);
      await reload();
    });

  const WishCard = ({ w }: { w: Wish }) => (
    <div className="card soft col gap-6" style={{ padding: 14 }}>
      <div className="small muted">Ты: {w.text}</div>
      <div>
        <Mixed text={w.reply} />
      </div>
      {w.status === "offered" && (
        <div className="row wrap">
          <button className="btn primary sm" disabled={busy || data.balance < w.price} onClick={() => accept(w)}>
            <Check size={14} /> Заплатить {w.price} <Droplets size={13} />
          </button>
          <button className="btn ghost sm" disabled={busy} onClick={() => decline(w)}>
            <X size={14} /> Не надо
          </button>
        </div>
      )}
      {w.status === "refused" && <span className="badge clay">отказала</span>}
      {w.status === "declined" && <span className="badge">ты передумал</span>}
      {w.status === "paid" && (
        <div className="col gap-6">
          {w.fulfil_text && (
            <div style={{ color: "var(--accent-strong)" }}>
              <Mixed text={w.fulfil_text} />
            </div>
          )}
          {w.result.map((r, k) => (
            <div key={k} className="small">
              <Check size={13} /> {r.link ? <Link to={r.link}>{r.text}</Link> : r.text}
              {r.body && (
                <div className="card" style={{ padding: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>
                  <Mixed text={r.body} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <QuarterHead
        quarter="carmel"
        color="var(--q-carmel)"
        title="Кафе на Кармеле"
        sub="Столик у окна, вид на море и разговор на иврите."
        data={{ carmel: true }}
        actions={
          <Link to="/shop" className="btn sm">
            <ArrowLeft size={16} /> На поле
          </Link>
        }
      />
      <div className="carmel-layout">
        <div className="col gap-16">
          <div className="card col gap-6" style={{ alignItems: "center", textAlign: "center" }}>
            <Portrait stage={data.stage} earrings={earrings} />
            <h2>
              {title} {data.name && <span className="he muted">{data.name.he}</span>}
            </h2>
            <span className={"badge " + (data.stage >= 3 ? "gold" : data.stage >= 1 ? "accent" : "")}>
              <Heart size={12} /> {data.stageName}
            </span>
            <div style={{ width: "100%" }} className="mt-8">
              <Bar value={progress} color="var(--clay)" />
              <div className="tiny muted mt-8">
                {data.nextAt ? `до «${data.nextName}»: ${data.nextAt - data.affinity}` : "ближе уже некуда"} · сегодня +{data.gainedToday} из {data.dailyCap}
              </div>
            </div>
            {data.discount > 0 && <div className="tiny muted">Как другу она уступает {Math.round(data.discount * 100)}% в цене просьб</div>}
            {!data.nameKnown && <div className="tiny muted">Имени её ты пока не знаешь.</div>}
            {data.dailyGift && (
              <button className="btn primary sm mt-8" onClick={daily} disabled={busy}>
                <Gift size={14} /> Она что-то тебе оставила
              </button>
            )}
          </div>
          <div className="card small text-2 col gap-6">
            <div>
              <b>Разговоры</b> на иврите сближают сильнее всего — и слова из сада, которые ты употребишь сам, засчитываются как живая речь.
            </div>
            <div>
              <b>Подарки</b> и <b>роса</b> тоже помогают; любимый подарок недели — вдвойне.
            </div>
            <div>
              <b>Просьбы</b>: о чём угодно. Цену она назначает сама — иногда по-дружески, иногда с юмором. Заплатишь — выполнит.
            </div>
          </div>
        </div>

        <div className="col gap-16">
          <div className="pill-tabs" style={{ alignSelf: "flex-start" }}>
            <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
              <MessageCircle size={14} /> Разговор
            </button>
            <button className={tab === "gifts" ? "on" : ""} onClick={() => setTab("gifts")}>
              <Gift size={14} /> Подарки
            </button>
            <button className={tab === "ask" ? "on" : ""} onClick={() => setTab("ask")}>
              <Sparkles size={14} /> Просьбы {data.requestsPerDay > 0 && `· ${data.requestsLeft}`}
            </button>
          </div>

          {tab === "chat" && (
            <div className="card col gap-16">
              <div className="col gap-16" style={{ maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
                {data.history.length === 0 && (
                  <p className="muted small">
                    Она рисует что-то в планшете и иногда поглядывает в окно на море. Поздоровайся — например, <span className="he">שָׁלוֹם, אֶפְשָׁר לָשֶׁבֶת?</span> («Привет, можно присесть?»)
                  </p>
                )}
                {data.history.map((h) => {
                  const meta = (() => {
                    try {
                      return JSON.parse(h.meta || "{}");
                    } catch {
                      return {};
                    }
                  })();
                  return (
                    <div key={h.id} className="col gap-6">
                      {h.me && (
                        <div className="chat-me">
                          {h.kind === "gift" && <Gift size={13} />}
                          {h.kind === "money" && <Droplets size={13} />} <span dir="auto">{h.me}</span>
                          {h.delta !== 0 && <span className="tiny" style={{ color: h.delta > 0 ? "var(--ok)" : "var(--bad)", marginInlineStart: 8 }}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>}
                        </div>
                      )}
                      {h.her && (
                        <div className="chat-her">
                          <div className="row top gap-6">
                            <He text={h.her} style={{ fontSize: "1.2rem" }} />
                            <SpeakBtn text={h.her} lang="he" />
                          </div>
                          {showRu.has(h.id) || h.kind === "present" ? (
                            <div className="small muted">{h.her_ru}</div>
                          ) : (
                            <button className="btn ghost sm" style={{ height: 22, padding: 0 }} onClick={() => setShowRu(new Set([...showRu, h.id]))}>
                              перевод
                            </button>
                          )}
                          {meta.correction && (
                            <div className="tiny" style={{ color: "var(--gold)" }}>
                              <Mixed text={meta.correction} />
                            </div>
                          )}
                          <div className="tiny muted">{relTime(h.ts)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={end} />
              </div>
              {credited.length > 0 && (
                <div className="small" style={{ color: "var(--gold)" }}>
                  <Star size={13} /> Сам употребил: {credited.map((c) => c.he).join(", ")}
                </div>
              )}
              {data.ai ? (
                <>
                  <HebrewInput lang="he" value={msg} onChange={setMsg} multiline rows={2} wordMode={false} onEnter={send} placeholder="כתוב לה משהו…" />
                  <div className="tiny muted">Можно и по-русски — она ответит на иврите.</div>
                  <button className="btn primary" style={{ alignSelf: "flex-end" }} onClick={send} disabled={busy || !msg.trim()}>
                    {busy ? <span className="spinner" /> : <MessageCircle size={15} />} Сказать
                  </button>
                </>
              ) : (
                <p className="small" style={{ color: "var(--clay)" }}>Для разговоров нужен ИИ (ANTHROPIC_API_KEY). Подарки работают и без него.</p>
              )}
            </div>
          )}

          {tab === "gifts" && (
            <div className="card col gap-16">
              <div className="grid grid-2 stack-sm" style={{ gap: 10 }}>
                {data.gifts.map((g) => (
                  <button key={g.id} className="option" style={{ flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: 4 }} disabled={busy || data.balance < g.price} onClick={() => gift(g)}>
                    <b style={{ fontWeight: 500, textAlign: "start" }}>{g.name}</b>
                    <span className="he muted">{g.he}</span>
                    {g.favorite && data.stage >= 1 && <span className="badge gold">она мечтает об этом</span>}
                    <span className="small row gap-6">
                      {g.price} <Droplets size={13} /> · близость +{g.affinity}
                      {g.favorite && data.stage >= 1 ? " ×2" : ""}
                    </span>
                  </button>
                ))}
              </div>
              {data.stage === 0 && <p className="tiny muted">Что она любит больше всего, станет понятно, когда вы познакомитесь.</p>}
              <div className="divider" style={{ margin: 0 }} />
              <div className="row wrap">
                <span className="small">Просто отдать ей росу:</span>
                <input className="input" type="number" min={1} value={give} onChange={(e) => setGive(Number(e.target.value))} style={{ width: 100, padding: "8px 12px" }} />
                <button className="btn soft" onClick={giveDew} disabled={busy || give < 1 || data.balance < give}>
                  Отдать <Droplets size={14} />
                </button>
                <span className="tiny muted">у тебя {data.balance}</span>
              </div>
            </div>
          )}

          {tab === "ask" && (
            <div className="col gap-16">
              <div className="card col gap-6">
                {data.ai ? (
                  <>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 80 }}
                      dir="auto"
                      value={wish}
                      onChange={(e) => setWish(e.target.value)}
                      placeholder="Попроси о чём угодно: «напиши мне записку на иврите», «помоги с росой на вечер», «подкинь до Мамилы», «придумай мне задание на глаголы»…"
                    />
                    <div className="row between wrap">
                      <span className="small muted">
                        Просьб сегодня осталось: {data.requestsLeft} из {data.requestsPerDay}
                        {data.requestDiscount + data.discount > 0 && ` · скидка ${Math.round(Math.min(0.5, data.requestDiscount + data.discount) * 100)}%`}
                      </span>
                      <button className="btn primary" onClick={ask} disabled={busy || !wish.trim() || data.requestsLeft <= 0}>
                        {busy ? <span className="spinner" /> : <Sparkles size={15} />} Попросить
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="small" style={{ color: "var(--clay)" }}>Для просьб нужен ИИ (ANTHROPIC_API_KEY).</p>
                )}
              </div>
              {offer && <WishCard w={offer} />}
              {data.wishes
                .filter((w) => w.id !== offer?.id)
                .map((w) => (
                  <WishCard key={w.id} w={w} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


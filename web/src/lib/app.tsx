import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { isNative, speakNative } from "./native";
import type { RelatedSuggestion } from "../../../shared/types";
import { HE_FONTS, type ActiveEffects, type Perks } from "../../../shared/board";

export const NO_PERKS: Perks = {
  levels: {},
  fonts: ["frank"],
  accents: ["sage"],
  plants: ["classic"],
  celebration: false,
  dewBonus: 0,
  effects: [],
  cafeDiscount: 0,
  blackDiscount: 0,
  morningCoffee: false,
  girl: false,
  wishesPerDay: 0,
  wishDiscount: 0,
  spinsPerDay: 0,
  jackpotSlice: false,
  bigPrizes: false,
  blitz: false,
  dictation: false,
  blitzMarathon: false,
  blitzCapMult: 1,
  hostelIncome: 0,
  hostelRollChance: 0,
  storyPrice: null,
  storyThemes: false,
  storySeries: false,
  seedsPrice: null,
  rootPrice: null,
  archiveWeeklyFree: false,
};
export const NO_EFFECTS: ActiveEffects = { dew_x2_until: 0, dew_x3_until: 0, golden_until: 0, chest_until: 0, hint: 0, retry: 0, skip: 0, shield: 0, jackpot: 0 };

/** Подключает шрифт иврита из Google Fonts и делает его основным для текста на иврите. */
export function applyHeFont(id: string) {
  const f = HE_FONTS.find((x) => x.id === id) || HE_FONTS[0];
  const root = document.documentElement;
  if (f.id === "frank") {
    root.style.removeProperty("--font-he");
    return;
  }
  const linkId = "he-font-" + f.id;
  if (!document.getElementById(linkId)) {
    const l = document.createElement("link");
    l.id = linkId;
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@400;500;700&display=swap`;
    document.head.appendChild(l);
  }
  root.style.setProperty("--font-he", `"${f.family}", "Frank Ruhl Libre", "Noto Serif Hebrew", serif`);
}

export type AIOp = "analyze" | "conjugate" | "check";
export interface AIProfile {
  model: string;
  effort: "low" | "medium" | "high";
}

export interface Settings {
  aiProfile: Record<AIOp, AIProfile>;
  newPerDay: number;
  retention: number;
  sessionSize: number;
  confidenceBets: boolean;
  showNikud: boolean;
  keyboardMap: boolean;
  ttsRate: number;
  accent: string;
  heFont: string;
  plantStyle: string;
}

export interface Me {
  /** приложение не достучалось до сервера */
  offline?: string;
  authed: boolean;
  needsPassword: boolean;
  ai: { enabled: boolean; model: string; defaultModel?: string; models?: { id: string; name: string; note: string }[] };
  settings: Settings | null;
  dew?: number;
  perks?: Perks | null;
  effects?: ActiveEffects | null;
}

/** Плашка «добавить также…» после посадки слова. */
export interface RelatedOffer {
  source: string;
  items: RelatedSuggestion[];
}

interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}

interface Ctx {
  me: Me | null;
  settings: Settings;
  ai: boolean;
  refreshMe: () => Promise<void>;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  toast: (text: string, bad?: boolean) => void;
  omni: { open: boolean; initial: string; auto: boolean };
  openOmni: (initial?: string, auto?: boolean) => void;
  closeOmni: () => void;
  dew: number;
  perks: Perks;
  effects: ActiveEffects;
  setEffects: (e: ActiveEffects) => void;
  refreshDew: () => void;
  related: RelatedOffer | null;
  offerRelated: (o: RelatedOffer | null) => void;
  bump: number; // увеличивается, когда данные изменились (новое слово и т.п.)
  touch: () => void;
}

const DEFAULTS: Settings = {
  aiProfile: {
    analyze: { model: "", effort: "medium" },
    conjugate: { model: "", effort: "medium" },
    check: { model: "", effort: "low" },
  },
  newPerDay: 10,
  retention: 0.9,
  sessionSize: 20,
  confidenceBets: true,
  showNikud: true,
  keyboardMap: true,
  ttsRate: 0.9,
  accent: "sage",
  heFont: "frank",
  plantStyle: "classic",
};

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [omni, setOmni] = useState({ open: false, initial: "", auto: false });
  const [bump, setBump] = useState(0);
  const [dew, setDew] = useState<{ balance: number; perks: Perks; effects: ActiveEffects }>({ balance: 0, perks: NO_PERKS, effects: NO_EFFECTS });
  const [related, setRelated] = useState<RelatedOffer | null>(null);
  const tid = useRef(0);

  const refreshMe = useCallback(async () => {
    let m: Me;
    try {
      m = await api.get<Me>("/api/me");
    } catch (e) {
      // приложение без сервера или без сети: показываем вход с адресом сервера, а не пустой экран
      if (!isNative) throw e;
      m = { authed: false, needsPassword: true, ai: { enabled: false, model: "" }, settings: null, offline: (e as Error).message || "нет связи" };
    }
    setMe(m);
    if (m.authed) setDew({ balance: m.dew || 0, perks: m.perks || NO_PERKS, effects: m.effects || NO_EFFECTS });
  }, []);
  const refreshDew = useCallback(() => {
    api
      .get<{ balance: number; perks: Perks; effects: ActiveEffects }>("/api/dew")
      .then((d) => setDew({ balance: d.balance, perks: d.perks, effects: d.effects }))
      .catch(() => {});
  }, []);
  // роса обновляется вместе с любыми изменениями данных
  useEffect(() => {
    if (bump && me?.authed) refreshDew();
  }, [bump]); // eslint-disable-line react-hooks/exhaustive-deps

  // акцентная тема (покупается в лавке)
  const accent = me?.settings?.accent || "sage";
  useEffect(() => {
    try {
      localStorage.setItem("accent", accent);
    } catch {
      /* noop */
    }
    if (accent === "sage") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = accent;
  }, [accent]);

  // шрифт иврита (открывается Типографией на игровом поле)
  const heFont = me?.settings?.heFont || "frank";
  useEffect(() => {
    applyHeFont(heFont);
    try {
      localStorage.setItem("heFont", heFont);
    } catch {
      /* noop */
    }
  }, [heFont]);
  useEffect(() => {
    refreshMe().catch(() => setMe({ authed: false, needsPassword: true, ai: { enabled: false, model: "" }, settings: null }));
  }, [refreshMe]);

  const toast = useCallback((text: string, bad?: boolean) => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 5000 : 3200);
  }, []);

  const updateSettings = useCallback(
    async (p: Partial<Settings>) => {
      const s = await api.put<Settings>("/api/settings", p);
      setMe((m) => (m ? { ...m, settings: s } : m));
    },
    [],
  );

  const value: Ctx = {
    me,
    settings: me?.settings || DEFAULTS,
    ai: !!me?.ai.enabled,
    refreshMe,
    updateSettings,
    toast,
    omni,
    openOmni: (initial = "", auto = false) => setOmni({ open: true, initial, auto }),
    closeOmni: () => setOmni({ open: false, initial: "", auto: false }),
    dew: dew.balance,
    perks: dew.perks,
    effects: dew.effects,
    setEffects: (e: ActiveEffects) => setDew((d) => ({ ...d, effects: e })),
    refreshDew,
    related,
    offerRelated: setRelated,
    bump,
    touch: () => setBump((b) => b + 1),
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.bad ? " bad" : "")}>
            {t.text}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}

/** Простая загрузка данных с перезапросом. */
export function useData<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const { bump } = useApp();
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api.get<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bump, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

// ───────── озвучка ─────────
let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (typeof speechSynthesis === "undefined") return [];
  voicesCache = speechSynthesis.getVoices();
  return voicesCache;
}
if (typeof speechSynthesis !== "undefined") {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function hasVoice(lang: "he" | "en") {
  const v = voicesCache.length ? voicesCache : loadVoices();
  return v.some((x) => x.lang.toLowerCase().startsWith(lang === "he" ? "he" : "en") || (lang === "he" && x.lang.toLowerCase().startsWith("iw")));
}

export function speak(text: string, lang: "he" | "en", rate = 0.9) {
  if (!text) return;
  // в приложении — системный синтез речи телефона (в WebView голосов иврита часто нет)
  if (isNative) {
    void speakNative(text, lang, rate).then((ok) => ok || speakWeb(text, lang, rate));
    return;
  }
  speakWeb(text, lang, rate);
}

function speakWeb(text: string, lang: "he" | "en", rate: number) {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "he" ? "he-IL" : "en-US";
  u.rate = rate;
  const v = (voicesCache.length ? voicesCache : loadVoices()).find(
    (x) => x.lang.toLowerCase().startsWith(lang === "he" ? "he" : "en-us") || (lang === "he" && x.lang.toLowerCase().startsWith("iw")),
  );
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

export function useSpeak() {
  const { settings } = useApp();
  return useCallback((text: string, lang: "he" | "en", slow = false) => speak(text, lang, slow ? settings.ttsRate * 0.65 : settings.ttsRate), [settings.ttsRate]);
}

// ───────── мелочи ─────────
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function relTime(ts: number) {
  const d = ts - Date.now();
  const abs = Math.abs(d);
  const min = 60_000,
    h = 60 * min,
    day = 24 * h;
  const fmt = (n: number, u: [string, string, string]) => `${n} ${plural(n, ...u)}`;
  let s: string;
  if (abs < min) s = "сейчас";
  else if (abs < h) s = fmt(Math.round(abs / min), ["минуту", "минуты", "минут"]);
  else if (abs < day) s = fmt(Math.round(abs / h), ["час", "часа", "часов"]);
  else if (abs < 60 * day) s = fmt(Math.round(abs / day), ["день", "дня", "дней"]);
  else s = fmt(Math.round(abs / (30 * day)), ["месяц", "месяца", "месяцев"]);
  if (s === "сейчас") return s;
  return d > 0 ? "через " + s : s + " назад";
}

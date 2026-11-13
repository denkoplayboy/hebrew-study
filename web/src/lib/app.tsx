import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

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
}

export interface Me {
  authed: boolean;
  needsPassword: boolean;
  ai: { enabled: boolean; model: string; defaultModel?: string; models?: { id: string; name: string; note: string }[] };
  settings: Settings | null;
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
  omni: { open: boolean; initial: string };
  openOmni: (initial?: string) => void;
  closeOmni: () => void;
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
};

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [omni, setOmni] = useState({ open: false, initial: "" });
  const [bump, setBump] = useState(0);
  const tid = useRef(0);

  const refreshMe = useCallback(async () => {
    setMe(await api.get<Me>("/api/me"));
  }, []);
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
    openOmni: (initial = "") => setOmni({ open: true, initial }),
    closeOmni: () => setOmni({ open: false, initial: "" }),
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
  if (typeof speechSynthesis === "undefined" || !text) return;
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

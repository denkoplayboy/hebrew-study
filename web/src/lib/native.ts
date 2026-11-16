import { Capacitor } from "@capacitor/core";

/* Всё, что отличает мобильное приложение от сайта, — здесь.
   На сайте функции тихо ничего не делают (или берут веб-аналог), поэтому остальной код не ветвится. */

export const isNative = Capacitor.isNativePlatform();

const SERVER_KEY = "server";
const TOKEN_KEY = "token";
const DEFAULT_SERVER = (import.meta.env.VITE_API_BASE as string | undefined) || "";

function ls(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function lsSet(key: string, v: string) {
  try {
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch {
    /* приватный режим */
  }
}

/** Адрес сервера: на сайте — тот же домен, в приложении — сохранённый или из сборки. */
export function apiBase(): string {
  if (!isNative) return "";
  return (ls(SERVER_KEY) || DEFAULT_SERVER).replace(/\/+$/, "");
}
export function setServer(url: string) {
  lsSet(SERVER_KEY, url.trim().replace(/\/+$/, ""));
}
export function serverAddress(): string {
  return ls(SERVER_KEY) || DEFAULT_SERVER;
}

/** Токен входа приложения (на сайте вход держит cookie). */
export function authToken(): string {
  return isNative ? ls(TOKEN_KEY) : "";
}
export function setAuthToken(t: string | null | undefined) {
  if (isNative) lsSet(TOKEN_KEY, t || "");
}

/** Полный адрес для прямых ссылок (экспорт): в приложении — с токеном в запросе. */
export function apiHref(path: string): string {
  const base = apiBase();
  const t = authToken();
  if (!t) return base + path;
  return base + path + (path.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(t);
}

// ───────── тактильный отклик ─────────
type Buzz = "tap" | "ok" | "bad" | "roll";
export async function buzz(kind: Buzz) {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "ok") await Haptics.notification({ type: NotificationType.Success });
    else if (kind === "bad") await Haptics.notification({ type: NotificationType.Error });
    else if (kind === "roll") await Haptics.impact({ style: ImpactStyle.Heavy });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* нет вибромотора */
  }
}

// ───────── нативное произношение ─────────
/** true — если произнёс нативный движок (в WebView Android голосов иврита часто нет). */
export async function speakNative(text: string, lang: "he" | "en", rate: number): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.stop();
    await TextToSpeech.speak({ text, lang: lang === "he" ? "he-IL" : "en-US", rate, pitch: 1, volume: 1, category: "playback" });
    return true;
  } catch {
    return false;
  }
}

// ───────── напоминание о поливе ─────────
const REMIND_ID = 4401;
/** Одно спокойное напоминание в день в выбранный час. Без серий и наград за вход. */
export async function setDailyReminder(hour: number | null): Promise<string | null> {
  if (!isNative) return "Напоминания работают только в приложении.";
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: REMIND_ID }] });
    if (hour === null) return null;
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return "Разреши уведомления для «Шореша» в настройках телефона.";
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMIND_ID,
          title: "Сад ждёт полива",
          body: "Пара минут — и слова, которые хотят пить, снова в строю.",
          schedule: { on: { hour, minute: 0 }, allowWhileIdle: true },
        },
      ],
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Настройка оболочки приложения: статусная строка зала, кнопка «назад», заставка. */
export async function initNative(goBack: () => boolean) {
  if (!isNative) return;
  document.documentElement.classList.add("native");
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") await StatusBar.setBackgroundColor({ color: "#1e2326" });
  } catch {
    /* нет статусной строки */
  }
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", () => {
      if (!goBack()) void App.exitApp();
    });
  } catch {
    /* iOS без кнопки «назад» */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* без заставки */
  }
}

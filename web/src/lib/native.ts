import { Capacitor } from "@capacitor/core";

/* Всё, что отличает мобильное приложение от сайта, — здесь.
   На сайте функции тихо ничего не делают (или берут веб-аналог), поэтому остальной код не ветвится. */

export const isNative = Capacitor.isNativePlatform();

/** Выгрузка из приложения: файл сохраняется во временную папку и отдаётся в меню «Поделиться»
    (сохранить в Файлы, отправить себе в Telegram, на диск и т. п.). */
export async function shareExport(path: string, name: string): Promise<string | null> {
  try {
    const { api } = await import("./api");
    const data = await api.get<unknown>(path);
    const text = typeof data === "string" ? data : JSON.stringify(data);
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const w = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [w.uri] });
    return null;
  } catch (e) {
    const m = (e as Error).message || "";
    return /cancel/i.test(m) ? null : m || "Не удалось выгрузить";
  }
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

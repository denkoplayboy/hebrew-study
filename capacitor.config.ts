import type { CapacitorConfig } from "@capacitor/cli";

// Мобильное приложение «Шореш»: та же сборка web/, данные и ИИ — на сервере (fly.io).
// Ключ Claude сюда не кладётся никогда: он живёт только в секретах сервера.
const config: CapacitorConfig = {
  appId: "app.shoresh.garden",
  appName: "Шореш",
  webDir: "dist/web",
  backgroundColor: "#1e2326",
  android: {
    backgroundColor: "#1e2326",
  },
  ios: {
    backgroundColor: "#1e2326",
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#1e2326",
      showSpinner: false,
    },
    Keyboard: {
      resize: "body",
    },
    LocalNotifications: {
      iconColor: "#e0a93a",
    },
  },
};

export default config;

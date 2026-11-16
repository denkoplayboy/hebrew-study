import type { CapacitorConfig } from "@capacitor/cli";

// Мобильное приложение «Шореш»: автономное. Сборка `vite --mode app` кладёт серверный код прямо в приложение,
// база SQLite хранится на телефоне, ИИ — напрямую в Claude API по ключу пользователя.
// Ключ Claude не вшивается в сборку: каждый вводит свой в Настройках, он хранится в Keychain/Keystore.
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

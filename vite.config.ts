import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const local = (f: string) => fileURLToPath(new URL(`./web/src/local/${f}`, import.meta.url));

// Обычная сборка — сайт, который ходит к серверу.
// `vite build --mode app` — мобильное приложение: серверный код (server/src/app.ts) собирается
// прямо в приложение, Node-модули заменяются браузерными: SQLite → sql.js, fs/crypto/path → заглушки.
export default defineConfig(({ mode }) => ({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  resolve:
    mode === "app"
      ? {
          alias: [
            { find: /^better-sqlite3$/, replacement: local("sqlite.ts") },
            { find: /^node:fs$/, replacement: local("fs.ts") },
            { find: /^node:path$/, replacement: local("path.ts") },
            { find: /^node:crypto$/, replacement: local("crypto.ts") },
          ],
        }
      : undefined,
  define:
    mode === "app"
      ? {
          // переменные окружения серверного кода живут в приложении (ключ Claude кладётся туда из хранилища)
          "process.env": "(globalThis.__shoreshEnv ??= {})",
        }
      : undefined,
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
}));

import type { LocalBackend } from "../local/backend";

/** Сборка приложения (vite --mode app): весь «сервер» работает на телефоне. На сайте — false,
    и код локального бэкенда в сборку сайта не попадает. */
export const LOCAL = import.meta.env.MODE === "app";

let started: Promise<LocalBackend> | null = null;
export function getLocal(): Promise<LocalBackend> | null {
  if (!LOCAL) return null;
  started ??= import("../local/backend").then((m) => m.startLocalBackend());
  return started;
}

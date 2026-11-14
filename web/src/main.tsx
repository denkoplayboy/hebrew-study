import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyHeFont } from "./lib/app";
import "./styles.css";

try {
  const t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  const a = localStorage.getItem("accent");
  if (a && a !== "sage") document.documentElement.dataset.accent = a;
  const f = localStorage.getItem("heFont");
  if (f && f !== "frank") applyHeFont(f);
} catch {
  /* приватный режим */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

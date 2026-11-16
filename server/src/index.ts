import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "node:fs";
import path from "node:path";
import { app } from "./app.js";
import { aiInfo } from "./ai.js";

// Узел для разработки и сайта. В мобильном приложении те же маршруты (app.ts)
// работают прямо на телефоне — см. web/src/local/.

// ───────────────────────── статика (собранный фронтенд) ─────────────────────────
const WEB_DIR = process.env.WEB_DIR || path.resolve("dist/web");
app.use("/*", serveStatic({ root: path.relative(process.cwd(), WEB_DIR) || "." }));
app.get("*", (c) => {
  const index = path.join(WEB_DIR, "index.html");
  if (fs.existsSync(index)) return c.html(fs.readFileSync(index, "utf8"));
  return c.text("Фронтенд не собран: npm run build", 404);
});

const port = Number(process.env.PORT || 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Шореш слушает http://localhost:${info.port}  (ИИ: ${aiInfo().enabled ? aiInfo().model : "выключен"})`);
});

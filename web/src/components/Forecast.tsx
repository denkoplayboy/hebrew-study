import { useData } from "../lib/app";

/** Прогноз нагрузки на 14 дней: высота блока — точное число навыков к повторению. */
export function Forecast({ compact, bare }: { compact?: boolean; bare?: boolean }) {
  const { data } = useData<{ days: { day: number; count: number }[] }>("/api/forecast");
  if (!data) return null;
  const max = Math.max(1, ...data.days.map((d) => d.count));
  const wd = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  const sum = data.days.reduce((a, d) => a + d.count, 0);
  return (
    <div className={bare ? undefined : "card"}>
      <div className="card-title">
        <h3>Прогноз на две недели</h3>
        <span className="small muted num">{sum} повторений</span>
      </div>
      <div className="row" style={{ alignItems: "stretch", gap: 4, height: compact ? 92 : 128 }}>
        {data.days.map((d, i) => (
          <div
            key={d.day}
            className="col"
            style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4 }}
            title={`${new Date(d.day).toLocaleDateString("ru-RU")}: ${d.count}`}
          >
            <span className="tiny muted num" style={{ height: 16 }}>
              {d.count || ""}
            </span>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <i
                style={{
                  display: "block",
                  width: "100%",
                  borderRadius: "3px 3px 1px 1px",
                  height: d.count ? `${Math.max(8, (d.count / max) * 100)}%` : 4,
                  background: d.count ? (i === 0 ? "var(--water)" : "var(--q-practice)") : "var(--surface-3)",
                  boxShadow: d.count ? "inset 0 -3px 0 rgba(0,0,0,.22)" : "var(--carve)",
                }}
              />
            </div>
            <span className="tiny muted" style={{ fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "var(--text)" : undefined }}>
              {i === 0 ? "сег." : wd.format(new Date(d.day)).replace(".", "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Telescope } from "lucide-react";
import { useApp, useData } from "../lib/app";

/** Прогноз нагрузки на 14 дней — премиум Обсерватории на игровом поле. */
export function Forecast({ compact }: { compact?: boolean }) {
  const { perks } = useApp();
  const { data } = useData<{ days: { day: number; count: number }[] }>(perks.forecast ? "/api/forecast" : null, [perks.forecast]);
  if (!perks.forecast) {
    if (compact) return null;
    return (
      <div className="card soft row">
        <Telescope size={18} />
        <span className="small text-2 grow">Прогноз нагрузки на 14 дней открывает Обсерватория (Кармель) на игровом поле.</span>
        <Link to="/shop" className="btn sm ghost">
          В лавку
        </Link>
      </div>
    );
  }
  if (!data) return null;
  const max = Math.max(1, ...data.days.map((d) => d.count));
  const wd = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  return (
    <div className="card">
      <div className="card-title">
        <h3 className="row gap-6">
          <Telescope size={16} /> Прогноз на 2 недели
        </h3>
        <span className="small muted">навыков к повторению по дням</span>
      </div>
      <div className="row" style={{ alignItems: "flex-end", gap: 5, height: compact ? 70 : 110 }}>
        {data.days.map((d, i) => (
          <div key={d.day} className="col" style={{ flex: 1, alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }} title={`${new Date(d.day).toLocaleDateString("ru-RU")}: ${d.count}`}>
            <span className="tiny muted">{d.count || ""}</span>
            <i style={{ display: "block", width: "100%", borderRadius: 6, height: `${Math.max(4, (d.count / max) * 100)}%`, background: i === 0 ? "var(--water)" : "var(--accent)", opacity: d.count ? 0.85 : 0.2 }} />
            <span className="tiny muted">{i === 0 ? "сег." : wd.format(new Date(d.day))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

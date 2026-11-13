import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { NAV } from "../App";

export default function More() {
  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Ещё</h1>
      </div>
      <div className="card" style={{ padding: 6 }}>
        {NAV.slice(4).map((n) => (
          <Link key={n.to} to={n.to} className="hit">
            <span className="brand-mark" style={{ background: "var(--surface-2)", color: "var(--accent-strong)", width: 36, height: 36 }}>
              <n.icon size={18} />
            </span>
            <span className="grow">{n.label}</span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}

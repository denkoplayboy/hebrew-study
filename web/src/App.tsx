import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Sprout,
  Target,
  BookOpen,
  Table2,
  Ellipsis,
  TreeDeciduous,
  NotebookPen,
  ScanText,
  FlaskConical,
  ChartColumn,
  Settings as SettingsIcon,
  Search,
} from "lucide-react";
import { AppProvider, useApp } from "./lib/app";
import { setUnauthorizedHandler, api } from "./lib/api";
import { Modal } from "./components/ui";
import { Omnibox } from "./components/Omnibox";
import Home from "./pages/Home";
import Practice from "./pages/Practice";
import Session from "./pages/Session";
import Words from "./pages/Words";
import WordPage from "./pages/WordPage";
import Verbs from "./pages/Verbs";
import Roots from "./pages/Roots";
import Journal from "./pages/Journal";
import Reader from "./pages/Reader";
import Lab from "./pages/Lab";
import PackRun from "./pages/PackRun";
import Stats from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import More from "./pages/More";

export const NAV = [
  { to: "/", label: "Сад", icon: Sprout, end: true },
  { to: "/practice", label: "Практика", icon: Target },
  { to: "/words", label: "Словарь", icon: BookOpen },
  { to: "/verbs", label: "Глаголы", icon: Table2 },
  { to: "/roots", label: "Корни", icon: TreeDeciduous },
  { to: "/journal", label: "Дневник", icon: NotebookPen },
  { to: "/reader", label: "Читалка", icon: ScanText },
  { to: "/lab", label: "Лаборатория", icon: FlaskConical },
  { to: "/stats", label: "Статистика", icon: ChartColumn },
  { to: "/settings", label: "Настройки", icon: SettingsIcon },
];

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 3 V13" />
        <path d="M12 7 C9 7 7.5 5.5 7.5 3.5 C10 3.5 12 5 12 7Z" fill="currentColor" />
        <path d="M12 9.5 C15 9.5 16.5 8 16.5 6 C14 6 12 7.5 12 9.5Z" fill="currentColor" />
        <path d="M4 13 H20" />
        <path d="M12 13 C11 16 8.5 18 5.5 19 M12 13 C13 16 15.5 18 18.5 19 M12 13 V21" />
      </svg>
    </div>
  );
}

function Shell() {
  const { me, omni, openOmni, closeOmni } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const inSession = loc.pathname.startsWith("/practice/") || /^\/lab\/.+/.test(loc.pathname);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        openOmni();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openOmni]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (!me) return <div className="page" />;
  if (!me.authed) return <Login />;

  return (
    <div className="app">
      {!inSession && (
        <aside className="sidebar">
          <Link to="/" className="brand">
            <BrandMark />
            <div>
              <div className="brand-name">Шореш</div>
              <div className="brand-sub">сад слов · עברית · English</div>
            </div>
          </Link>
          <button className="btn soft block" style={{ justifyContent: "flex-start" }} onClick={() => openOmni()}>
            <Search size={17} /> Найти или добавить <span className="kbd-hint" style={{ marginLeft: "auto" }}>/</span>
          </button>
          <nav className="nav">
            {NAV.map((n, i) => (
              <div key={n.to}>
                {(i === 4 || i === 8) && <div className="nav-sep" />}
                <NavLink to={n.to} end={n.end}>
                  <n.icon size={18} /> {n.label}
                </NavLink>
              </div>
            ))}
          </nav>
          <div className="grow" />
          <div className="tiny muted" style={{ padding: "0 10px" }}>
            {me.ai.enabled ? `ИИ: ${me.ai.model}` : "ИИ выключен — см. настройки"}
          </div>
        </aside>
      )}
      <main className="main" style={inSession ? { marginLeft: 0 } : undefined}>
        {!inSession && (
          <div className="topbar">
            <Link to="/" className="brand" style={{ padding: 0 }}>
              <BrandMark />
              <div className="brand-name">Шореш</div>
            </Link>
            <button className="btn soft sm" onClick={() => openOmni()}>
              <Search size={16} /> Найти / добавить
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/:mode" element={<Session />} />
          <Route path="/words" element={<Words />} />
          <Route path="/words/:id" element={<WordPage />} />
          <Route path="/verbs" element={<Verbs />} />
          <Route path="/roots" element={<Roots />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/lab/:id" element={<PackRun />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<div className="page">Страница не найдена. <a onClick={() => nav("/")}>В сад</a></div>} />
        </Routes>
      </main>
      {!inSession && (
        <nav className="tabbar">
          {NAV.slice(0, 4).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={21} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/more">
            <Ellipsis size={21} />
            Ещё
          </NavLink>
        </nav>
      )}
      {omni.open && (
        <Modal onClose={closeOmni}>
          <Omnibox initial={omni.initial} autoFocus onDone={closeOmni} compact />
        </Modal>
      )}
    </div>
  );
}

function Login() {
  const { refreshMe } = useApp();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/login", { password: pw });
      await refreshMe();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card pad-lg col gap-16" style={{ width: "min(380px, 100%)" }}>
        <div className="brand" style={{ padding: 0 }}>
          <BrandMark />
          <div>
            <div className="brand-name">Шореш</div>
            <div className="brand-sub">твой сад слов</div>
          </div>
        </div>
        <input
          className="input"
          type="password"
          placeholder="Пароль"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <div className="small" style={{ color: "var(--bad)" }}>{err}</div>}
        <button className="btn primary" onClick={submit} disabled={busy}>
          Войти
        </button>
      </div>
    </div>
  );
}

function AuthBridge() {
  const { refreshMe } = useApp();
  useEffect(() => setUnauthorizedHandler(() => void refreshMe()), [refreshMe]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AuthBridge />
        <Shell />
      </AppProvider>
    </BrowserRouter>
  );
}

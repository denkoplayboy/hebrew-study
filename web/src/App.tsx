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
  Store,
  Droplets,
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
import Shop from "./pages/Shop";
import Story from "./pages/Story";
import Offer from "./pages/Offer";
import Carmel from "./pages/Carmel";
import { RelatedPlaque } from "./components/Suggestions";
import { QuarterMark } from "./components/City";

export const NAV = [
  { to: "/", label: "Сад", icon: Sprout, end: true, q: "var(--accent)" },
  { to: "/practice", label: "Практика", icon: Target, q: "var(--q-practice)" },
  { to: "/words", label: "Словарь", icon: BookOpen, q: "var(--q-lexicon)" },
  { to: "/verbs", label: "Глаголы", icon: Table2, q: "var(--q-practice)" },
  { to: "/roots", label: "Корни", icon: TreeDeciduous, q: "var(--accent)" },
  { to: "/journal", label: "Дневник", icon: NotebookPen, q: "var(--q-lexicon)" },
  { to: "/reader", label: "Читалка", icon: ScanText, q: "var(--q-lexicon)" },
  { to: "/lab", label: "Лаборатория", icon: FlaskConical, q: "var(--q-practice)" },
  { to: "/shop", label: "Лавка", icon: Store, q: "var(--q-shuk)" },
  { to: "/stats", label: "Статистика", icon: ChartColumn, q: "var(--on-hall-2)" },
  { to: "/settings", label: "Настройки", icon: SettingsIcon, q: "var(--on-hall-2)" },
];

/** Квартал по адресу: цвет и название для шапки. */
function quarterOf(path: string) {
  if (path.startsWith("/carmel")) return { q: "var(--q-carmel)", label: "Кармель" };
  if (path.startsWith("/stories") || path.startsWith("/offers")) return { q: "var(--q-shuk)", label: "Лавка" };
  const hit = [...NAV].reverse().find((n) => (n.end ? path === n.to : path.startsWith(n.to)));
  return hit ? { q: hit.q, label: hit.label } : { q: "var(--accent)", label: "Шореш" };
}

function BrandMark({ color = "var(--accent)" }: { color?: string }) {
  return (
    <span className="brand-mark" aria-hidden>
      <QuarterMark color={color} size={30} />
    </span>
  );
}

function Shell() {
  const { me, omni, openOmni, closeOmni, dew } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const inSession = loc.pathname.startsWith("/practice/") || /^\/lab\/.+/.test(loc.pathname);
  const quarter = quarterOf(loc.pathname);

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
              <div className="brand-sub">
                город слов · <span className="he">עברית</span> · English
              </div>
            </div>
          </Link>
          <Link to="/shop" className="dew-chip" title="Роса — валюта сада. Тратится в лавке">
            <Droplets size={16} /> <span className="num">{dew}</span> <span className="muted small">росы</span>
          </Link>
          <button className="btn soft block" style={{ justifyContent: "flex-start" }} onClick={() => openOmni()}>
            <Search size={17} /> Найти или добавить <span className="kbd-hint" style={{ marginLeft: "auto" }}>/</span>
          </button>
          <nav className="nav">
            {NAV.map((n, i) => (
              <div key={n.to}>
                {(i === 4 || i === 9) && <div className="nav-sep" />}
                <NavLink to={n.to} end={n.end} style={{ ["--qc" as string]: n.q }}>
                  <n.icon size={18} /> {n.label}
                </NavLink>
              </div>
            ))}
          </nav>
          <div className="grow" />
          <div className="ai-note">{me.ai.enabled ? `ИИ: ${me.ai.model}` : "ИИ выключен — см. настройки"}</div>
        </aside>
      )}
      <main className="main" style={inSession ? { marginLeft: 0 } : undefined}>
        {!inSession && (
          <div className="topbar">
            <Link to="/" className="brand" style={{ padding: 0 }}>
              <BrandMark color={quarter.q} />
              <div className="brand-name">{loc.pathname === "/" ? "Шореш" : quarter.label}</div>
            </Link>
            <div className="row gap-6">
              <Link to="/shop" className="dew-chip" title="Роса">
                <Droplets size={15} /> {dew}
              </Link>
              <button className="btn soft sm" onClick={() => openOmni()} aria-label="Найти или добавить">
                <Search size={16} /> <span className="hide-xs">Найти / добавить</span>
                <span className="show-xs">Найти</span>
              </button>
            </div>
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
          <Route path="/shop" element={<Shop />} />
          <Route path="/stories/:id" element={<Story />} />
          <Route path="/offers/:id" element={<Offer />} />
          <Route path="/carmel" element={<Carmel />} />
          <Route path="*" element={<div className="page">Страница не найдена. <a onClick={() => nav("/")}>В сад</a></div>} />
        </Routes>
      </main>
      {!inSession && (
        <nav className="tabbar">
          {NAV.slice(0, 4).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={{ ["--qc" as string]: n.q }}>
              <n.icon size={22} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/more" style={{ ["--qc" as string]: "var(--q-shuk)" }}>
            <Ellipsis size={22} />
            Ещё
          </NavLink>
        </nav>
      )}
      {!omni.open && <RelatedPlaque />}
      {omni.open && (
        <Modal onClose={closeOmni}>
          <Omnibox initial={omni.initial} autoFocus onDone={closeOmni} compact autoAnalyze={omni.auto} />
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

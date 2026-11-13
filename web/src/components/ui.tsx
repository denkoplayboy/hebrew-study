import { useEffect, useRef, useState, type ReactNode } from "react";
import { Volume2, X, Droplet } from "lucide-react";
import { FACETS, STAGES } from "../../../shared/memory";
import { stripNikud } from "../../../shared/lang";
import type { WordSummary, WordProgress } from "../../../shared/types";
import { useApp, useSpeak } from "../lib/app";

// ───────── смешанный текст: русские пояснения с вкраплениями иврита ─────────
// без переводов строк внутри: каждая строка — отдельный абзац
const HE_RUN = /([\u0590-\u05FF](?:[\u0590-\u05FF \u00a0"'״׳\-־/,.…]*[\u0590-\u05FF])?(?:…|\.\.\.)?)/g;
export function Mixed({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(HE_RUN);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <bdi key={i} className="he" lang="he">
            {p}
          </bdi>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ───────── растение-стадия ─────────
export function Plant({ stage, size = 28, title }: { stage: number; size?: number; title?: string }) {
  const leaf = "var(--accent)";
  const trunk = "var(--clay)";
  const soil = "var(--border-strong)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label={title || STAGES[stage]?.ru} role="img">
      <title>{title || STAGES[stage]?.ru}</title>
      <path d="M5 26.5 H27" stroke={soil} strokeWidth="1.6" strokeLinecap="round" />
      {stage === 0 && (
        <g>
          <ellipse cx="16" cy="24" rx="3.4" ry="2.4" fill={trunk} opacity="0.9" />
          <path d="M16 21.8 C16 20.5 16.8 19.6 17.8 19.3" stroke={leaf} strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
      )}
      {stage === 1 && (
        <g>
          <path d="M16 26 V19" stroke={leaf} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 20.5 C13 20.5 11.5 18.5 11.5 16.5 C14 16.5 16 18 16 20.5Z" fill={leaf} />
          <path d="M16 19.5 C19 19.5 20.5 17.5 20.5 15.5 C18 15.5 16 17 16 19.5Z" fill={leaf} opacity="0.8" />
        </g>
      )}
      {stage === 2 && (
        <g>
          <path d="M16 26 V12" stroke={leaf} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 22 C12.5 22 10.5 19.5 10.5 17.5 C13.5 17.5 16 19.5 16 22Z" fill={leaf} />
          <path d="M16 19 C19.5 19 21.5 16.5 21.5 14.5 C18.5 14.5 16 16.5 16 19Z" fill={leaf} opacity="0.85" />
          <path d="M16 15 C13.5 15 12 13 12 11 C14.5 11 16 12.8 16 15Z" fill={leaf} opacity="0.75" />
          <path d="M16 12.5 C18 12.5 19.5 10.5 19.5 8.5 C17.5 8.5 16 10.3 16 12.5Z" fill={leaf} opacity="0.65" />
        </g>
      )}
      {stage === 3 && (
        <g>
          <path d="M16 26 V15" stroke={trunk} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 19 L19 16.5" stroke={trunk} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="16" cy="11.5" r="6.5" fill={leaf} />
          <circle cx="19.5" cy="14" r="3.5" fill={leaf} opacity="0.75" />
        </g>
      )}
      {stage >= 4 && (
        <g>
          {stage === 5 && (
            <g stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" fill="none">
              <path d="M16 26.5 C15 28.5 13 29.5 10.5 30" />
              <path d="M16 26.5 C17 28.5 19 29.5 21.5 30" />
              <path d="M16 26.5 V31" />
            </g>
          )}
          <path d="M16 26.5 V14" stroke={trunk} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M16 19.5 L12 16.5 M16 18 L20 15" stroke={trunk} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="10" r="7.5" fill={leaf} />
          <circle cx="10.5" cy="13" r="4.5" fill={leaf} opacity="0.8" />
          <circle cx="21.5" cy="13" r="4.5" fill={leaf} opacity="0.8" />
          {stage === 5 && <circle cx="18.5" cy="8" r="1.4" fill="var(--gold)" />}
        </g>
      )}
    </svg>
  );
}

// ───────── цветок навыков ─────────
export function FacetFlower({ progress, size = 120 }: { progress: WordProgress; size?: number }) {
  const facets = FACETS.filter((f) => progress.facets.some((p) => p.facet === f.id));
  const n = facets.length || 1;
  const L = 46;
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" role="img" aria-label="Навыки слова">
      {facets.map((f, i) => {
        const st = progress.facets.find((p) => p.facet === f.id)!;
        const ang = (i * 360) / n;
        const locked = st.state === "locked";
        const len = locked ? 0 : Math.max(st.reps > 0 ? 0.18 : 0.06, st.strength);
        const petal = (l: number, w: number) => `M0,0 C${w},${-l * 0.35} ${w * 0.9},${-l * 0.85} 0,${-l} C${-w * 0.9},${-l * 0.85} ${-w},${-l * 0.35} 0,0Z`;
        return (
          <g key={f.id} transform={`rotate(${ang})`}>
            <title>{`${f.ru}: ${locked ? "закрыто" : Math.round(st.strength * 100) + "%"}`}</title>
            <path d={petal(L, 13)} fill="none" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray={locked ? "3 3" : undefined} />
            {!locked && <path d={petal(L * len, 13 * Math.max(0.55, len))} fill={st.strength > 0.8 ? "var(--gold)" : "var(--accent)"} opacity={0.35 + 0.6 * st.R} />}
          </g>
        );
      })}
      <circle r="7" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle r="4" fill={progress.stage >= 5 ? "var(--gold)" : progress.stage >= 3 ? "var(--accent)" : "var(--clay)"} />
    </svg>
  );
}

export function StageBadge({ stage }: { stage: number }) {
  return (
    <span className={"badge " + (stage >= 5 ? "gold" : stage >= 3 ? "accent" : "")}>
      <Plant stage={stage} size={16} /> {STAGES[stage].ru}
    </span>
  );
}

// ───────── текст на иврите ─────────
export function He({ text, nikud, className = "", style }: { text: string; nikud?: boolean; className?: string; style?: React.CSSProperties }) {
  const { settings } = useApp();
  const show = nikud ?? settings.showNikud;
  return (
    <span className={"he " + className} style={style} lang="he">
      {show ? text : stripNikud(text)}
    </span>
  );
}

/** Главное представление слова для изучаемого языка. */
export function WordFace({ w, lang, className = "", nikud }: { w: Pick<WordSummary, "he" | "he_nikud" | "en">; lang: "he" | "en"; className?: string; nikud?: boolean }) {
  if (lang === "en") return <span className={className}>{w.en}</span>;
  return <He text={w.he_nikud || w.he} className={className} nikud={nikud} />;
}

export function SpeakBtn({ text, lang, size = "sm", slowToo }: { text: string; lang: "he" | "en"; size?: "sm" | "md"; slowToo?: boolean }) {
  const speak = useSpeak();
  return (
    <span className="row gap-4">
      <button
        className={"btn ghost icon" + (size === "sm" ? " sm" : "")}
        title="Произнести"
        onClick={(e) => {
          e.stopPropagation();
          speak(text, lang);
        }}
      >
        <Volume2 size={size === "sm" ? 16 : 20} />
      </button>
      {slowToo && (
        <button
          className="btn ghost sm"
          title="Медленно"
          onClick={(e) => {
            e.stopPropagation();
            speak(text, lang, true);
          }}
        >
          0.6×
        </button>
      )}
    </span>
  );
}

export function Thirst({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="drop" title="Хочет пить — пора повторить">
      <Droplet size={15} fill="currentColor" />
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)} />;
}

export function Bar({ value, color, thin }: { value: number; color?: string; thin?: boolean }) {
  return (
    <div className={"bar" + (thin ? " thin" : "")}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: "min(860px, 100%)" } : undefined}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <span />
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div style={{ color: "var(--text-2)", fontWeight: 500 }}>{title}</div>
      {children && <div className="small mt-8">{children}</div>}
    </div>
  );
}

export function Loading({ h = 120 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

export function useOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [cb]);
  return ref;
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="btn ghost sm" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <div className="mt-8">{children}</div>}
    </div>
  );
}

export function mainProgress(w: WordSummary): WordProgress | undefined {
  return w.progress.find((p) => p.lang === "he") || w.progress[0];
}

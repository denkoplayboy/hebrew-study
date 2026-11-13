import { useEffect, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { ExerciseItem, WordSummary } from "../../../shared/types";
import type { Facet, Grade } from "../../../shared/memory";
import { posLabel } from "../../../shared/lang";
import { He, SpeakBtn } from "../components/ui";
import { useApp } from "../lib/app";

export interface ExResult {
  grade: Grade;
  correct: boolean;
  facet?: Facet | null;
  confidence?: 1 | 2 | 3 | null;
  ms: number;
  detail?: Record<string, unknown>;
  also?: { facet: Facet; grade: Grade }[];
  confusedWith?: number;
  requeue?: boolean;
  practice?: boolean;
  serverApplied?: boolean;
  review?: any;
}

export interface ExProps {
  item: ExerciseItem;
  onNext: (r: ExResult) => void;
  practice?: boolean;
}

/** Оценка для упражнений с вводом. */
export function gradeTyped(verdict: "exact" | "close" | "wrong", conf: 1 | 2 | 3 | null, ms: number, hinted: boolean): Grade {
  if (verdict === "wrong") return 1;
  if (hinted) return 2;
  if (verdict === "close") return conf === 1 ? 2 : 3;
  if (conf === 1) return 2;
  if (conf === 3) return 4;
  if (conf === 2) return 3;
  return ms < 4000 ? 4 : 3;
}

export function targetOf(w: WordSummary, lang: "he" | "en") {
  return lang === "he" ? w.he_nikud || w.he : w.en;
}

export function acceptedOf(w: WordSummary, lang: "he" | "en"): string[] {
  if (lang === "he") return [w.he, w.he_nikud];
  return [w.en, ...(w.en_alt ? w.en_alt.split(/[,;]/) : [])];
}

export function KindLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="ex-kind">
      {icon}
      {children}
    </div>
  );
}

/** Полная «раскрытая» карточка слова — после ответа. */
export function Reveal({ w, lang, example = true }: { w: WordSummary; lang: "he" | "en"; example?: boolean }) {
  return (
    <div className="col gap-6">
      <div className="row between wrap">
        <div className="row wrap">
          {lang === "he" ? <He text={w.he_nikud || w.he} style={{ fontSize: "2rem" }} /> : <span style={{ fontSize: "1.6rem", fontWeight: 500 }}>{w.en}</span>}
          {lang === "he" && w.translit && <span className="muted">{w.translit}</span>}
        </div>
        <SpeakBtn text={targetOf(w, lang)} lang={lang} slowToo />
      </div>
      <div className="text-2">
        {w.ru}
        {w.ru_alt && <span className="muted"> · {w.ru_alt}</span>}
      </div>
      {lang === "he" && w.en && <div className="small muted">EN: {w.en}</div>}
      {example && w.mnemonic && <div className="small" style={{ color: "var(--gold)" }}>{w.mnemonic}</div>}
    </div>
  );
}

export function WordHint({ w, lang }: { w: WordSummary; lang: "he" | "en" }) {
  const bits = [posLabel(w.pos)];
  if (lang === "he" && w.pos === "noun" && w.gender) bits.push(w.gender === "f" ? "ж. р." : w.gender === "m" ? "м. р." : "м./ж.");
  if (lang === "he" && w.pos === "verb") bits.push("инфинитив");
  return <div className="small muted center">{bits.filter(Boolean).join(" · ")}</div>;
}

export function ContinueBar({ onNext, label = "Дальше", disabled }: { onNext: () => void; label?: string; disabled?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !disabled) {
        e.preventDefault();
        onNext();
      }
    };
    // небольшая задержка, чтобы Enter от проверки не «проскочил» дальше
    const t = setTimeout(() => window.addEventListener("keydown", h), 250);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", h);
    };
  }, [onNext, disabled]);
  return (
    <button className="btn primary lg block" onClick={onNext} disabled={disabled}>
      {label} <ArrowRight size={18} />
    </button>
  );
}

/** Ставка уверенности: вместо одной кнопки «Проверить». */
export function CheckButtons({ onCheck, disabled }: { onCheck: (c: 1 | 2 | 3 | null) => void; disabled?: boolean }) {
  const { settings } = useApp();
  if (!settings.confidenceBets)
    return (
      <button className="btn primary lg block" onClick={() => onCheck(null)} disabled={disabled}>
        Проверить
      </button>
    );
  return (
    <div className="col gap-6">
      <div className="confidence">
        <button className="btn soft" onClick={() => onCheck(1)} disabled={disabled}>
          Наугад
          <small>не уверен</small>
        </button>
        <button className="btn primary" onClick={() => onCheck(2)} disabled={disabled}>
          Думаю, так
          <small>Enter</small>
        </button>
        <button className="btn soft" onClick={() => onCheck(3)} disabled={disabled}>
          Уверен
          <small>точно</small>
        </button>
      </div>
    </div>
  );
}

export function Feedback({ kind, title, children }: { kind: "ok" | "bad" | "close"; title: string; children?: ReactNode }) {
  return (
    <div className={"feedback " + kind}>
      <div style={{ fontWeight: 500 }}>{title}</div>
      {children && <div className="answer mt-8">{children}</div>}
    </div>
  );
}

export function useKeys(map: Record<string, () => void>, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [map, active]);
}

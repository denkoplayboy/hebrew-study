import type { Facet, FacetState } from "./memory.js";
import type { StudyLang } from "./lang.js";

export interface Word {
  id: number;
  he: string;
  he_nikud: string;
  ru: string;
  en: string;
  ru_alt: string;
  en_alt: string;
  translit: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  plural_nikud: string | null;
  root: string | null;
  binyan: string | null;
  gizra: string[];
  notes: string;
  mnemonic: string;
  tags: string[];
  study: StudyLang[];
  source: string;
  conj_status: "none" | "pending" | "ready" | "error";
  created_at: number;
  updated_at: number;
}

export interface WordForm {
  id?: number;
  word_id?: number;
  lang: "he" | "en";
  tense: string;
  person: string;
  form: string;
  nikud: string;
}

export interface Example {
  id?: number;
  word_id?: number;
  lang: "he" | "en";
  text: string;
  text_nikud: string;
  target: string;
  ru: string;
}

export interface WordProgress {
  lang: StudyLang;
  mastery: number;
  stage: number;
  thirsty: boolean;
  facets: (FacetState & { strength: number; R: number })[];
}

export interface WordSummary extends Word {
  progress: WordProgress[];
}

export interface WordFull extends WordSummary {
  forms: WordForm[];
  examples: Example[];
  family: { id: number; he: string; he_nikud: string; ru: string; pos: string }[];
  confusions: { id: number; he: string; en: string; ru: string; count: number }[];
  history: { ts: number; lang: string; facet: string; grade: number; mode: string }[];
  fluency: { lang: string; medianMs: number | null; samples: number }[];
}

/** Черновик слова (после анализа ИИ или ручного ввода) — до сохранения. */
export interface WordDraft {
  input: string;
  input_lang: "he" | "ru" | "en";
  lemma_note: string;
  he: string;
  he_nikud: string;
  translit: string;
  ru: string;
  ru_alt: string;
  en: string;
  en_alt: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  plural_nikud: string | null;
  root: string | null;
  binyan: string | null;
  gizra: string[];
  notes: string;
  mnemonic: string;
  tags: string[];
  study: StudyLang[];
  examples: Example[];
  en_forms: WordForm[];
  he_forms: WordForm[];
}

export interface ExerciseItem {
  key: string;
  kind:
    | "intro"
    | "flash"
    | "choice"
    | "recall"
    | "listen"
    | "cloze"
    | "produce"
    | "conjugate"
    | "analyze";
  lang: StudyLang;
  facet: Facet | null;
  word: WordSummary;
  // доп. данные под конкретное упражнение
  direction?: "to_ru" | "to_target";
  options?: { id: number; label: string; sub?: string }[];
  example?: Example;
  form?: WordForm;
  forms?: WordForm[];
  isNew?: boolean;
}

export interface ReviewInput {
  word_id: number;
  lang: StudyLang;
  facet: Facet;
  grade: 1 | 2 | 3 | 4;
  mode: string;
  ms?: number;
  confidence?: 1 | 2 | 3 | null;
  correct?: boolean;
  detail?: Record<string, unknown>;
  practice?: boolean; // повтор внутри сессии — без изменения расписания
  also?: { facet: Facet; grade: 1 | 2 | 3 | 4 }[];
}

export interface PackItem {
  type: "info" | "choice" | "fill" | "translate" | "order";
  prompt?: string;
  title?: string;
  body?: string;
  options?: string[];
  answer?: number | string | string[];
  answers?: string[];
  tokens?: string[];
  explain?: string;
  lang?: "he" | "en" | "ru";
  hint?: string;
}

export interface Pack {
  id: string;
  title: string;
  description: string;
  lang: "he" | "en";
  level?: string;
  source: "repo" | "ai" | "user";
  items: PackItem[];
  words?: Partial<WordDraft>[];
  created_at?: number;
  runs?: { ts: number; score: number; total: number }[];
}

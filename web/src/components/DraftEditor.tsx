import { X } from "lucide-react";
import { BINYANIM, GZAROT, POS, stripNikud } from "../../../shared/lang";
import type { Example, WordDraft } from "../../../shared/types";
import { He, Mixed, SpeakBtn } from "./ui";
import { HebrewInput } from "./HebrewInput";

type Editable = Pick<
  WordDraft,
  "he" | "he_nikud" | "translit" | "ru" | "ru_alt" | "en" | "en_alt" | "pos" | "gender" | "plural" | "plural_nikud" | "root" | "binyan" | "gizra" | "notes" | "mnemonic" | "tags" | "study"
> & { examples?: Example[]; lemma_note?: string; input?: string };

export function DraftEditor<T extends Editable>({ draft, onChange, showExamples = true }: { draft: T; onChange: (d: T) => void; showExamples?: boolean }) {
  const set = (patch: Partial<T>) => onChange({ ...draft, ...patch });
  const toggleStudy = (l: "he" | "en") => {
    const s = draft.study.includes(l) ? draft.study.filter((x) => x !== l) : [...draft.study, l];
    if (s.length) set({ study: s } as Partial<T>);
  };
  const toggleGizra = (g: string) =>
    set({ gizra: draft.gizra.includes(g) ? draft.gizra.filter((x) => x !== g) : [...draft.gizra, g] } as Partial<T>);

  return (
    <div className="card col gap-16">
      {draft.lemma_note && (
        <div className="badge water" style={{ height: "auto", padding: "6px 10px", whiteSpace: "normal" }}>
          <Mixed text={draft.lemma_note} />
        </div>
      )}
      <div className="row between wrap">
        <div className="col gap-4">
          {draft.he_nikud || draft.he ? <He text={draft.he_nikud || draft.he} nikud className="big-he" /> : <span className="big-en">{draft.en || draft.ru}</span>}
          <span className="muted">{draft.translit}</span>
        </div>
        {(draft.he_nikud || draft.he) && <SpeakBtn text={draft.he_nikud || draft.he} lang="he" size="md" slowToo />}
      </div>

      <div className="grid grid-2 stack-sm">
        <div className="field">
          <label className="label">Иврит с огласовкой</label>
          <HebrewInput lang="he" value={draft.he_nikud} onChange={(v) => set({ he_nikud: v, he: stripNikud(v) } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">Транскрипция</label>
          <input className="input" value={draft.translit} onChange={(e) => set({ translit: e.target.value } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">По-русски</label>
          <input className="input" value={draft.ru} onChange={(e) => set({ ru: e.target.value } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">Другие значения</label>
          <input className="input" value={draft.ru_alt} onChange={(e) => set({ ru_alt: e.target.value } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">English</label>
          <input className="input" value={draft.en} onChange={(e) => set({ en: e.target.value } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">English — другие</label>
          <input className="input" value={draft.en_alt} onChange={(e) => set({ en_alt: e.target.value } as Partial<T>)} />
        </div>
      </div>

      <div className="field">
        <label className="label">Часть речи</label>
        <div className="chips">
          {POS.map((p) => (
            <button key={p.id} className={"chip" + (draft.pos === p.id ? " on" : "")} onClick={() => set({ pos: p.id } as Partial<T>)}>
              {p.ru}
            </button>
          ))}
        </div>
      </div>

      {draft.pos === "noun" && (
        <div className="grid grid-3 stack-sm">
          <div className="field">
            <label className="label">Род</label>
            <div className="chips">
              {[
                ["m", "м. р."],
                ["f", "ж. р."],
                ["mf", "оба"],
              ].map(([id, l]) => (
                <button key={id} className={"chip" + (draft.gender === id ? " on" : "")} onClick={() => set({ gender: id } as Partial<T>)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label className="label">Мн. число</label>
            <HebrewInput lang="he" value={draft.plural_nikud || draft.plural || ""} onChange={(v) => set({ plural_nikud: v, plural: stripNikud(v) } as Partial<T>)} />
          </div>
        </div>
      )}

      <div className="grid grid-2 stack-sm">
        <div className="field">
          <label className="label">Корень (שורש)</label>
          <HebrewInput lang="he" value={draft.root || ""} onChange={(v) => set({ root: v } as Partial<T>)} placeholder="ת-פ-ס" />
        </div>
        {draft.pos === "verb" && (
          <div className="field">
            <label className="label">Биньян</label>
            <div className="chips">
              {BINYANIM.map((b) => (
                <button key={b.id} className={"chip" + (draft.binyan === b.id ? " on" : "")} onClick={() => set({ binyan: b.id } as Partial<T>)}>
                  <span className="he">{b.plain}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {draft.pos === "verb" && (
        <div className="field">
          <label className="label">Гизра (גזרה)</label>
          <div className="chips">
            {GZAROT.map((g) => (
              <button key={g.id} className={"chip" + (draft.gizra.includes(g.id) ? " on" : "")} onClick={() => toggleGizra(g.id)} title={g.ru}>
                <span className="he">{g.he}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="label">Учить как</label>
        <div className="chips">
          <button className={"chip" + (draft.study.includes("he") ? " on" : "")} onClick={() => toggleStudy("he")}>
            Иврит
          </button>
          <button className={"chip" + (draft.study.includes("en") ? " on" : "")} onClick={() => toggleStudy("en")}>
            English
          </button>
        </div>
      </div>

      <div className="grid grid-2 stack-sm">
        <div className="field">
          <label className="label">Заметки (управление, сочетания)</label>
          <textarea className="textarea" style={{ minHeight: 80 }} value={draft.notes} onChange={(e) => set({ notes: e.target.value } as Partial<T>)} />
        </div>
        <div className="field">
          <label className="label">Мнемоника</label>
          <textarea className="textarea" style={{ minHeight: 80 }} value={draft.mnemonic} onChange={(e) => set({ mnemonic: e.target.value } as Partial<T>)} />
        </div>
      </div>

      {showExamples && draft.examples && draft.examples.length > 0 && (
        <div className="field">
          <label className="label">Примеры</label>
          <div className="col gap-6">
            {draft.examples.map((ex, i) => (
              <div key={i} className="row top card soft" style={{ padding: 10 }}>
                <div className="grow">
                  <div className={ex.lang === "he" ? "he" : ""} style={{ fontSize: ex.lang === "he" ? "1.2rem" : "1rem" }}>
                    {ex.lang === "he" ? ex.text_nikud || ex.text : ex.text}
                  </div>
                  <div className="small muted">{ex.ru}</div>
                </div>
                <button className="btn ghost icon sm" onClick={() => set({ examples: draft.examples!.filter((_, j) => j !== i) } as Partial<T>)}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

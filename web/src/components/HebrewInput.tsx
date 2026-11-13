import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { HE_KEYBOARD_ROWS, HE_KEYMAP, RU_TO_LATIN } from "../../../shared/lang";
import { useApp } from "../lib/app";

function mapChar(ch: string, punct: boolean): string {
  const lower = ch.toLowerCase();
  const lat = RU_TO_LATIN[lower] ?? lower;
  if (!punct && /[,.;/']/.test(lat) && !/[а-яё]/i.test(ch)) return ch;
  if (/[a-z]/.test(lat) || (punct && HE_KEYMAP[lat])) return HE_KEYMAP[lat] ?? ch;
  if (/[а-яё]/i.test(ch) && HE_KEYMAP[lat]) return HE_KEYMAP[lat];
  return ch;
}

export interface HebrewInputHandle {
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  lang: "he" | "en" | "ru";
  placeholder?: string;
  multiline?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  big?: boolean;
  /** режим слова: запятая/точка на латинской раскладке → ת/ץ (как на ивритской клавиатуре) */
  wordMode?: boolean;
  rows?: number;
  /** показать подсказку про раскладку */
  hint?: boolean;
}

/** Поле ввода, понимающее иврит: латиница/кириллица превращаются в буквы иврита по израильской раскладке. */
export const HebrewInput = forwardRef<HebrewInputHandle, Props>(function HebrewInput(
  { value, onChange, lang, placeholder, multiline, onEnter, autoFocus, disabled, big, wordMode = true, rows, hint },
  ref,
) {
  const { settings } = useApp();
  const [kb, setKb] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  const isHe = lang === "he";
  const mapOn = isHe && settings.keyboardMap;

  const handle = (raw: string) => {
    if (!mapOn) return onChange(raw);
    // преобразуем только «чужие» символы, иврит не трогаем
    let out = "";
    for (const ch of raw) out += /[֐-׿\s\d]/.test(ch) ? ch : mapChar(ch, wordMode);
    onChange(out);
  };

  const insert = (s: string) => {
    const el = inputRef.current;
    if (!el) return onChange(value + s);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + s + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + s.length, start + s.length);
    });
  };
  const backspace = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    if (start === end && start > 0) {
      onChange(value.slice(0, start - 1) + value.slice(end));
      requestAnimationFrame(() => el?.setSelectionRange(start - 1, start - 1));
    } else onChange(value.slice(0, start) + value.slice(end));
    el?.focus();
  };

  const common = {
    ref: inputRef,
    value,
    placeholder,
    disabled,
    autoFocus,
    dir: isHe ? "rtl" : "auto",
    lang: isHe ? "he" : lang,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => handle(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && onEnter && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onEnter();
      }
    },
  };

  return (
    <div className="col gap-6">
      <div style={{ position: "relative" }}>
        {multiline ? (
          <textarea {...common} rows={rows || 5} className={"textarea" + (isHe ? " he" : "")} style={isHe ? { fontSize: "1.3rem" } : undefined} />
        ) : (
          <input {...common} className={"input" + (big ? " big" : "") + (isHe ? " he-input" : "")} style={isHe ? { paddingLeft: 52 } : undefined} />
        )}
        {isHe && (
          <button
            type="button"
            className={"btn sm icon " + (kb ? "soft" : "ghost")}
            style={{ position: "absolute", left: 8, top: multiline ? 8 : big ? 12 : 8 }}
            title="Экранная клавиатура"
            onClick={() => setKb(!kb)}
            tabIndex={-1}
          >
            <Keyboard size={17} />
          </button>
        )}
      </div>
      {isHe && kb && (
        <div className="keyboard card soft" style={{ padding: 10 }}>
          {HE_KEYBOARD_ROWS.map((row, i) => (
            <div className="krow" key={i}>
              {row.map((ch) => (
                <button type="button" key={ch} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(ch)}>
                  {ch}
                </button>
              ))}
            </div>
          ))}
          <div className="krow">
            <button type="button" className="wide" onMouseDown={(e) => e.preventDefault()} onClick={backspace}>
              ⌫
            </button>
            <button type="button" className="wide" style={{ maxWidth: 200 }} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(" ")}>
              пробел
            </button>
            {onEnter && (
              <button type="button" className="wide" onMouseDown={(e) => e.preventDefault()} onClick={onEnter}>
                ввод
              </button>
            )}
          </div>
        </div>
      )}
      {mapOn && !kb && hint && <span className="kbd-hint">Можно печатать в любой раскладке — буквы станут ивритскими (как на израильской клавиатуре).</span>}
    </div>
  );
});

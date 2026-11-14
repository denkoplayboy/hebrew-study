import { Link } from "react-router-dom";
import { Plus, ArrowRight, X } from "lucide-react";
import type { RelatedSuggestion } from "../../../shared/types";
import { posLabel } from "../../../shared/lang";
import { useApp } from "../lib/app";
import { He, Mixed, SpeakBtn } from "./ui";

/** Список слов, которые стоит посадить: кнопка «Посадить» открывает разбор этого слова. */
export function SuggestionList({
  items,
  onPlant,
  onDismiss,
  compact,
}: {
  items: RelatedSuggestion[];
  onPlant?: (s: RelatedSuggestion) => void;
  onDismiss?: (s: RelatedSuggestion) => void;
  compact?: boolean;
}) {
  const { openOmni } = useApp();
  return (
    <div className="col gap-6">
      {items.map((s) => (
        <div key={s.he} className="row top" style={{ padding: compact ? "4px 0" : "8px 2px" }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row wrap gap-6">
              <He text={s.he_nikud || s.he} nikud style={{ fontSize: compact ? "1.25rem" : "1.4rem" }} />
              <span className="text-2">{s.ru}</span>
              {!compact && <span className="tiny muted">{posLabel(s.pos)}</span>}
            </div>
            {s.relation && (
              <div className="small muted">
                <Mixed text={s.relation} />
              </div>
            )}
          </div>
          {!compact && <SpeakBtn text={s.he_nikud || s.he} lang="he" />}
          {s.existing_id ? (
            <Link to={`/words/${s.existing_id}`} className="btn sm soft">
              уже в саду <ArrowRight size={14} />
            </Link>
          ) : (
            <button
              className="btn sm primary"
              onClick={() => {
                onPlant?.(s);
                openOmni(s.he, true);
              }}
            >
              <Plus size={14} /> Посадить
            </button>
          )}
          {onDismiss && !s.existing_id && (
            <button className="btn sm ghost icon" title="Не нужно" onClick={() => onDismiss(s)}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Плавающая плашка после добавления слова: «Хотите также добавить…». */
export function RelatedPlaque() {
  const { related, offerRelated } = useApp();
  if (!related || !related.items.length) return null;
  const remove = (s: RelatedSuggestion) => {
    const rest = related.items.filter((x) => x.he !== s.he);
    offerRelated(rest.length ? { ...related, items: rest } : null);
  };
  return (
    <div className="plaque">
      <div className="row between top">
        <div>
          <div style={{ fontWeight: 500 }}>Посадить рядом?</div>
          <div className="small muted">
            Вместе с <Mixed text={related.source} /> стоит выучить:
          </div>
        </div>
        <button className="btn ghost icon sm" onClick={() => offerRelated(null)} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>
      <SuggestionList items={related.items.slice(0, 4)} compact onPlant={remove} onDismiss={remove} />
    </div>
  );
}

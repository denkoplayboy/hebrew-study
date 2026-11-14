import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useData } from "../lib/app";
import type { RelatedSuggestion } from "../../../shared/types";
import { Loading, Mixed } from "../components/ui";
import { SuggestionList } from "../components/Suggestions";

interface OfferData {
  id: number;
  kind: "theme" | "root";
  title: string;
  intro: string;
  topic: string;
  items: RelatedSuggestion[];
}

/** Результат пакета семян или лупы корня: можно сажать слова по одному. */
export default function Offer() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data } = useData<OfferData>(`/api/offers/${id}`, [id]);
  if (!data)
    return (
      <div className="page narrow">
        <Loading h={300} />
      </div>
    );
  const planted = data.items.filter((i) => i.existing_id).length;
  return (
    <div className="page narrow">
      <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => nav(-1)}>
        <ArrowLeft size={16} /> Назад
      </button>
      <div className="page-head">
        <div>
          <h1>
            <Mixed text={data.title} />
          </h1>
          <p>
            <Mixed text={data.intro} />
          </p>
        </div>
        <span className="badge accent">
          в саду {planted} из {data.items.length}
        </span>
      </div>
      <div className="card">
        <SuggestionList items={data.items} />
      </div>
      <p className="small muted mt-16">
        «Посадить» запускает обычный разбор слова: проверишь карточку и сохранишь. Подборка остаётся здесь — можно возвращаться и сажать постепенно.
      </p>
    </div>
  );
}

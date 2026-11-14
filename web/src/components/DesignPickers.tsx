import { Check, Lock } from "lucide-react";
import { ACCENTS, HE_FONTS, PLANT_STYLES } from "../../../shared/board";
import { useApp, applyHeFont } from "../lib/app";
import { Plant } from "./ui";

/** Выбор шрифта иврита, цветовой темы и вида сада — открываются зданиями на игровом поле. */
export function DesignPickers({ only }: { only?: "fonts" | "accents" | "plants" }) {
  const { settings, updateSettings, perks, toast } = useApp();
  const set = (patch: Record<string, string>) => updateSettings(patch).catch((e) => toast((e as Error).message, true));
  return (
    <div className="col gap-16">
      {(!only || only === "fonts") && (
        <div>
          <div className="label">Шрифт иврита · Типография (Яффо)</div>
          <div className="grid grid-3 stack-sm" style={{ gap: 8 }}>
            {HE_FONTS.map((f) => {
              const open = perks.fonts.includes(f.id);
              const on = settings.heFont === f.id;
              return (
                <button
                  key={f.id}
                  className={"option" + (on ? " correct" : "")}
                  style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, minHeight: 70, opacity: open ? 1 : 0.5 }}
                  disabled={!open}
                  onMouseEnter={() => open && applyHeFont(f.id)}
                  onMouseLeave={() => applyHeFont(settings.heFont)}
                  onClick={() => set({ heFont: f.id })}
                >
                  <span style={{ fontFamily: `"${f.family}", var(--font-he)`, fontSize: "1.5rem", direction: "rtl" }}>שָׁלוֹם</span>
                  <span className="tiny muted row gap-4">
                    {on ? <Check size={11} /> : !open ? <Lock size={11} /> : null} {f.name}
                    {!open && ` · ур. ${f.level}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {(!only || only === "accents") && (
        <div>
          <div className="label">Цвет сада · Галерея (Ротшильд)</div>
          <div className="chips">
            {ACCENTS.map((a) => {
              const open = perks.accents.includes(a.id);
              return (
                <button key={a.id} className={"chip" + (settings.accent === a.id ? " on" : "")} disabled={!open} style={{ opacity: open ? 1 : 0.5 }} onClick={() => set({ accent: a.id })}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: a.light, display: "inline-block" }} />
                  {a.name}
                  {!open && (
                    <>
                      <Lock size={11} /> ур. {a.level}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {(!only || only === "plants") && (
        <div>
          <div className="label">Вид сада · Оранжерея (Мицпе-Рамон)</div>
          <div className="grid grid-2" style={{ gap: 8 }}>
            {PLANT_STYLES.map((s) => {
              const open = perks.plants.includes(s.id);
              const on = settings.plantStyle === s.id;
              return (
                <button key={s.id} className={"option" + (on ? " correct" : "")} disabled={!open} style={{ opacity: open ? 1 : 0.5, justifyContent: "flex-start", gap: 6 }} onClick={() => set({ plantStyle: s.id })}>
                  <span className="row gap-4">
                    {[3, 4, 5].map((st) => (
                      <Plant key={st} stage={st} size={30} style={s.id} />
                    ))}
                  </span>
                  <span className="small">
                    {s.name}
                    {!open && ` · ур. ${s.level}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

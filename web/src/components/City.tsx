import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { plural } from "../lib/app";

/* Изометрический макет «Шореша». Всё рисуется из живых данных:
   дом в квартале «Сад» — слово (или группа слов), высота — стадия, горящее окно — слово хочет пить;
   здания Шука — купленные постройки по уровням; Кармель светится, когда открыто кафе. */

const C = 0.866;
const T = 20; // пикселей viewBox на единицу сетки
const OX = 12 * C * T + 12;
const OY = 74;
const W = Math.round(24 * C * T + 24);
const H = Math.round(OY + 12 * T + 64);

type P = [number, number];
const pt = (x: number, y: number, z: number): P => [OX + (x - y) * C * T, OY + (x + y) * 0.5 * T - z * T];
const poly = (ps: P[]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

// камень макета не зависит от темы: это предмет под светом
const STONE = { top: "#ece7dc", left: "#d2cabb", right: "#b3aa99", line: "rgba(40,34,26,.18)" };
const PLINTH = { top: "#dcd5c7", left: "#bfb6a5", right: "#9f9583" };
const WIN_OFF = "#6d665a";
const WIN_ON = "#f3c24f";

interface BoxProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  roof?: string;
  faces?: { top: string; left: string; right: string };
  windows?: { floors: number; lit: number };
  cls?: string;
  delay?: number;
}

function Box({ x, y, z = 0, w, d, h, roof, faces = STONE, windows, cls, delay }: BoxProps) {
  const zt = z + h;
  const top = [pt(x, y, zt), pt(x + w, y, zt), pt(x + w, y + d, zt), pt(x, y + d, zt)];
  // грань +x (справа, в тени) и грань +y (слева, на свету)
  const right = [pt(x + w, y, zt), pt(x + w, y + d, zt), pt(x + w, y + d, z), pt(x + w, y, z)];
  const left = [pt(x, y + d, zt), pt(x + w, y + d, zt), pt(x + w, y + d, z), pt(x, y + d, z)];
  const wins: ReactNode[] = [];
  if (windows && windows.floors > 0) {
    const fh = h / windows.floors;
    let litLeft = windows.lit;
    for (let f = 0; f < windows.floors; f++) {
      const zz = z + f * fh + fh * 0.35;
      const wh = Math.min(0.32, fh * 0.42);
      // по одному-два окна на каждой видимой грани
      const nL = Math.max(1, Math.floor(w / 0.7));
      for (let k = 0; k < nL; k++) {
        const x0 = x + (w / nL) * (k + 0.3);
        const x1 = x0 + (w / nL) * 0.4;
        const on = litLeft > 0;
        if (on) litLeft--;
        wins.push(
          <polygon
            key={`l${f}-${k}`}
            className={on ? "lit" : undefined}
            points={poly([pt(x0, y + d, zz + wh), pt(x1, y + d, zz + wh), pt(x1, y + d, zz), pt(x0, y + d, zz)])}
            fill={on ? WIN_ON : WIN_OFF}
            style={on ? { animationDelay: `${(f * 7 + k * 3) % 11 * 0.27}s` } : undefined}
          />,
        );
      }
      const nR = Math.max(1, Math.floor(d / 0.7));
      for (let k = 0; k < nR; k++) {
        const y0 = y + (d / nR) * (k + 0.3);
        const y1 = y0 + (d / nR) * 0.4;
        wins.push(
          <polygon
            key={`r${f}-${k}`}
            points={poly([pt(x + w, y0, zz + wh), pt(x + w, y1, zz + wh), pt(x + w, y1, zz), pt(x + w, y0, zz)])}
            fill={WIN_OFF}
            opacity={0.8}
          />,
        );
      }
    }
  }
  return (
    <g className={cls} style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}>
      <polygon points={poly(left)} fill={faces.left} />
      <polygon points={poly(right)} fill={faces.right} />
      {wins}
      <polygon points={poly(top)} fill={roof || faces.top} stroke={STONE.line} strokeWidth={0.6} />
    </g>
  );
}

function Tree({ x, y, z, r = 0.32, color = "#5d7f3a" }: { x: number; y: number; z: number; r?: number; color?: string }) {
  const [bx, by] = pt(x, y, z);
  const [cx, cy] = pt(x, y, z + r * 2.1);
  return (
    <g>
      <line x1={bx} y1={by} x2={cx} y2={cy + r * T * 0.6} stroke="#6b5a44" strokeWidth={1.4} />
      <ellipse cx={cx} cy={cy} rx={r * T} ry={r * T * 0.92} fill={color} />
      <ellipse cx={cx - r * T * 0.3} cy={cy - r * T * 0.3} rx={r * T * 0.45} ry={r * T * 0.38} fill="#fff" opacity={0.16} />
    </g>
  );
}

function Label({ at, title, sub, accent, below, align = "center" }: { at: P; title: string; sub?: string; accent: string; below?: boolean; align?: "center" | "start" | "end" }) {
  const w = Math.max(title.length * 8.2, sub ? sub.length * 7.6 : 0) + 36;
  const h = sub ? 40 : 26;
  const raw = align === "start" ? at[0] : align === "end" ? at[0] - w : at[0] - w / 2;
  const x = Math.min(Math.max(raw, 4), W - w - 4);
  const y = below ? at[1] + 10 : at[1] - h - 8;
  const cx = x + 13;
  const cy = y + 13;
  return (
    <g className="q-label" pointerEvents="none">
      <line x1={at[0]} y1={at[1]} x2={Math.min(Math.max(at[0], x + 6), x + w - 6)} y2={below ? y : y + h} stroke="#f6f3ec" strokeOpacity={0.55} strokeWidth={1} />
      <circle cx={at[0]} cy={at[1]} r={2.4} fill="#f6f3ec" />
      <rect x={x + 2} y={y + 3} width={w} height={h} rx={5} fill="#000" opacity={0.35} />
      <rect x={x} y={y} width={w} height={h} rx={5} fill="#f6f3ec" />
      {/* кубик квартала */}
      <polygon points={`${cx},${cy - 6} ${cx + 6},${cy - 3} ${cx},${cy} ${cx - 6},${cy - 3}`} fill={accent} />
      <polygon points={`${cx - 6},${cy - 3} ${cx},${cy} ${cx},${cy + 6} ${cx - 6},${cy + 3}`} fill="#d2cabb" />
      <polygon points={`${cx + 6},${cy - 3} ${cx},${cy} ${cx},${cy + 6} ${cx + 6},${cy + 3}`} fill="#a79e8d" />
      <text x={x + 25} y={y + 17} fontSize={14} fontWeight={600} fill="#1b2023" fontFamily="var(--font)">
        {title}
      </text>
      {sub && (
        <text x={x + 25} y={y + 32} fontSize={13} fill="#3e474b" fontFamily="var(--font)" style={{ fontVariant: "all-small-caps", letterSpacing: "0.06em" }}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Quarter({ to, label, children, off }: { to: string; label: string; children: ReactNode; off?: boolean }) {
  const nav = useNavigate();
  const go = () => nav(to, { viewTransition: true });
  if (off) return <g>{children}</g>;
  return (
    <g
      className="q-link"
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={go}
      onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go())}
    >
      {children}
    </g>
  );
}

const STAGE_H = [0.14, 0.45, 0.8, 1.2, 1.65, 2.15];

export interface CityData {
  stages: number[]; // 6 стадий
  total: number;
  thirsty: number;
  due: number;
  newRoom: number;
  shuk: number[]; // уровни 10 построек (0 — пустой участок)
  carmel: boolean;
  dew: number;
}

export type QuarterId = "garden" | "archive" | "ulpan" | "shuk" | "carmel";
const BOUNDS: Record<QuarterId, [number, number, number, number, number]> = {
  // x0, y0, x1, y1, высота
  garden: [0, 0, 6.2, 6.2, 2.7],
  archive: [7, 0, 12, 4.3, 2],
  ulpan: [7, 5, 12, 7.6, 2.1],
  shuk: [0, 7, 6.2, 12, 2],
  carmel: [7, 8.4, 12, 12, 2.3],
};

function focusBox(q: QuarterId) {
  const [x0, y0, x1, y1, zt] = BOUNDS[q];
  const pad = 8;
  const left = pt(x0, y1, 0)[0] - pad;
  const right = pt(x1, y0, 0)[0] + pad;
  const top = pt(x0, y0, zt)[1] - pad;
  const bottom = pt(x1, y1, 0)[1] + pad;
  return `${left.toFixed(0)} ${top.toFixed(0)} ${(right - left).toFixed(0)} ${(bottom - top).toFixed(0)}`;
}

export function CityModel({ data, reduced, focus }: { data: CityData; reduced?: boolean; focus?: QuarterId }) {
  const { stages, total, thirsty } = data;
  const show = (q: QuarterId) => !focus || focus === q;

  // дома сада: до 36, каждый — слово или группа слов
  const houses = useMemo(() => {
    const all: number[] = [];
    for (let s = 5; s >= 0; s--) for (let i = 0; i < (stages[s] || 0); i++) all.push(s);
    const n = Math.min(36, all.length);
    const per = all.length > 36 ? all.length / 36 : 1;
    const picked = Array.from({ length: n }, (_, i) => all[Math.floor(i * per)]);
    // жаждущие дома — равномерно по саду
    const thirstyHouses = Math.min(n, Math.round(thirsty / per));
    const step = thirstyHouses ? n / thirstyHouses : 0;
    const lit = new Set(Array.from({ length: thirstyHouses }, (_, i) => Math.floor(i * step + step / 2)));
    // раскладываем «спиралью» от центра, чтобы высокие стояли в середине квартала
    const slots: [number, number][] = [];
    for (let gx = 0; gx < 6; gx++) for (let gy = 0; gy < 6; gy++) slots.push([gx, gy]);
    slots.sort((a, b) => Math.hypot(a[0] - 2.5, a[1] - 2.5) - Math.hypot(b[0] - 2.5, b[1] - 2.5) || a[0] + a[1] - (b[0] + b[1]));
    return { list: picked.map((s, i) => ({ s, slot: slots[i], lit: lit.has(i) })), per };
  }, [stages, thirsty]);

  const roofGarden = "var(--accent, #557a2c)";
  const ochre = "#c7861f";
  const patina = "#2f8a80";
  const lapis = "#4767ad";
  const copper = "#b9574a";

  // порядок отрисовки: дальние (меньше x+y) раньше
  const gardenHouses = [...houses.list].sort((a, b) => a.slot[0] + a.slot[1] - (b.slot[0] + b.slot[1]));
  const per = houses.per;

  const ulpanLit = Math.min(12, data.due);
  const shukBuilt = data.shuk.filter((l) => l > 0).length;
  const archiveFloors = Math.max(1, Math.min(4, Math.ceil(total / 40)));

  return (
    <svg
      viewBox={focus ? focusBox(focus) : `0 0 ${W} ${H}`}
      role="img"
      aria-label={focus ? "Квартал на макете города" : `Макет сада: ${total} ${plural(total, "слово", "слова", "слов")}, ${thirsty} хотят пить`}
    >
      {/* общий стол-основание */}
      {!focus && <Box x={-0.3} y={-0.3} w={12.6} d={12.6} h={0.3} z={-0.3} faces={{ top: "#2c3337", left: "#22282b", right: "#191d20" }} />}

      {/* Архив (Словарь, корни) — дальний правый квартал */}
      {show("archive") && (
      <Quarter off={!!focus} to="/words" label="Словарь">
        <Box x={7} y={0} w={5} d={4.3} h={0.35} faces={PLINTH} />
        {[0, 1, 2, 3].map((r) => (
          <Box key={r} x={7.45} y={0.35 + r * 0.98} w={4.1} d={0.62} h={0.35 + archiveFloors * 0.32 + (r % 2) * 0.18} z={0.35} roof={lapis} windows={{ floors: archiveFloors, lit: 0 }} cls={reduced ? undefined : "rise"} delay={200 + r * 60} />
        ))}
      </Quarter>
      )}

      {/* Сад — слова как дома */}
      {show("garden") && (
      <Quarter off={!!focus} to="/words" label={`Сад: ${total} слов`}>
        <Box x={0} y={0} w={6.2} d={6.2} h={0.4} faces={PLINTH} />
        <Box x={0.15} y={0.15} w={5.9} d={5.9} h={0.04} z={0.4} faces={{ top: "#9fb27c", left: "#8a9c69", right: "#77885a" }} />
        {gardenHouses.map((hh, i) => {
          const [gx, gy] = hh.slot;
          const h = STAGE_H[hh.s];
          return (
            <Box
              key={`${gx}-${gy}`}
              x={0.42 + gx * 0.95}
              y={0.42 + gy * 0.95}
              w={0.62}
              d={0.62}
              h={h}
              z={0.44}
              roof={hh.s >= 5 ? "#d9a63a" : hh.s === 0 ? "#8b7356" : roofGarden}
              windows={hh.s >= 1 ? { floors: Math.max(1, Math.round(h / 0.45)), lit: hh.lit ? 1 : 0 } : undefined}
              cls={reduced ? undefined : "rise"}
              delay={i * 22}
            />
          );
        })}
        {total === 0 && <Tree x={3.1} y={3.1} z={0.44} r={0.4} />}
      </Quarter>
      )}

      {/* Ульпан (Практика) */}
      {show("ulpan") && (
      <Quarter off={!!focus} to="/practice" label="Практика">
        <Box x={7} y={5} w={5} d={2.6} h={0.35} faces={PLINTH} />
        <Box x={7.4} y={5.4} w={2.6} d={1.8} h={1.5} z={0.35} roof={patina} windows={{ floors: 3, lit: Math.ceil(ulpanLit / 3) }} cls={reduced ? undefined : "rise"} delay={260} />
        <Box x={10.3} y={5.5} w={1.3} d={1.6} h={0.9} z={0.35} roof={patina} windows={{ floors: 2, lit: ulpanLit > 6 ? 1 : 0 }} cls={reduced ? undefined : "rise"} delay={320} />
      </Quarter>
      )}

      {/* Шук — постройки игры */}
      {show("shuk") && (
      <Quarter off={!!focus} to="/shop" label="Лавка «Шук»">
        <Box x={0} y={7} w={6.2} d={5} h={0.35} faces={PLINTH} />
        {data.shuk.slice(0, 10).map((lvl, i) => {
          const gx = i % 5;
          const gy = Math.floor(i / 5);
          const x = 0.35 + gx * 1.17;
          const y = 7.5 + gy * 2.1;
          return lvl > 0 ? (
            <Box key={i} x={x} y={y} w={0.85} d={1.5} h={0.4 + lvl * 0.45} z={0.35} roof={ochre} windows={{ floors: lvl, lit: lvl >= 2 ? 1 : 0 }} cls={reduced ? undefined : "rise"} delay={380 + i * 30} />
          ) : (
            <Box key={i} x={x} y={y} w={0.85} d={1.5} h={0.05} z={0.35} faces={{ top: "#c9c0ae", left: "#b0a794", right: "#958c79" }} />
          );
        })}
      </Quarter>
      )}

      {/* Кармель — холм с кафе */}
      {show("carmel") && (
      <Quarter off={!!focus} to={data.carmel ? "/carmel" : "/shop"} label="Кармель">
        <Box x={7} y={8.4} w={5} d={3.6} h={0.55} faces={PLINTH} />
        <Box x={7.6} y={9.1} w={3.6} d={2.6} h={0.5} z={0.55} faces={{ top: "#a9b48c", left: "#929d77", right: "#7a8463" }} />
        <Box x={8.5} y={9.6} w={1.9} d={1.4} h={0.95} z={1.05} roof={copper} windows={{ floors: 2, lit: data.carmel ? 2 : 0 }} cls={reduced ? undefined : "rise"} delay={460} />
        <Tree x={8.0} y={11.3} z={1.05} />
        <Tree x={11.0} y={9.5} z={1.05} r={0.28} />
      </Quarter>
      )}

      {/* деревья вдоль улиц */}
      {!focus && (
        <>
      <Tree x={6.6} y={0.6} z={0} r={0.26} />
      <Tree x={6.6} y={3.2} z={0} r={0.26} />
      <Tree x={6.6} y={6.6} z={0} r={0.3} />
      <Tree x={3.6} y={6.6} z={0} r={0.26} />
        </>
      )}

      {/* таблички кварталов */}
      {!focus && (
        <>
      <Label at={pt(0, 0, 0.4)} title="Сад" sub={thirsty ? `${thirsty} ${plural(thirsty, "хочет", "хотят", "хотят")} пить` : `${total} ${plural(total, "слово", "слова", "слов")}`} accent={roofGarden} />
      <Label at={pt(12, 0, 0.35)} title="Словарь" accent={lapis} align="end" />
      <Label at={pt(12, 6.3, 0.35)} below align="start" title="Ульпан" sub={data.due ? `${data.due} ${plural(data.due, "навык", "навыка", "навыков")}` : "всё полито"} accent={patina} />
      <Label at={pt(0, 12, 0.35)} title="Шук" sub={shukBuilt ? `${shukBuilt} ${plural(shukBuilt, "здание", "здания", "зданий")}` : "участки свободны"} accent={ochre} align="start" />
      <Label at={pt(12, 12, 0)} title="Кармель" sub={data.carmel ? "кафе открыто" : "кафе ещё не построено"} accent={copper} below />
        </>
      )}
      {!focus && per > 1 && (
        <text x={W - 10} y={H - 8} textAnchor="end" fontSize={11} fill="#b3bcbf" fontFamily="var(--font)">
          дом ≈ {Math.round(per)} {plural(Math.round(per), "слово", "слова", "слов")}
        </text>
      )}
    </svg>
  );
}

/** Цоколь квартала: маленький каменный блок с крышей цвета квартала. */
export function QuarterMark({ color = "var(--accent)", size = 22 }: { color?: string; size?: number }) {
  return (
    <svg className="qmark" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <polygon points="12,2 21,6.5 12,11 3,6.5" fill={color} />
      <polygon points="3,6.5 12,11 12,22 3,17.5" fill="#d2cabb" />
      <polygon points="21,6.5 12,11 12,22 21,17.5" fill="#a79e8d" />
    </svg>
  );
}

/** Ряд урока: каждое упражнение — блок; олива — верно, кирпич — ошибка, золото — сейчас. */
export function Course({ total, results, idx }: { total: number; results: (boolean | undefined)[]; idx: number }) {
  const n = Math.min(total, 60);
  return (
    <div className="course" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(idx, total)} aria-label="Ход урока">
      {Array.from({ length: n }, (_, i) => {
        const r = results[i];
        const cls = i === idx ? "now" : r === true ? "ok" : r === false ? "bad" : "";
        return <i key={i} className={cls} />;
      })}
    </div>
  );
}

/** Шапка раздела: название слева, справа — его квартал с макета. */
export function QuarterHead({ title, sub, quarter, color, data, actions }: { title: ReactNode; sub?: ReactNode; quarter: QuarterId; color: string; data?: Partial<CityData>; actions?: ReactNode }) {
  const full: CityData = { stages: [0, 0, 0, 0, 0, 0], total: 0, thirsty: 0, due: 0, newRoom: 0, shuk: [], carmel: false, dew: 0, ...data };
  return (
    <section className="qhead" style={{ ["--qc" as string]: color }}>
      <div className="qhead-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
        {actions && <div className="qhead-actions">{actions}</div>}
      </div>
      <div className="qhead-scene" aria-hidden>
        <CityModel data={full} focus={quarter} reduced />
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";

/* Солнце над Иерусалимом: высота и азимут по упрощённым формулам NOAA.
   От них зависят свет макета, тени домов, шейдер музейного луча и стол «Шука». */

const LAT = 31.778;
const LON = 35.235;
const rad = Math.PI / 180;

export type Phase = "night" | "twilight" | "golden" | "day";

export interface Daylight {
  /** высота солнца над горизонтом, градусы */
  el: number;
  /** азимут от севера по часовой, градусы */
  az: number;
  phase: Phase;
  /** 0 — ночь, 1 — полдень */
  sun: number;
  /** цвет света (sRGB 0..1) */
  color: [number, number, number];
  /** время в Иерусалиме, «17:40» */
  clock: string;
  label: string;
}

function solar(date: Date) {
  const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hours * 60 + eqTime + 4 * LON; // истинное солнечное время, минуты
  const ha = (tst / 4 - 180) * rad;
  const lat = LAT * rad;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZ)));
  const el = 90 - zen / rad;
  let az = Math.acos(Math.min(1, Math.max(-1, (Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen))))) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { el, az };
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t))) as [number, number, number];

export function daylightAt(date: Date): Daylight {
  const { el, az } = solar(date);
  const phase: Phase = el < -6 ? "night" : el < 4 ? "twilight" : el < 16 ? "golden" : "day";
  const sun = Math.max(0, Math.min(1, (el + 6) / 50));
  const noon: [number, number, number] = [1, 0.97, 0.9];
  const gold: [number, number, number] = [1, 0.74, 0.45];
  const dusk: [number, number, number] = [0.86, 0.52, 0.5];
  const moon: [number, number, number] = [0.55, 0.66, 0.92];
  const color = el < -6 ? moon : el < 4 ? mix(dusk, gold, (el + 6) / 10) : el < 16 ? mix(gold, noon, (el - 4) / 12) : noon;
  const clock = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(date);
  const label =
    phase === "night" ? "ночь" : phase === "twilight" ? (az < 180 ? "рассвет" : "сумерки") : el < 25 && az < 160 ? "утро" : el < 25 && az > 200 ? "вечер" : "день";
  return { el, az, phase, sun, color, clock, label };
}

/** Можно проверить любое время: ?hour=19.5 (часы по Иерусалиму). */
function now(): Date {
  try {
    const h = new URLSearchParams(location.search).get("hour");
    if (h !== null && !Number.isNaN(Number(h))) {
      const d = new Date();
      const jer = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      const offset = d.getTime() - jer.getTime();
      jer.setHours(Math.floor(Number(h)), Math.round((Number(h) % 1) * 60), 0, 0);
      return new Date(jer.getTime() + offset);
    }
  } catch {
    /* без параметра */
  }
  return new Date();
}

export function useDaylight(): Daylight {
  const [d, setD] = useState(() => daylightAt(now()));
  useEffect(() => {
    const t = window.setInterval(() => setD(daylightAt(now())), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return d;
}

/** Освещённость граней по закону Ламберта. Сетка макета: +x смотрит на восток, +y — на юг. */
export function faceLight(d: Daylight) {
  const s = Math.max(0, Math.sin(d.el * rad));
  const c = Math.cos(Math.max(0, d.el) * rad);
  const east = Math.sin(d.az * rad);
  const south = -Math.cos(d.az * rad);
  const amb = d.phase === "night" ? 0.32 : d.phase === "twilight" ? 0.5 : 0.6;
  const k = d.phase === "night" ? 0 : 1;
  return {
    top: Math.min(1, amb + k * 0.55 * s + (d.phase === "golden" ? 0.12 : 0)),
    right: Math.min(1, amb + k * 0.5 * Math.max(0, east) * c),
    left: Math.min(1, amb + k * 0.5 * Math.max(0, south) * c),
    /** смещение тени на единицу высоты, в клетках сетки */
    shadow: d.el > 2 ? { dx: -east / Math.tan(d.el * rad), dy: -south / Math.tan(d.el * rad) } : null,
  };
}

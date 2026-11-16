/* Заменители node:fs и node:crypto для серверного кода внутри приложения.
   fs — только чтение встроенной папки content/ (наборы и стартовые слова), запись — никуда.
   crypto — случайные числа для игры и хэши. */

import { sha256 } from "js-sha256";

// ───────── fs: content/ встроена в сборку ─────────
const files = import.meta.glob("../../../content/**/*.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const VFS = new Map<string, string>();
for (const [k, v] of Object.entries(files)) VFS.set("/content/" + k.split("/content/")[1], v);

const norm = (p: string) => ("/" + String(p).replace(/^\.?\/*/, "")).replace(/\/+$/, "") || "/";

function readFileSync(p: string): string {
  const v = VFS.get(norm(p));
  if (v === undefined) throw new Error(`Нет файла ${p}`);
  return v;
}
function existsSync(p: string): boolean {
  const n = norm(p);
  if (VFS.has(n)) return true;
  for (const k of VFS.keys()) if (k.startsWith(n + "/")) return true;
  return false;
}
function readdirSync(p: string): string[] {
  const n = norm(p) + "/";
  const out = new Set<string>();
  for (const k of VFS.keys()) if (k.startsWith(n)) out.add(k.slice(n.length).split("/")[0]);
  return [...out];
}
function mkdirSync() {
  /* в приложении база живёт в памяти и на диске телефона */
}
function copyFileSync(src: string) {
  // перед импортом резервной копии сервер копирует базу — сохраняем снимок рядом
  const h = (globalThis as unknown as { __shoresh?: { instance?: { export(): Uint8Array }; backup(b: Uint8Array): void } }).__shoresh;
  if (h?.instance && String(src).endsWith(".db")) h.backup(h.instance.export());
}
function writeFileSync() {
  /* серверу писать в файлы в приложении нечего */
}

export const fs = { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync };

// ───────── crypto ─────────
function randomInt(a: number, b?: number): number {
  const [min, max] = b === undefined ? [0, a] : [a, b];
  const range = max - min;
  if (range <= 0) return min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / range) * range;
  do globalThis.crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return min + (buf[0] % range);
}

function bytes(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  return new TextEncoder().encode(String(x));
}
function timingSafeEqual(a: unknown, b: unknown): boolean {
  const x = bytes(a);
  const y = bytes(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function createHash() {
  const h = sha256.create();
  const api = {
    update(s: string) {
      h.update(s);
      return api;
    },
    digest: () => h.hex(),
  };
  return api;
}
function createHmac(_alg: string, key: string) {
  const h = sha256.hmac.create(key);
  const api = {
    update(s: string) {
      h.update(s);
      return api;
    },
    digest: () => h.hex(),
  };
  return api;
}
function randomUUID() {
  return globalThis.crypto.randomUUID();
}

export const crypto = { randomInt, timingSafeEqual, createHash, createHmac, randomUUID };

import { getLocal } from "./local-client";

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" };
  const local = getLocal();
  // в приложении запрос не уходит в сеть: его обрабатывают те же маршруты прямо на телефоне
  const res = local ? await (await local).fetch(new Request("http://shoresh.local" + url, init)) : await fetch(url, init);
  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && data?.error === "auth") {
    onUnauthorized?.();
  }
  if (!res.ok) throw new ApiError((data && data.error) || `Ошибка ${res.status}`, res.status, data);
  return data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T,>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T,>(url: string) => request<T>("DELETE", url),
};

import { secure } from "./storage";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const API_URL = `${BASE_URL}/api/v1`;

const ACCESS_KEY = "cyc.access";
const REFRESH_KEY = "cyc.refresh";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    /** Anything else the server sent in `detail` (e.g. a suspension reason). */
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Tokens = { access_token: string; refresh_token: string };

let access: string | null = null;
let refresh: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

/** Called when the session can't be refreshed, so the app can show sign in. */
export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler;
}

export async function loadTokens(): Promise<boolean> {
  access = await secure.get(ACCESS_KEY);
  refresh = await secure.get(REFRESH_KEY);
  return Boolean(access && refresh);
}

export async function saveTokens(tokens: Tokens) {
  access = tokens.access_token;
  refresh = tokens.refresh_token;
  await secure.set(ACCESS_KEY, tokens.access_token);
  await secure.set(REFRESH_KEY, tokens.refresh_token);
}

export async function clearTokens() {
  access = null;
  refresh = null;
  await secure.remove(ACCESS_KEY);
  await secure.remove(REFRESH_KEY);
}

export const currentRefreshToken = () => refresh;

function messageFrom(status: number, data: unknown): { message: string; code: string; extra?: Record<string, unknown> } {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { message?: string; code?: string };
    return { message: d.message ?? "Something went wrong.", code: d.code ?? "error", extra: detail as Record<string, unknown> };
  }
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; loc?: string[] } | undefined;
    const field = first?.loc?.[first.loc.length - 1];
    const msg = first?.msg?.replace(/^Value error, /, "") ?? "Please check what you entered.";
    return { message: field && field !== "body" ? `${field.replace(/_/g, " ")}: ${msg}` : msg, code: "invalid_input" };
  }
  if (typeof detail === "string") return { message: detail, code: "error" };
  if (status === 0) return { message: "Can't reach CYC. Check your connection.", code: "network" };
  return { message: "Something went wrong. Please try again.", code: "error" };
}

async function doRefresh(): Promise<boolean> {
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return false;
        await saveTokens((await res.json()) as Tokens);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
};

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, query, auth = true } = options;
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${API_URL}${path}${qs ? `?${qs}` : ""}`;

  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && access) headers.Authorization = `Bearer ${access}`;
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  const hadToken = Boolean(access);
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && hadToken && (await doRefresh())) res = await send();
  } catch {
    const m = messageFrom(0, null);
    throw new ApiError(m.message, 0, m.code);
  }

  if (res.status === 401 && auth && hadToken) {
    await clearTokens();
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = messageFrom(res.status, data);
    throw new ApiError(m.message, res.status, m.code, m.extra);
  }
  return data as T;
}

/** True when the call failed because nobody is signed in (guest browsing). */
export const isAccountNeeded = (err: unknown) => err instanceof ApiError && err.status === 401 && !access;

export const errorText = (err: unknown) =>
  err instanceof Error ? err.message : "Something went wrong. Please try again.";

/** Follow `next_cursor` to load every page of a list (up to `max` items). */
export async function apiAll<T>(path: string, query: Options["query"] = {}, max = 500): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: T[]; next_cursor: string | null } = await api(path, { query: { ...query, limit: 50, cursor } });
    out.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor && out.length < max);
  return out;
}

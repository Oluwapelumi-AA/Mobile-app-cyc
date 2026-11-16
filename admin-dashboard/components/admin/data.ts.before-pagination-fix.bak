"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Navigation context                                                  */
/* ------------------------------------------------------------------ */

export type PageKey =
  | "overview"
  | "reports"
  | "users"
  | "communities"
  | "posts"
  | "events"
  | "live"
  | "resources"
  | "courses"
  | "branches"
  | "notifications"
  | "audit"
  | "settings";

export type AdminOverview = {
  users: number;
  active_users: number;
  inactive_users: number;
  new_users_last_7_days: number;
  communities: number;
  posts_last_7_days: number;
  open_reports: number;
  upcoming_events: number;
  branches: number;
};

export type AdminContextValue = {
  navigate: (page: PageKey) => void;
  overview: AdminOverview | null;
  globalSearch: string;
};

export const AdminContext = createContext<AdminContextValue>({
  navigate: () => {},
  overview: null,
  globalSearch: "",
});

export const useAdmin = () => useContext(AdminContext);

/* ------------------------------------------------------------------ */
/* Live data with sample fallback                                      */
/* ------------------------------------------------------------------ */

/**
 * Sample records are shown when the API is unreachable or returns nothing,
 * so the screens can be reviewed before the backend has data.
 * Set NEXT_PUBLIC_ADMIN_SAMPLE_DATA=false in production to show real empty states instead.
 */
export const SAMPLE_FALLBACK = process.env.NEXT_PUBLIC_ADMIN_SAMPLE_DATA !== "false";

export type DataMode = "loading" | "live" | "sample" | "empty";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function detailMessage(body: unknown, status: number) {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof (detail as { message?: unknown }).message === "string")
    return (detail as { message: string }).message;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "Your account does not have permission for this.";
  return `Request failed (${status}).`;
}

/** Call the dashboard's backend proxy. `path` is relative to /api/v1. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend/${path.replace(/^\//, "")}`, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(detailMessage(body, res.status), res.status);
  return body as T;
}

type PageShape<R> = { items: R[]; next_cursor?: string | null } | R[];

/**
 * Load a list endpoint, map it to view rows, and fall back to sample rows
 * when the API fails or is empty.
 */
type ListState<T> = {
  key: string;
  items: T[];
  mode: DataMode;
  error: string;
  nextCursor: string | null;
};

function fallbackState<T>(key: string, sample: T[], reason: string): ListState<T> {
  return SAMPLE_FALLBACK
    ? { key, items: sample, mode: "sample", error: reason, nextCursor: null }
    : { key, items: [], mode: "empty", error: reason, nextCursor: null };
}

const NO_ENDPOINT = "This section has no backend endpoint yet.";

export function useLiveList<R, T>(
  path: string | null,
  map: (row: R) => T,
  sample: T[],
): {
  items: T[];
  mode: DataMode;
  error: string;
  reload: () => void;
  setItems: (update: (items: T[]) => T[]) => void;
  nextCursor: string | null;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
} {
  const [tick, setTick] = useState(0);
  const key = `${path ?? "-"}#${tick}`;
  const [state, setState] = useState<ListState<T>>({ key: "", items: [], mode: "loading", error: "", nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);

  // Keep the latest mapper/sample without re-triggering the fetch.
  const mapRef = useRef(map);
  const sampleRef = useRef(sample);
  useEffect(() => {
    mapRef.current = map;
    sampleRef.current = sample;
  });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<PageShape<R>>(path)
      .then((body) => {
        if (cancelled) return;
        const rows = Array.isArray(body) ? body : body?.items ?? [];
        if (rows.length === 0) {
          setState(fallbackState(key, sampleRef.current, "The API returned no records yet."));
          return;
        }
        setState({
          key,
          items: rows.map((r) => mapRef.current(r)),
          mode: "live",
          error: "",
          nextCursor: Array.isArray(body) ? null : body?.next_cursor ?? null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(fallbackState(key, sampleRef.current, err instanceof Error ? err.message : "Could not load data."));
      });
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  // State for the current request, derived so nothing is set synchronously in an effect.
  const current: ListState<T> =
    state.key === key
      ? state
      : path
        ? { key, items: [], mode: "loading", error: "", nextCursor: null }
        : fallbackState(key, sample, NO_ENDPOINT);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const setItems = useCallback(
    (update: (items: T[]) => T[]) =>
      setState((prev) => {
        const base = prev.key === key ? prev : path ? prev : fallbackState(key, sampleRef.current, NO_ENDPOINT);
        return { ...base, key, items: update(base.items) };
      }),
    [key, path],
  );

  const loadMore = useCallback(async () => {
    if (!path || !current.nextCursor) return;
    setLoadingMore(true);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const body = await api<PageShape<R>>(`${path}${sep}cursor=${encodeURIComponent(current.nextCursor)}`);
      const rows = Array.isArray(body) ? body : body?.items ?? [];
      setState((prev) => ({
        ...prev,
        items: [...prev.items, ...rows.map((r) => mapRef.current(r))],
        nextCursor: Array.isArray(body) ? null : body?.next_cursor ?? null,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : "Could not load more." }));
    } finally {
      setLoadingMore(false);
    }
  }, [path, current.nextCursor]);

  return {
    items: current.items,
    mode: current.mode,
    error: current.error,
    reload,
    setItems,
    nextCursor: current.nextCursor,
    loadMore,
    loadingMore,
  };
}

/* ------------------------------------------------------------------ */
/* User directory: resolve actor / reporter IDs to names               */
/* ------------------------------------------------------------------ */

type DirectoryUser = { id: string; email: string; display_name: string | null; account_role: string };
export type Directory = Map<string, { name: string; role: string }>;

let directoryPromise: Promise<Directory> | null = null;

function loadDirectory(): Promise<Directory> {
  directoryPromise ??= api<{ items: DirectoryUser[] }>("admin/users?limit=100")
    .then((page) => {
      const map: Directory = new Map();
      for (const u of page.items ?? []) {
        const role = u.account_role === "user" ? "Member" : u.account_role === "admin" ? "Admin" : "Moderator";
        map.set(u.id, { name: u.display_name?.trim() || u.email.split("@")[0], role });
      }
      return map;
    })
    .catch(() => {
      directoryPromise = null;
      return new Map();
    });
  return directoryPromise;
}

/** Names for user IDs (first 100 accounts; cached for the session). */
export function useDirectory(enabled: boolean): Directory {
  const [dir, setDir] = useState<Directory>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadDirectory().then((d) => !cancelled && setDir(d));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return dir;
}

/** Simple case-insensitive text match across a row's fields. */
export function matches(query: string, ...fields: (string | number | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f !== null && f !== undefined && String(f).toLowerCase().includes(q));
}

/** Download rows as CSV (client-side export). */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

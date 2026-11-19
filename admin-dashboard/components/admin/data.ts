
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/* ------------------------------------------------------------------ */
/* Navigation context                                                  */
/* ------------------------------------------------------------------ */

export type PageKey =
  | "overview"
  | "reports"
  | "users"
  | "departments"
  | "posts"
  | "events"
  | "live"
  | "resources"
  | "courses"
  | "chapters"
  | "team"
  | "notifications"
  | "audit"
  | "settings"
  // Chapter staff workspace
  | "members"
  | "requests"
  | "announcements";

export type AdminOverview = {
  users: number;
  active_users: number;
  inactive_users: number;
  new_users_last_7_days: number;
  posts_last_7_days: number;
  open_reports: number;
  upcoming_events: number;
  // Active Chapters, official Members and Guests.
  chapters: number;
  members: number;
  guests: number;
};

/** The chapter a Coordinator is working in. */
export type ChapterScope = {
  id: string;
  name: string;
  role: "coordinator";
};

export type AdminContextValue = {
  navigate: (page: PageKey) => void;
  overview: AdminOverview | null;
  globalSearch: string;
  /** Set in the chapter staff workspace; null for platform admins. */
  scope: ChapterScope | null;
};

export const AdminContext = createContext<AdminContextValue>({
  navigate: () => {},
  overview: null,
  globalSearch: "",
  scope: null,
});

export const useAdmin = () => useContext(AdminContext);

/** Add `chapter_id=<scope>` to an API path when working inside a chapter. */
export function scopedPath(path: string, scope: ChapterScope | null) {
  if (!scope) return path;
  return `${path}${path.includes("?") ? "&" : "?"}chapter_id=${scope.id}`;
}

/* ------------------------------------------------------------------ */
/* API configuration                                                   */
/* ------------------------------------------------------------------ */

/**
 * Sample records are disabled by default.
 *
 * To explicitly enable sample data during UI development, set:
 * NEXT_PUBLIC_ADMIN_SAMPLE_DATA=true
 *
 * For integration testing and production, leave it unset or set it
 * to false so backend failures and empty responses are not hidden.
 */
export const SAMPLE_FALLBACK =
  process.env.NEXT_PUBLIC_ADMIN_SAMPLE_DATA === "true";

export type DataMode = "loading" | "live" | "sample" | "empty";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function detailMessage(body: unknown, status: number) {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (
    detail &&
    typeof (detail as { message?: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }

  // FastAPI validation errors: [{ loc: ["body", "title"], msg: "..." }, ...]
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = (first.loc ?? []).filter((part) => part !== "body").join(" › ").replace(/_/g, " ");
    const message = (first.msg ?? "Invalid value").replace(/^Value error, /, "");
    return field ? `${field}: ${message}` : message;
  }

  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (status === 403) {
    return "Your account does not have permission for this.";
  }

  return `Request failed (${status}).`;
}

/**
 * Call the dashboard backend proxy.
 * The supplied path is relative to /api/v1.
 */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.replace(/^\/+/, "");

  const res = await fetch(`/api/backend/${normalizedPath}`, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(detailMessage(body, res.status), res.status);
  }

  return body as T;
}

/* ------------------------------------------------------------------ */
/* Live list data                                                      */
/* ------------------------------------------------------------------ */

type PageShape<R> =
  | {
      items: R[];
      next_cursor?: string | null;
    }
  | R[];

type ListState<T> = {
  key: string;
  items: T[];
  mode: DataMode;
  error: string;
  nextCursor: string | null;
};

function fallbackState<T>(
  key: string,
  sample: T[],
  reason: string,
): ListState<T> {
  if (SAMPLE_FALLBACK) {
    return {
      key,
      items: sample,
      mode: "sample",
      error: reason,
      nextCursor: null,
    };
  }

  return {
    key,
    items: [],
    mode: "empty",
    error: reason,
    nextCursor: null,
  };
}

const NO_ENDPOINT = "This section has no backend endpoint yet.";

const EMPTY_RESPONSE = "The API returned no records yet.";

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

  const [state, setState] = useState<ListState<T>>({
    key: "",
    items: [],
    mode: "loading",
    error: "",
    nextCursor: null,
  });

  const [loadingMore, setLoadingMore] = useState(false);

  // Keep the latest mapper and sample records without triggering a fetch.
  const mapRef = useRef(map);
  const sampleRef = useRef(sample);

  useEffect(() => {
    mapRef.current = map;
    sampleRef.current = sample;
  });

  useEffect(() => {
    if (!path) {
      return;
    }

    let cancelled = false;

    api<PageShape<R>>(path)
      .then((body) => {
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(body) ? body : body?.items ?? [];

        if (rows.length === 0) {
          setState(
            fallbackState(
              key,
              sampleRef.current,
              EMPTY_RESPONSE,
            ),
          );
          return;
        }

        setState({
          key,
          items: rows.map((row) => mapRef.current(row)),
          mode: "live",
          error: "",
          nextCursor: Array.isArray(body)
            ? null
            : body?.next_cursor ?? null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setState(
          fallbackState(
            key,
            sampleRef.current,
            err instanceof Error
              ? err.message
              : "Could not load data.",
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [path, key]);

  // Derive the current request state without setting state synchronously.
  const current: ListState<T> =
    state.key === key
      ? state
      : path
        ? {
            key,
            items: [],
            mode: "loading",
            error: "",
            nextCursor: null,
          }
        : fallbackState(key, sample, NO_ENDPOINT);

  const reload = useCallback(() => {
    setTick((currentTick) => currentTick + 1);
  }, []);

  const setItems = useCallback(
    (update: (items: T[]) => T[]) => {
      setState((previous) => {
        const base =
          previous.key === key
            ? previous
            : path
              ? previous
              : fallbackState(
                  key,
                  sampleRef.current,
                  NO_ENDPOINT,
                );

        return {
          ...base,
          key,
          items: update(base.items),
        };
      });
    },
    [key, path],
  );

  const loadMore = useCallback(async () => {
    if (!path || !current.nextCursor || loadingMore) {
      return;
    }

    const requestKey = key;
    const cursor = current.nextCursor;

    setLoadingMore(true);

    try {
      const separator = path.includes("?") ? "&" : "?";

      const body = await api<PageShape<R>>(
        `${path}${separator}cursor=${encodeURIComponent(cursor)}`,
      );

      const rows = Array.isArray(body) ? body : body?.items ?? [];

      setState((previous) => {
        // Do not append results belonging to an older request.
        if (previous.key !== requestKey) {
          return previous;
        }

        return {
          ...previous,
          items: [
            ...previous.items,
            ...rows.map((row) => mapRef.current(row)),
          ],
          nextCursor: Array.isArray(body)
            ? null
            : body?.next_cursor ?? null,
        };
      });
    } catch (err) {
      setState((previous) => {
        if (previous.key !== requestKey) {
          return previous;
        }

        return {
          ...previous,
          error:
            err instanceof Error
              ? err.message
              : "Could not load more.",
        };
      });
    } finally {
      setLoadingMore(false);
    }
  }, [path, current.nextCursor, loadingMore, key]);

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

type DirectoryUser = {
  id: string;
  email: string;
  display_name: string | null;
  account_role: string;
};

export type Directory = Map<
  string,
  {
    name: string;
    role: string;
  }
>;

const directoryPromises = new Map<string, Promise<Directory>>();

function roleLabel(role: string) {
  return role === "user" ? "Member" : role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : role;
}

/** Platform admins read the user list; chapter staff read their chapter's members. */
function loadDirectory(chapterId: string | null): Promise<Directory> {
  const key = chapterId ?? "admin";
  let promise = directoryPromises.get(key);
  if (promise) return promise;

  promise = (
    chapterId
      ? api<{ user_id: string; email: string; display_name: string | null; staff_role: string | null }[]>(
          `chapters/${chapterId}/members`,
        ).then((rows) => {
          const directory: Directory = new Map();
          for (const m of rows ?? []) {
            directory.set(m.user_id, {
              name: m.display_name?.trim() || m.email.split("@")[0],
              role: m.staff_role ? titleCaseRole(m.staff_role) : "Member",
            });
          }
          return directory;
        })
      : api<{ items: DirectoryUser[] }>("admin/users?limit=50").then((page) => {
          const directory: Directory = new Map();
          for (const user of page.items ?? []) {
            directory.set(user.id, {
              name: user.display_name?.trim() || user.email.split("@")[0],
              role: roleLabel(user.account_role),
            });
          }
          return directory;
        })
  ).catch(() => {
    directoryPromises.delete(key);
    return new Map<string, { name: string; role: string }>();
  });

  directoryPromises.set(key, promise);
  return promise;
}

function titleCaseRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Names for user IDs.
 * The first 50 accounts are cached for the current session.
 */
export function useDirectory(enabled: boolean): Directory {
  const { scope } = useAdmin();
  const chapterId = scope?.id ?? null;
  const [directory, setDirectory] = useState<Directory>(
    () => new Map(),
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    void loadDirectory(chapterId).then((result) => {
      if (!cancelled) {
        setDirectory(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, chapterId]);

  return directory;
}

/* ------------------------------------------------------------------ */
/* Chapter directory: resolve chapter IDs to names                     */
/* ------------------------------------------------------------------ */

export type ChapterOption = {
  id: string;
  name: string;
  active: boolean;
  members: number;
};

let chapterPromise: Promise<ChapterOption[]> | null = null;

function loadChapters(): Promise<ChapterOption[]> {
  chapterPromise ??= api<
    { id: string; name: string; is_active: boolean; member_count: number }[]
  >("chapters?include_archived=true")
    // Only platform staff may list archived chapters; others get active ones.
    .catch(() => api<{ id: string; name: string; is_active: boolean; member_count: number }[]>("chapters"))
    .then((rows) =>
      (rows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        active: row.is_active,
        members: row.member_count,
      })),
    )
    .catch(() => {
      chapterPromise = null;
      return [];
    });

  return chapterPromise;
}

/** Forget cached chapters, e.g. after one is created or renamed. */
export function invalidateChapters() {
  chapterPromise = null;
}

/**
 * Every chapter (archived ones included), cached for the session.
 * `name(id)` gives a chapter's name, or "App-wide" for null.
 */
export function useChapters(): {
  chapters: ChapterOption[];
  name: (id: string | null | undefined) => string;
} {
  const [chapters, setChapters] = useState<ChapterOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    void loadChapters().then((result) => {
      if (!cancelled) {
        setChapters(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const name = useCallback(
    (id: string | null | undefined) => {
      if (!id) {
        return "App-wide";
      }

      return (
        chapters.find((chapter) => chapter.id === id)?.name ??
        `Chapter ${id.replace(/-/g, "").slice(-4).toUpperCase()}`
      );
    },
    [chapters],
  );

  return { chapters, name };
}

/* ------------------------------------------------------------------ */
/* Search utilities                                                    */
/* ------------------------------------------------------------------ */

/**
 * Simple case-insensitive text match across a row's fields.
 */
export function matches(
  query: string,
  ...fields: (string | number | null | undefined)[]
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return fields.some(
    (field) =>
      field !== null &&
      field !== undefined &&
      String(field).toLowerCase().includes(normalizedQuery),
  );
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/**
 * Download rows as CSV (client-side export).
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) {
    return;
  }

  const headers = Object.keys(rows[0]);

  const escapeValue = (value: unknown) => {
    const stringValue =
      value === null || value === undefined
        ? ""
        : String(value);

    return /[",\n]/.test(stringValue)
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeValue(row[header]))
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

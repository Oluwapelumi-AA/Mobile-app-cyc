const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

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

export async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.detail?.message ||
      body?.detail ||
      `Request failed with status ${response.status}`;

    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Unable to sign in. Check your credentials.",
    );
  }

  return body as {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
}

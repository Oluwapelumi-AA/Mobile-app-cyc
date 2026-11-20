import { NextResponse } from "next/server";

export const API_BASE = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1"
).replace(/\/+$/, "");

type AuthBody = {
  access_token?: string | null;
  refresh_token?: string | null;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string | null;
  recovery_codes?: string[];
  detail?: unknown;
};

/** The API's error message, whatever shape it came in. */
export function detailMessage(data: AuthBody | null, fallback: string): string {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof (detail as { message: unknown }).message === "string") {
    return (detail as { message: string }).message;
  }
  return fallback;
}

/** Forward an API sign-in answer to the browser. Tokens go into httpOnly
 * cookies and never reach page JavaScript; a two-step step passes on the
 * short-lived mfa_token, which can only be used to finish signing in. */
export function finishAuth(status: number, data: AuthBody | null, fallback: string): NextResponse {
  if (status < 200 || status >= 300) {
    const code = data?.detail && typeof data.detail === "object" ? (data.detail as { code?: string }).code : undefined;
    return NextResponse.json({ detail: detailMessage(data, fallback), code }, { status });
  }
  if (data?.mfa_required || data?.mfa_setup_required) {
    return NextResponse.json({
      mfa_required: Boolean(data.mfa_required),
      mfa_setup_required: Boolean(data.mfa_setup_required),
      mfa_token: data.mfa_token,
    });
  }
  if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string") {
    return NextResponse.json({ detail: "The authentication service returned an invalid response." }, { status: 502 });
  }
  const response = NextResponse.json({ success: true, recovery_codes: data.recovery_codes });
  setSessionCookies(response, data.access_token, data.refresh_token);
  return response;
}

export function setSessionCookies(response: NextResponse, access: string, refresh: string) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("light_access_token", access, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 15 * 60 });
  response.cookies.set("light_refresh_token", refresh, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 });
}

export async function postToApi(path: string, body: unknown, headers: Record<string, string> = {}) {
  const upstream = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as AuthBody | null;
  return { status: upstream.status, data };
}

/** The browser's real IP for the API's rate limits. */
export function forwardedFor(request: Request): Record<string, string> {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");
  return ip ? { "X-Forwarded-For": ip } : {};
}

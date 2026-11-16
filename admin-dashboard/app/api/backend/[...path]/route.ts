
import { NextRequest, NextResponse } from "next/server";

/**
 * Allow-listed proxy from the admin UI to the FastAPI backend.
 * Access and refresh tokens remain in httpOnly cookies.
 */

const API_BASE = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1"
).replace(/\/+$/, "");

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type RefreshResult =
  | {
      kind: "success";
      accessToken: string;
      refreshToken: string;
    }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const refreshInFlight = new Map<string, Promise<RefreshResult>>();

const ALLOWED: Record<Method, RegExp[]> = {
  GET: [
    /^admin\/overview$/,
    /^admin\/users$/,
    new RegExp(`^admin/users/${UUID}$`),

    /^moderation\/reports$/,
    new RegExp(`^moderation/reports/${UUID}$`),
    /^moderation\/audit-logs$/,

    /^communities$/,
    new RegExp(`^communities/${UUID}(/posts|/members)?$`),

    /^events$/,
    new RegExp(`^events/${UUID}$`),

    /^meetings$/,
    new RegExp(`^meetings/${UUID}(/recordings)?$`),

    /^resources$/,
    new RegExp(`^resources/${UUID}$`),
    /^resource-categories$/,

    /^branches$/,
    /^chapter-coordinator\/me$/,
    new RegExp(`^branches/${UUID}$`),
    new RegExp(`^branches/${UUID}/coordinators$`),
    new RegExp(`^branches/${UUID}/members$`),
    new RegExp(`^branches/${UUID}/departments$`),
    new RegExp(`^branches/${UUID}/posts$`),
    new RegExp(`^branches/${UUID}/dashboard$`),

    new RegExp(`^chapter-posts/${UUID}/comments$`),
    /^me\/chapter-access-requests$/,
    new RegExp(`^chapters/${UUID}/access-requests$`),

    /^search(\/[a-z]+)?$/,
    /^auth\/me$/,
    /^profiles\/me$/,
    /^health$/,
  ],

  POST: [
    /^branches$/,

    new RegExp(`^admin/users/${UUID}/suspend$`),
    new RegExp(`^admin/users/${UUID}/reinstate$`),

    new RegExp(`^moderation/reports/${UUID}/resolve$`),

    new RegExp(`^events/${UUID}/cancel$`),

    new RegExp(`^meetings/${UUID}/(start|end|cancel)$`),

    new RegExp(`^resources/${UUID}/(publish|unpublish)$`),

    new RegExp(`^branches/${UUID}/(archive|restore)$`),
    new RegExp(`^branches/${UUID}/coordinators$`),
    new RegExp(`^branches/${UUID}/departments$`),
    new RegExp(`^branches/${UUID}/posts$`),
    new RegExp(`^branches/${UUID}/push-notifications$`),

    new RegExp(`^chapter-posts/${UUID}/comments$`),

    new RegExp(`^chapters/${UUID}/access-requests$`),
    new RegExp(`^chapter-access-requests/${UUID}/review$`),
    new RegExp(`^chapter-access-requests/${UUID}/cancel$`),
  ],

  PATCH: [
    new RegExp(`^admin/users/${UUID}/role$`),
    new RegExp(`^admin/users/${UUID}/membership$`),

    new RegExp(`^branches/${UUID}$`),
    new RegExp(`^branches/${UUID}/departments/${UUID}$`),
    new RegExp(`^branches/${UUID}/members/${UUID}/profile$`),

    new RegExp(`^communities/${UUID}$`),
    new RegExp(`^events/${UUID}$`),
  ],

  DELETE: [
    new RegExp(`^branches/${UUID}/coordinators/${UUID}$`),
    new RegExp(`^branches/${UUID}/departments/${UUID}$`),
    new RegExp(`^branches/${UUID}/posts/${UUID}$`),
    new RegExp(
      `^branches/${UUID}/posts/${UUID}/comments/${UUID}$`,
    ),
  ],
};

type Ctx = {
  params: Promise<{ path: string[] }>;
};

function unauthorized(clearCookies = false) {
  const response = NextResponse.json(
    { detail: "Please sign in to continue." },
    { status: 401 },
  );

  if (clearCookies) {
    response.cookies.set("light_access_token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    response.cookies.set("light_refresh_token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

function applyAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("light_access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });

  response.cookies.set("light_refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}

async function performRefresh(
  refreshToken: string,
): Promise<RefreshResult> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });

    if ([400, 401, 403, 422].includes(response.status)) {
      return { kind: "invalid" };
    }

    if (!response.ok) {
      return { kind: "unavailable" };
    }

    const data = await response.json().catch(() => null);

    if (
      typeof data?.access_token !== "string" ||
      typeof data?.refresh_token !== "string"
    ) {
      return { kind: "unavailable" };
    }

    return {
      kind: "success",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

async function getRefreshResult(
  refreshToken: string,
): Promise<RefreshResult> {
  const existing = refreshInFlight.get(refreshToken);

  if (existing) {
    return existing;
  }

  const refreshPromise = performRefresh(refreshToken);

  refreshInFlight.set(refreshToken, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    if (refreshInFlight.get(refreshToken) === refreshPromise) {
      refreshInFlight.delete(refreshToken);
    }
  }
}

async function buildResponse(upstream: Response) {
  if (upstream.status === 204) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const data = await upstream.json().catch(() => null);

  return NextResponse.json(
    data ?? {
      detail: "The API returned an invalid response.",
    },
    {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function forward(
  request: NextRequest,
  ctx: Ctx,
  method: Method,
) {
  const { path } = await ctx.params;

  const joined = path
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  if (!ALLOWED[method].some((rule) => rule.test(joined))) {
    return NextResponse.json(
      {
        detail: "This endpoint is not available to the dashboard.",
      },
      { status: 404 },
    );
  }

  const search = request.nextUrl.search;

  let body: string | undefined;

  if (method === "POST" || method === "PATCH") {
    body = (await request.text()) || "{}";

    try {
      JSON.parse(body);
    } catch {
      return NextResponse.json(
        { detail: "Invalid JSON request body." },
        { status: 400 },
      );
    }
  }

  const sendRequest = (token: string) =>
    fetch(`${API_BASE}/${joined}${search}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
    });

  try {
    let accessToken = request.cookies.get(
      "light_access_token",
    )?.value;

    const refreshToken = request.cookies.get(
      "light_refresh_token",
    )?.value;

    let upstream: Response | null = null;

    if (accessToken) {
      upstream = await sendRequest(accessToken);
    }

    // Refresh when the access token is missing or has expired.
    if (!upstream || upstream.status === 401) {
      if (!refreshToken) {
        return unauthorized(Boolean(accessToken));
      }

      const refreshResult = await getRefreshResult(refreshToken);

      if (refreshResult.kind === "invalid") {
        return unauthorized(true);
      }

      if (refreshResult.kind === "unavailable") {
        return NextResponse.json(
          {
            detail:
              "Unable to refresh your session. Please try again.",
          },
          { status: 503 },
        );
      }

      accessToken = refreshResult.accessToken;

      // Retry the original request once with the new access token.
      upstream = await sendRequest(accessToken);

      if (upstream.status === 401) {
        return unauthorized(true);
      }

      const response = await buildResponse(upstream);

      return applyAuthCookies(
        response,
        refreshResult.accessToken,
        refreshResult.refreshToken,
      );
    }

    return buildResponse(upstream);
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the API." },
      { status: 502 },
    );
  }
}

export function GET(request: NextRequest, ctx: Ctx) {
  return forward(request, ctx, "GET");
}

export function POST(request: NextRequest, ctx: Ctx) {
  return forward(request, ctx, "POST");
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return forward(request, ctx, "PATCH");
}

export function DELETE(request: NextRequest, ctx: Ctx) {
  return forward(request, ctx, "DELETE");
}

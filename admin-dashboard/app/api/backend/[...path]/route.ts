import { NextRequest, NextResponse } from "next/server";

/**
 * Generic, allow-listed proxy from the admin UI to the FastAPI backend.
 *
 * The browser never sees the access token: it lives in the httpOnly
 * `light_access_token` cookie set by /api/auth/login and is attached here.
 * Only the paths below can be reached, so this is not an open relay.
 */

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1";

const UUID = "[0-9a-f-]{36}";

const ALLOWED: Record<"GET" | "POST" | "PATCH", RegExp[]> = {
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
    new RegExp(`^branches/${UUID}$`),
    /^search(\/[a-z]+)?$/,
    /^auth\/me$/,
    /^profiles\/me$/,
    /^health$/,
  ],
  POST: [
    new RegExp(`^moderation/reports/${UUID}/resolve$`),
    new RegExp(`^events/${UUID}/cancel$`),
    new RegExp(`^meetings/${UUID}/(start|end|cancel)$`),
    new RegExp(`^resources/${UUID}/(publish|unpublish)$`),
    new RegExp(`^branches/${UUID}/(archive|restore)$`),
  ],
  PATCH: [new RegExp(`^communities/${UUID}$`), new RegExp(`^events/${UUID}$`)],
};

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, ctx: Ctx, method: "GET" | "POST" | "PATCH") {
  const token = request.cookies.get("light_access_token")?.value;
  if (!token) {
    return NextResponse.json({ detail: "Please sign in to continue." }, { status: 401 });
  }

  const { path } = await ctx.params;
  const joined = path.map((p) => decodeURIComponent(p)).join("/");

  if (!ALLOWED[method].some((rule) => rule.test(joined))) {
    return NextResponse.json({ detail: "This endpoint is not available to the dashboard." }, { status: 404 });
  }

  const search = request.nextUrl.search;
  let body: string | undefined;
  if (method !== "GET") {
    body = (await request.text()) || "{}";
    try {
      JSON.parse(body);
    } catch {
      return NextResponse.json({ detail: "Invalid JSON request body." }, { status: 400 });
    }
  }

  try {
    const upstream = await fetch(`${API_BASE}/${joined}${search}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });

    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data ?? { detail: "The API returned an invalid response." }, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ detail: "Unable to contact the API." }, { status: 502 });
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

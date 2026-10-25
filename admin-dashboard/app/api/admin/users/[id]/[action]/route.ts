import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1";

type RouteContext = {
  params: Promise<{ id: string; action: string }>;
};

async function forward(
  request: NextRequest,
  context: RouteContext,
  method: "PATCH" | "POST",
) {
  const token = request.cookies.get("light_access_token")?.value;

  if (!token) {
    return NextResponse.json(
      { detail: "Please sign in to continue." },
      { status: 401 },
    );
  }

  const { id, action } = await context.params;
  const allowed =
    method === "PATCH"
      ? action === "role"
      : action === "suspend" || action === "reinstate";

  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !allowed
  ) {
    return NextResponse.json(
      { detail: "Invalid user ID or action." },
      { status: 400 },
    );
  }

  let body: string;

  try {
    body = await request.text();

    if (!body && action === "reinstate") {
      body = "{}";
    }

    if (!body) {
      return NextResponse.json(
        { detail: "A request body is required." },
        { status: 400 },
      );
    }

    JSON.parse(body);
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(
      `${API_BASE}/admin/users/${encodeURIComponent(id)}/${action}`,
      {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
        cache: "no-store",
      },
    );

    const data = await upstream.json().catch(() => null);

    return NextResponse.json(
      data ?? { detail: "The user API returned an invalid response." },
      {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the user API." },
      { status: 502 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  return forward(request, context, "PATCH");
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  return forward(request, context, "POST");
}

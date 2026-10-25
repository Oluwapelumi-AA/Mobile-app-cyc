import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("light_access_token")?.value;

  if (!token) {
    return NextResponse.json(
      { detail: "Please sign in to continue." },
      { status: 401 },
    );
  }

  const incoming = request.nextUrl.searchParams;
  const rawLimit = Number(incoming.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 20;

  const params = new URLSearchParams({ limit: String(limit) });

  for (const key of [
    "cursor",
    "q",
    "account_role",
    "is_active",
    "branch_id",
  ]) {
    const value = incoming.get(key);
    if (value !== null && value !== "") {
      params.set(key, value);
    }
  }

  try {
    const upstream = await fetch(
      `${API_BASE}/admin/users?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    const data = await upstream.json().catch(() => null);

    return NextResponse.json(
      data ?? { detail: "The users API returned an invalid response." },
      {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the users API." },
      { status: 502 },
    );
  }
}

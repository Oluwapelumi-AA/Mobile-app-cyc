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

  const params = new URLSearchParams({ limit: "5" });

  try {
    const upstream = await fetch(
      `${API_BASE}/moderation/audit-logs?${params.toString()}`,
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
      data ?? { detail: "The audit-log API returned an invalid response." },
      {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the audit-log API." },
      { status: 502 },
    );
  }
}

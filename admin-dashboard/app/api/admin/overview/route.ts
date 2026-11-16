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

  try {
    const upstream = await fetch(`${API_BASE}/admin/overview`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return NextResponse.json(
        { detail: data?.detail ?? "Unable to load dashboard statistics." },
        { status: upstream.status },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the dashboard API." },
      { status: 502 },
    );
  }
}

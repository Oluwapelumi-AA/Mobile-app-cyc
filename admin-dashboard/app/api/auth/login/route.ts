import { NextResponse } from "next/server";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return NextResponse.json(
        { detail: "Enter your email and password." },
        { status: 400 },
      );
    }

    const upstream = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return NextResponse.json(
        {
          detail:
            typeof data?.detail === "string"
              ? data.detail
              : "Unable to sign in. Check your credentials.",
        },
        { status: upstream.status },
      );
    }

    if (
      typeof data?.access_token !== "string" ||
      typeof data?.refresh_token !== "string"
    ) {
      return NextResponse.json(
        { detail: "The authentication service returned an invalid response." },
        { status: 502 },
      );
    }

    const response = NextResponse.json({ success: true });

    const secure = process.env.NODE_ENV === "production";

    response.cookies.set("light_access_token", data.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    response.cookies.set("light_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch {
    return NextResponse.json(
      { detail: "Unable to contact the authentication service." },
      { status: 502 },
    );
  }
}

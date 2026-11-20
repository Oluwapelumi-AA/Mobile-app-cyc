import { NextResponse } from "next/server";

import { finishAuth, forwardedFor, postToApi } from "@/lib/authSession";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return NextResponse.json({ detail: "Enter your email and password." }, { status: 400 });
    }
    const { status, data } = await postToApi("/auth/login", { email: email.trim(), password }, forwardedFor(request));
    return finishAuth(status, data, "Unable to sign in. Check your credentials.");
  } catch {
    return NextResponse.json({ detail: "Unable to contact the authentication service." }, { status: 502 });
  }
}

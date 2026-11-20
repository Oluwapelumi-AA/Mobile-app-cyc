import { NextResponse } from "next/server";

import { finishAuth, forwardedFor, postToApi } from "@/lib/authSession";

/** Sign in with the ID token from Google Identity Services. */
export async function POST(request: Request) {
  try {
    const { credential } = await request.json();
    if (typeof credential !== "string" || credential.length < 10) {
      return NextResponse.json({ detail: "Google sign-in didn't work. Please try again." }, { status: 400 });
    }
    const { status, data } = await postToApi("/auth/google", { id_token: credential }, forwardedFor(request));
    return finishAuth(status, data, "Google sign-in didn't work. Please try again.");
  } catch {
    return NextResponse.json({ detail: "Unable to contact the authentication service." }, { status: 502 });
  }
}

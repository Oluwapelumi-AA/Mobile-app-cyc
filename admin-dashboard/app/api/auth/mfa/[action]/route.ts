import { NextResponse } from "next/server";

import { detailMessage, finishAuth, forwardedFor, postToApi } from "@/lib/authSession";

/** The second sign-in step: verify a code, or (admins) set up two-step
 * sign-in and turn it on. All use the short-lived mfa_token. */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["verify", "setup", "enable"].includes(action)) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }
  try {
    const { mfa_token, code } = await request.json();
    if (typeof mfa_token !== "string" || (action !== "setup" && typeof code !== "string")) {
      return NextResponse.json({ detail: "Enter the code." }, { status: 400 });
    }
    const body = action === "setup" ? { mfa_token } : { mfa_token, code: String(code).trim() };
    const { status, data } = await postToApi(`/auth/mfa/${action}`, body, forwardedFor(request));
    if (action === "setup") {
      if (status !== 200) return NextResponse.json({ detail: detailMessage(data, "Couldn't start setup.") }, { status });
      return NextResponse.json(data);
    }
    return finishAuth(status, data, "That code didn't work.");
  } catch {
    return NextResponse.json({ detail: "Unable to contact the authentication service." }, { status: 502 });
  }
}

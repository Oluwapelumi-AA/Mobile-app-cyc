"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

type GoogleId = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleId;
  }
}

let gisLoading: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load Google sign-in."));
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

export type SignInResult =
  | { kind: "done" }
  | { kind: "mfa"; token: string; setup: boolean };

/** Read a sign-in answer from our /api/auth routes. */
export async function readSignIn(response: Response, fallback: string): Promise<SignInResult> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : fallback);
  if (body?.mfa_required || body?.mfa_setup_required) {
    return { kind: "mfa", token: String(body.mfa_token), setup: Boolean(body.mfa_setup_required) };
  }
  return { kind: "done" };
}

/** Google's own "Sign in with Google" button. Hidden until
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. */
export function GoogleSignInButton({ onResult, onError }: { onResult: (r: SignInResult) => void; onError: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential }),
              });
              onResult(await readSignIn(res, "Google sign-in didn't work."));
            } catch (err) {
              onError(err instanceof Error ? err.message : "Google sign-in didn't work.");
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 290,
        });
      })
      .catch((err: Error) => onError(err.message));
    return () => {
      cancelled = true;
    };
  }, [onResult, onError]);

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/35">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div ref={ref} className="flex justify-center" />
    </>
  );
}

const field =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-center text-lg tracking-[0.35em] text-white outline-none placeholder:tracking-normal placeholder:text-sm placeholder:text-white/35 focus:border-white/30";

/** The second sign-in step, or the first-time setup for admins. */
export function TwoStepPanel({ token, setup, onDone, onCancel }: { token: string; setup: boolean; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [secret, setSecret] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!setup) return;
    fetch("/api/auth/mfa/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mfa_token: token }) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.detail || "Couldn't start setup.");
        const qr = await QRCode.toDataURL(body.otpauth_uri, { margin: 1, width: 180 });
        setSecret({ secret: body.secret, qr });
      })
      .catch((err: Error) => setError(err.message));
  }, [setup, token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/mfa/${setup ? "enable" : "verify"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfa_token: token, code: code.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail || "That code didn't work.");
      if (setup && Array.isArray(body?.recovery_codes)) setCodes(body.recovery_codes);
      else onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-xs leading-5 text-amber-200">
          Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They won&apos;t be shown again.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-sm text-white">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className="flex-1 rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
            Copy
          </button>
          <button type="button" onClick={onDone} className="flex-1 rounded-full bg-[linear-gradient(90deg,#860000_0%,#c0392b_100%)] px-4 py-2 text-sm font-semibold text-white">
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <p className="text-center text-xs leading-5 text-white/60">
        {setup
          ? "Admins must use two-step sign-in. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator…), then enter the 6-digit code it shows."
          : recovery
            ? "Enter one of your recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
      </p>
      {setup && secret ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={secret.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg bg-white p-1" />
          <code className="break-all text-center text-[11px] text-white/60">{secret.secret.match(/.{1,4}/g)?.join(" ")}</code>
        </div>
      ) : null}
      <input
        autoFocus
        inputMode={recovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        maxLength={recovery ? 11 : 6}
        value={code}
        onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
        placeholder={recovery ? "xxxxx-xxxxx" : "6-digit code"}
        className={field}
      />
      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/60 p-3 text-xs leading-5 text-red-200">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy || (recovery ? code.trim().length < 10 : code.length !== 6)}
        className="!mt-5 flex w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#860000_0%,#c0392b_100%)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Checking..." : setup ? "Turn on and sign in" : "Sign in"}
      </button>
      <div className="flex justify-between text-[11px] text-white/50">
        <button type="button" onClick={onCancel} className="hover:text-white">
          ← Back
        </button>
        {!setup ? (
          <button type="button" onClick={() => (setRecovery((r) => !r), setCode(""), setError(""))} className="hover:text-white">
            {recovery ? "Use authenticator code" : "Use a recovery code"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

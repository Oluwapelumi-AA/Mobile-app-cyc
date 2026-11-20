"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import { api } from "../data";
import { useToast } from "../dialogs";
import { Card, CardHeader, StatusBadge } from "../ui";

type MfaStatus = { enabled: boolean; required: boolean; recovery_codes_left: number };
type Me = { email: string; has_password?: boolean; google_linked?: boolean };

const input =
  "h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft";
const primary = "rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const secondary = "rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas disabled:opacity-50";

/** Your own sign-in security: two-step sign-in, password, sessions. */
export default function SecurityPanel() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [action, setAction] = useState<"disable" | "codes" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([api<Me>("auth/me"), api<MfaStatus>("auth/mfa")]);
    setMe(m);
    setStatus(s);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(() => undefined);
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const res = await api<{ secret: string; otpauth_uri: string }>("auth/mfa/setup", { method: "POST", body: JSON.stringify({}) });
      setSetup({ secret: res.secret, qr: await QRCode.toDataURL(res.otpauth_uri, { margin: 1, width: 180 }) });
    });

  const enable = () =>
    run(async () => {
      const res = await api<{ recovery_codes: string[] }>("auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setCodes(res.recovery_codes);
      setSetup(null);
      setCode("");
      toast.success("Two-step sign-in is on");
      await load();
    });

  const confirmAction = () =>
    run(async () => {
      if (action === "disable") {
        await api("auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) });
        toast.success("Two-step sign-in is off");
      } else {
        const res = await api<{ recovery_codes: string[] }>("auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify({ code }) });
        setCodes(res.recovery_codes);
      }
      setAction(null);
      setCode("");
      await load();
    });

  const changePassword = () =>
    run(async () => {
      if (pw.next !== pw.confirm) throw new Error("The new passwords don't match.");
      await api("auth/change-password", { method: "POST", body: JSON.stringify({ current_password: pw.current, new_password: pw.next }) });
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed. Your other sessions were signed out.");
    });

  const everywhere = () =>
    run(async () => {
      await api("auth/logout-everywhere", { method: "POST" });
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    });

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <CardHeader
          title="Two-step sign-in"
          subtitle="A code from an authenticator app every time you sign in."
          action={status ? <StatusBadge status={status.enabled ? "Active" : "Inactive"} /> : undefined}
        />
        <div className="mt-4 space-y-3 text-sm">
          {status?.enabled ? (
            <>
              <p className="text-muted">On · {status.recovery_codes_left} recovery codes left.{status.required ? " Required for admins." : ""}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondary} onClick={() => setAction("codes")}>New recovery codes</button>
                {!status.required ? (
                  <button type="button" className={secondary} onClick={() => setAction("disable")}>Turn off</button>
                ) : null}
              </div>
            </>
          ) : setup ? null : (
            <button type="button" className={primary} disabled={busy} onClick={start}>Set up two-step sign-in</button>
          )}

          {setup ? (
            <div className="space-y-3">
              <p className="text-muted">Scan this with Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border border-line" />
              <code className="block break-all text-xs text-muted">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
              <input className={input} inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <div className="flex gap-2">
                <button type="button" className={primary} disabled={busy || code.length !== 6} onClick={enable}>Turn on</button>
                <button type="button" className={secondary} onClick={() => (setSetup(null), setCode(""))}>Cancel</button>
              </div>
            </div>
          ) : null}

          {action ? (
            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="font-medium text-ink">{action === "disable" ? "Turn off two-step sign-in" : "Replace your recovery codes"}</p>
              <input className={input} maxLength={11} placeholder="Code from your authenticator app" value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className={primary} disabled={busy || code.length < 6} onClick={confirmAction}>Confirm</button>
                <button type="button" className={secondary} onClick={() => (setAction(null), setCode(""))}>Cancel</button>
              </div>
            </div>
          ) : null}

          {codes ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">Save these recovery codes somewhere safe. Each works once. They won&apos;t be shown again.</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                {codes.map((c) => <span key={c}>{c}</span>)}
              </div>
              <div className="flex gap-2">
                <button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy</button>
                <button type="button" className={secondary} onClick={() => setCodes(null)}>Done</button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Password" subtitle={me ? `Signed in as ${me.email}${me.google_linked ? " · Google connected" : ""}` : undefined} />
        <div className="mt-4 space-y-3">
          <input className={input} type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className={input} type="password" autoComplete="new-password" placeholder="New password (12+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <input className={input} type="password" autoComplete="new-password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <button type="button" className={primary} disabled={busy || !pw.current || pw.next.length < 12 || !pw.confirm} onClick={changePassword}>Change password</button>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Sessions" subtitle="Sign out of the dashboard and the app on every device." />
        <button type="button" className={`${secondary} mt-4`} disabled={busy} onClick={everywhere}>Sign out everywhere</button>
      </Card>

      <Card className="p-5">
        <CardHeader title="Platform protections" subtitle="Set on the server (backend .env)." />
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-ink/80">
          <li>Email confirmation for new accounts (REQUIRE_EMAIL_VERIFICATION)</li>
          <li>Two-step sign-in required for admins (REQUIRE_ADMIN_MFA)</li>
          <li>A 15-minute lock after 5 wrong passwords (LOGIN_MAX_FAILURES, LOGIN_LOCK_MINUTES)</li>
          <li>Rate limits on sign-in, codes and password reset</li>
          <li>Stolen-session detection: reused refresh tokens sign out everywhere</li>
        </ul>
      </Card>
      {toast.element}
    </div>
  );
}

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ApiError, clearTokens, currentRefreshToken, loadTokens, saveTokens, setSignedOutHandler } from "./api";
import { setFlash } from "./flash";
import { unregisterPush } from "./push";
import { local } from "./storage";
import type { Membership, OnboardingStatus, Profile, User } from "./types";

/** loading → signedOut | guest | signedIn. Guests browse public content with no account. */
type Status = "loading" | "signedOut" | "guest" | "signedIn";

export type Suspension = { reason: string | null };

/** What the sign-in screen does next. */
export type SignInStep =
  | { kind: "done" }
  | { kind: "verify"; email: string }
  | { kind: "mfa"; mfaToken: string }
  | { kind: "mfaSetup"; mfaToken: string };

type AuthResponse = {
  access_token: string | null;
  refresh_token: string | null;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string | null;
  is_new_account?: boolean;
  suggested_name?: string | null;
};

const PENDING_NAME = "cyc.pendingName";

type AuthValue = {
  status: Status;
  user: User | null;
  profile: Profile | null;
  membership: Membership | null;
  onboarding: OnboardingStatus | null;
  /** Signed in, with a profile, and finished onboarding. */
  ready: boolean;
  isGuest: boolean;
  /** Set when sign-in was refused because the account is suspended. */
  suspended: Suspension | null;
  clearSuspended: () => void;
  signIn: (email: string, password: string) => Promise<SignInStep>;
  /** Create the account. Usually leads to the emailed-code step. */
  signUp: (name: string, email: string, password: string) => Promise<SignInStep>;
  /** Confirm the 6-digit code emailed after sign-up. */
  verifyEmail: (email: string, code: string) => Promise<SignInStep>;
  resendCode: (email: string) => Promise<void>;
  /** Sign in or sign up with a Google ID token. */
  signInWithGoogle: (idToken: string) => Promise<SignInStep>;
  /** Second step: authenticator or recovery code. */
  verifyMfa: (mfaToken: string, code: string) => Promise<SignInStep>;
  /** Finish sign-in with tokens from a two-step setup. */
  acceptTokens: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  leaveGuest: () => void;
  /** Reload the account (after editing the profile, joining a department, etc). */
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const GUEST_KEY = "cyc.guestMode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [suspended, setSuspended] = useState<Suspension | null>(null);

  const reset = useCallback(() => {
    setUser(null);
    setProfile(null);
    setMembership(null);
    setOnboarding(null);
    setStatus("signedOut");
  }, []);

  const reload = useCallback(async () => {
    const me = await api<User>("/auth/me");
    const [p, m, o] = await Promise.all([
      api<Profile>("/profiles/me").catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
      api<Membership>("/me/membership").catch(() => null),
      api<OnboardingStatus>("/onboarding/me").catch(() => null),
    ]);
    setUser(me);
    setProfile(p);
    setMembership(m);
    setOnboarding(o);
    setStatus("signedIn");
    await local.remove(GUEST_KEY);
  }, []);

  useEffect(() => {
    setSignedOutHandler(reset);
    (async () => {
      if (!(await loadTokens())) {
        return (await local.getJSON<boolean>(GUEST_KEY, false)) ? setStatus("guest") : reset();
      }
      try {
        await reload();
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          // Offline: keep the session; screens show their own errors.
          setStatus("signedIn");
        } else {
          await clearTokens();
          reset();
        }
      }
    })();
    return () => setSignedOutHandler(null);
  }, [reload, reset]);

  /** Create the profile for a brand-new account (name, language, time zone). */
  const ensureProfile = useCallback(async (fallbackName?: string | null) => {
    const existing = await api("/profiles/me").catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    });
    if (existing) return;
    const saved = await local.getJSON<string | null>(PENDING_NAME, null);
    const name = (saved || fallbackName || "CYC member").trim().slice(0, 50);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await api("/profiles/me", { method: "POST", body: { display_name: name, language_code: "en", timezone } });
    for (const step of ["profile_basics", "language", "timezone"]) {
      await api(`/onboarding/me/steps/${step}/complete`, { method: "POST" }).catch(() => undefined);
    }
    await local.remove(PENDING_NAME);
  }, []);

  /** Tokens, or the two-step screen. */
  const handle = useCallback(
    async (res: AuthResponse, opts: { newName?: string | null; flash?: string } = {}): Promise<SignInStep> => {
      if (res.mfa_required && res.mfa_token) return { kind: "mfa", mfaToken: res.mfa_token };
      if (res.mfa_setup_required && res.mfa_token) return { kind: "mfaSetup", mfaToken: res.mfa_token };
      if (!res.access_token || !res.refresh_token) throw new Error("Sign-in didn't complete. Please try again.");
      await saveTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
      await ensureProfile(opts.newName);
      await reload();
      if (opts.flash) setFlash(opts.flash);
      return { kind: "done" };
    },
    [ensureProfile, reload],
  );

  const refused = useCallback((err: unknown, email?: string): SignInStep | null => {
    if (err instanceof ApiError && err.code === "account_suspended") {
      setSuspended({ reason: typeof err.extra.reason === "string" ? err.extra.reason : null });
    }
    if (err instanceof ApiError && err.code === "email_not_verified" && email) return { kind: "verify", email };
    return null;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await api<AuthResponse>("/auth/login", { method: "POST", body: { email: email.trim(), password }, auth: false });
        return await handle(res, { flash: "Welcome back" });
      } catch (err) {
        const next = refused(err, email.trim());
        if (next) return next;
        throw err;
      }
    },
    [handle, refused],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await local.setJSON(PENDING_NAME, name.trim());
      try {
        await api("/auth/register", { method: "POST", body: { email: email.trim(), password }, auth: false });
      } catch (err) {
        // Signed up before but never confirmed the email: with the same
        // password, carry on to the code (or straight in).
        if (err instanceof ApiError && err.status === 409) {
          try {
            return await signIn(email, password);
          } catch {
            throw err;
          }
        }
        throw err;
      }
      // Servers that don't require the emailed code sign straight in.
      return signIn(email, password);
    },
    [signIn],
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const res = await api<AuthResponse>("/auth/verify-email", { method: "POST", body: { email: email.trim(), code }, auth: false });
      return handle(res);
    },
    [handle],
  );

  const resendCode = useCallback(async (email: string) => {
    await api("/auth/verify-email/resend", { method: "POST", body: { email: email.trim() }, auth: false });
  }, []);

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      try {
        const res = await api<AuthResponse>("/auth/google", { method: "POST", body: { id_token: idToken }, auth: false });
        return await handle(res, { newName: res.suggested_name, flash: res.is_new_account ? undefined : "Welcome back" });
      } catch (err) {
        refused(err);
        throw err;
      }
    },
    [handle, refused],
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const res = await api<AuthResponse>("/auth/mfa/verify", { method: "POST", body: { mfa_token: mfaToken, code: code.trim() }, auth: false });
      return handle(res, { flash: "Welcome back" });
    },
    [handle],
  );

  const acceptTokens = useCallback(
    async (tokens: { access_token: string; refresh_token: string }) => {
      await handle(tokens);
    },
    [handle],
  );

  const signOut = useCallback(async () => {
    const token = currentRefreshToken();
    await unregisterPush().catch(() => undefined);
    if (token) await api("/auth/logout", { method: "POST", body: { refresh_token: token } }).catch(() => undefined);
    await clearTokens();
    await local.remove(GUEST_KEY);
    reset();
  }, [reset]);

  const continueAsGuest = useCallback(() => {
    void local.setJSON(GUEST_KEY, true);
    setStatus("guest");
  }, []);

  const leaveGuest = useCallback(() => {
    void local.remove(GUEST_KEY);
    setStatus("signedOut");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      profile,
      membership,
      onboarding,
      ready: Boolean(profile && (onboarding?.is_complete ?? membership?.onboarding_complete)),
      isGuest: status === "guest",
      suspended,
      clearSuspended: () => setSuspended(null),
      signIn,
      signUp,
      verifyEmail,
      resendCode,
      signInWithGoogle,
      verifyMfa,
      acceptTokens,
      signOut,
      continueAsGuest,
      leaveGuest,
      reload,
    }),
    [status, user, profile, membership, onboarding, suspended, signIn, signUp, verifyEmail, resendCode, signInWithGoogle, verifyMfa, acceptTokens, signOut, continueAsGuest, leaveGuest, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

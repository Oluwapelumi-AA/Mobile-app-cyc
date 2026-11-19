import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ApiError, clearTokens, currentRefreshToken, loadTokens, saveTokens, setSignedOutHandler } from "./api";
import { setFlash } from "./flash";
import { unregisterPush } from "./push";
import { local } from "./storage";
import type { Membership, OnboardingStatus, Profile, User } from "./types";

/** loading → signedOut | guest | signedIn. Guests browse public content with no account. */
type Status = "loading" | "signedOut" | "guest" | "signedIn";

export type Suspension = { reason: string | null };

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
  signIn: (email: string, password: string) => Promise<void>;
  /** Create the account and its profile (onboarding step 1). */
  signUp: (name: string, email: string, password: string) => Promise<void>;
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

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const tokens = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
          method: "POST",
          body: { email: email.trim(), password },
          auth: false,
        });
        await saveTokens(tokens);
      } catch (err) {
        if (err instanceof ApiError && err.code === "account_suspended") {
          setSuspended({ reason: typeof err.extra.reason === "string" ? err.extra.reason : null });
        }
        throw err;
      }
      await reload();
      setFlash("Welcome back");
    },
    [reload],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await api("/auth/register", { method: "POST", body: { email: email.trim(), password }, auth: false });
      const tokens = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
        auth: false,
      });
      await saveTokens(tokens);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api("/profiles/me", { method: "POST", body: { display_name: name.trim(), language_code: "en", timezone } });
      for (const step of ["profile_basics", "language", "timezone"]) {
        await api(`/onboarding/me/steps/${step}/complete`, { method: "POST" }).catch(() => undefined);
      }
      await reload();
    },
    [reload],
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
      signOut,
      continueAsGuest,
      leaveGuest,
      reload,
    }),
    [status, user, profile, membership, onboarding, suspended, signIn, signUp, signOut, continueAsGuest, leaveGuest, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

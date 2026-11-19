import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ApiError, clearTokens, currentRefreshToken, loadTokens, saveTokens, setSignedOutHandler } from "./api";
import { unregisterPush } from "./push";
import type { Membership, OnboardingStatus, Profile, User } from "./types";

type Status = "loading" | "signedOut" | "signedIn";

type AuthValue = {
  status: Status;
  user: User | null;
  profile: Profile | null;
  membership: Membership | null;
  onboarding: OnboardingStatus | null;
  /** True once the account has a profile and has finished onboarding. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reload the account (after editing the profile, joining a department, etc). */
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

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
  }, []);

  useEffect(() => {
    setSignedOutHandler(reset);
    (async () => {
      if (!(await loadTokens())) return reset();
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
      const tokens = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
        auth: false,
      });
      await saveTokens(tokens);
      await reload();
    },
    [reload],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      await api("/auth/register", { method: "POST", body: { email: email.trim(), password }, auth: false });
      await signIn(email, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    const token = currentRefreshToken();
    await unregisterPush().catch(() => undefined);
    if (token) await api("/auth/logout", { method: "POST", body: { refresh_token: token } }).catch(() => undefined);
    await clearTokens();
    reset();
  }, [reset]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      profile,
      membership,
      onboarding,
      ready: Boolean(profile && (onboarding?.is_complete ?? membership?.onboarding_complete)),
      signIn,
      signUp,
      signOut,
      reload,
    }),
    [status, user, profile, membership, onboarding, signIn, signUp, signOut, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

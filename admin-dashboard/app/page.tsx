"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ALL_NAV, ShellFrame, Sidebar, Topbar } from "../components/admin/Shell";
import { AdminContext, type AdminOverview, type PageKey, api } from "../components/admin/data";
import Audit from "../components/admin/screens/Audit";
import Branches from "../components/admin/screens/Branches";
import Communities from "../components/admin/screens/Communities";
import Courses from "../components/admin/screens/Courses";
import Events from "../components/admin/screens/Events";
import Live from "../components/admin/screens/Live";
import Notifications from "../components/admin/screens/Notifications";
import Overview from "../components/admin/screens/Overview";
import Posts from "../components/admin/screens/Posts";
import Reports from "../components/admin/screens/Reports";
import Resources from "../components/admin/screens/Resources";
import Settings from "../components/admin/screens/Settings";
import Users from "../components/admin/screens/Users";

const SCREENS: Record<PageKey, () => React.JSX.Element> = {
  overview: Overview,
  reports: Reports,
  users: Users,
  communities: Communities,
  posts: Posts,
  events: Events,
  live: Live,
  resources: Resources,
  courses: Courses,
  branches: Branches,
  notifications: Notifications,
  audit: Audit,
  settings: Settings,
};

const isPageKey = (v: string): v is PageKey => v in SCREENS;

function pageFromHash(): PageKey {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#\/?/, "");
  return isPageKey(h) ? h : "overview";
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

type Me = { name: string; email: string; avatar: string | null; role: string };

export default function Home() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState<PageKey>(pageFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  /* ---------- routing via URL hash (#users, #events …) ---------- */
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((key: PageKey) => {
    setPage(key);
    setSearch("");
    setMenuOpen(false);
    if (window.location.hash !== `#${key}`) window.history.pushState(null, "", `#${key}`);
    window.scrollTo({ top: 0 });
  }, []);

  /* ---------- session ---------- */
  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setSignedIn(false);
        setOverview(null);
        setError(
          response.status === 403
            ? "Your account does not have permission to access the admin dashboard. Contact an administrator."
            : "",
        );
        return;
      }
      if (!response.ok) throw new Error(await readError(response, "Could not load dashboard statistics."));
      setOverview((await response.json()) as AdminOverview);
      setSignedIn(true);
      setError("");

      // Who am I — for the avatar menu. Failures here are non-blocking.
      const [account, profile] = await Promise.allSettled([
        api<{ email: string; account_role: string }>("auth/me"),
        api<{ display_name?: string | null; avatar_url?: string | null }>("profiles/me"),
      ]);
      const acc = account.status === "fulfilled" ? account.value : null;
      const prof = profile.status === "fulfilled" ? profile.value : null;
      if (acc) {
        setMe({
          email: acc.email,
          role: acc.account_role,
          name: prof?.display_name || acc.email.split("@")[0],
          avatar: prof?.avatar_url ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the dashboard API.");
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    // loadSession only sets state after its first `await`, so this doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession();
  }, [loadSession]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to sign in. Check your credentials."));
      setPassword("");
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSignedIn(false);
      setOverview(null);
      setMe(null);
      setPassword("");
      setError("");
      navigate("overview");
    }
  }

  const ctx = useMemo(() => ({ navigate, overview, globalSearch: search }), [navigate, overview, search]);
  const navItem = ALL_NAV.find((n) => n.key === page) ?? ALL_NAV[0];

  useEffect(() => {
    document.title = `${navItem.label} | CYC Admin`;
  }, [navItem.label]);

  /* ---------- states ---------- */
  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="text-center">
          <div className="mx-auto w-fit animate-pulse"><Image src="/cyc-logo.png" alt="Christ Youth Club logo" width={112} height={75} priority className="h-[75px] w-[112px] object-contain" /></div>
          <p className="mt-4 text-sm text-muted">Checking your session…</p>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-white shadow-xl md:grid-cols-2">
          <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#240000_0%,#650000_45%,#860000_100%)] p-10 text-white md:flex">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-orange-400/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-red-500/30 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-16 w-24 items-center justify-center rounded-xl bg-white p-1"><Image src="/cyc-logo.png" alt="Christ Youth Club logo" width={96} height={64} priority className="h-full w-full object-contain" /></span>
              <div>
                <p className="text-lg font-extrabold">CYC</p>
                <p className="text-xs text-white/75">Community Admin</p>
              </div>
            </div>
            <div className="relative py-12">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">Christian Youth Club International</p>

              <p className="mt-5 max-w-sm text-sm leading-7 text-white/85">
                Moderate reports, support members, and manage events, live sessions and resources from one place.
              </p>
            </div>
            <p className="relative text-xs text-white/70">Grow in faith. Stay connected.</p>
          </section>

          <section className="flex items-center justify-center p-7 sm:p-11">
            <div className="w-full max-w-md">
              <div className="mb-8 flex items-center gap-3 md:hidden">
                <Image src="/cyc-logo.png" alt="Christ Youth Club logo" width={88} height={59} priority className="h-[59px] w-[88px] object-contain" />
                <div>
                  <p className="text-lg font-extrabold text-ink">CYC</p>
                  <p className="text-xs text-muted">Community Admin</p>
                </div>
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Welcome back</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">Sign in to your account</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Use your administrator or moderator credentials to continue.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Email address</span>
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3.5 text-sm outline-none placeholder:text-faint focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink">Password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3.5 text-sm outline-none placeholder:text-faint focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
                  />
                </label>
                {error ? (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-6 text-red-700">
                    {error}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={signingIn}
                  className="flex w-full items-center justify-center rounded-xl bg-brand px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingIn ? "Signing in…" : "Sign in to dashboard"}
                </button>
              </form>
              <p className="mt-7 text-center text-xs leading-5 text-faint">
                Access is restricted to authorized accounts. Contact your administrator if you need access.
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const Screen = SCREENS[page];

  return (
    <AdminContext.Provider value={ctx}>
      <ShellFrame
        sidebar={
          <Sidebar
            active={page}
            onNavigate={navigate}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          />
        }
      >
        <Topbar
          placeholder={navItem.search}
          search={search}
          onSearch={setSearch}
          onMenu={() => setMenuOpen(true)}
          onSignOut={signOut}
          onBell={() => navigate("notifications")}
          me={me}
          hasUnread={(overview?.open_reports ?? 0) > 0}
        />
        {error ? (
          <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => void loadSession()} className="font-semibold underline">Retry</button>
          </div>
        ) : null}
        <main className="pt-2">
          <Screen key={page} />
        </main>
      </ShellFrame>
    </AdminContext.Provider>
  );
}

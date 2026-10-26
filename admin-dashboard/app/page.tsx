"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ALL_NAV, ShellFrame, Sidebar, Topbar } from "../components/admin/Shell";
import { Icon } from "../components/admin/icons";
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

function BrandPanel() {
  return (
    <section className="relative hidden aspect-[3/4] w-[280px] shrink-0 flex-col justify-end overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_50%_36%,#b3121b_0%,#860000_32%,#3a0000_68%,#120000_100%)] p-5 shadow-[24px_0_60px_-10px_rgba(134,0,0,0.35)] md:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(255,214,140,0.25)_0%,transparent_38%)]" />
      <div className="pointer-events-none absolute -left-10 top-6 h-40 w-40 rounded-full bg-[#ff4d4d]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 bottom-24 h-40 w-40 rounded-full bg-[#f5b942]/15 blur-3xl" />
      <Image
        src="/cyc-crest.png"
        alt="Christ Youth Club logo"
        width={180}
        height={180}
        priority
        className="absolute left-1/2 top-[36%] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
      <div className="relative">
        <p className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
          Christ Youth Club
          <span className="rounded-md border border-white/70 px-1.5 py-0.5 text-[11px] font-bold leading-none">CYC</span>
        </p>
        <p className="mt-1.5 text-xs text-white/65">Working together with Christ.</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
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
          <div className="mx-auto w-fit animate-pulse"><Image src="/cyc-crest.png" alt="Christ Youth Club logo" width={96} height={96} priority className="h-24 w-24 object-contain" /></div>
          <p className="mt-4 text-sm text-muted">Checking your session…</p>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    const fieldClass =
      "w-full rounded-xl border border-white/10 bg-[#161616] py-2.5 pl-10 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#c0392b]/70 focus:ring-4 focus:ring-[#860000]/30";
    return (
      <main
        className="flex min-h-screen items-center justify-center p-4 sm:p-6"
        style={{
          background:
            "radial-gradient(ellipse at 12% 8%, #6b0000 0%, transparent 50%), radial-gradient(ellipse at 92% 92%, #4a0b0b 0%, transparent 55%), #140d0d",
        }}
      >
        <div className="flex w-full max-w-[760px] items-stretch gap-2 rounded-[28px] border border-white/10 bg-black p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.04)] sm:p-6">
          <BrandPanel />

          <section className="relative flex flex-1 items-center justify-center px-2 py-8 sm:px-8">
            <div className="relative w-full max-w-[290px]">
              <Image src="/cyc-crest.png" alt="Christ Youth Club logo" width={56} height={56} priority className="mx-auto mb-4 h-14 w-14 object-contain md:hidden" />
              <h1 className="text-center text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
              <p className="mt-1.5 text-center text-xs text-white/50">Sign in to the CYC admin dashboard</p>

              <form onSubmit={handleLogin} className="mt-7 space-y-3">
                <label className="relative block">
                  <span className="sr-only">Email address</span>
                  <Icon name="mail" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45" />
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className={`${fieldClass} pr-3`}
                  />
                </label>
                <label className="relative block">
                  <span className="sr-only">Password</span>
                  <Icon name="lock" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-white/45 hover:text-white"
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </label>
                {error ? (
                  <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/60 p-3 text-xs leading-5 text-red-200">
                    {error}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={signingIn}
                  className="!mt-6 flex w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#860000_0%,#c0392b_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(192,57,43,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingIn ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="mt-10 text-center text-[11px] leading-5 text-white/45">
                Forgot password? <span className="text-[#e05a4f]">Ask another admin</span> to reset it.
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

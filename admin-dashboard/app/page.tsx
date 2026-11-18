"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ALL_NAV, ShellFrame, Sidebar, Topbar } from "../components/admin/Shell";
import { Icon } from "../components/admin/icons";
import { AdminContext, type AdminOverview, type PageKey, api } from "../components/admin/data";
import Audit from "../components/admin/screens/Audit";
import Chapters from "../components/admin/screens/Chapters";
import Courses from "../components/admin/screens/Courses";
import Departments from "../components/admin/screens/Departments";
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
  chapters: Chapters,
  posts: Posts,
  events: Events,
  live: Live,
  resources: Resources,
  courses: Courses,
  departments: Departments,
  notifications: Notifications,
  audit: Audit,
  settings: Settings,
};

const isPageKey = (value: string): value is PageKey =>
  Object.prototype.hasOwnProperty.call(SCREENS, value);

function pageFromHash(): PageKey {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#\/?/, "");
  return isPageKey(hash) ? hash : "overview";
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

type Me = {
  name: string;
  email: string;
  avatar: string | null;
  role: string;
};

type CoordinatorAssignment = {
  chapter_id: string;
  chapter_name: string;
  role: "coordinator" | "moderator";
};

type DashboardMode = "admin" | "coordinator";

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
          <span className="rounded-md border border-white/70 px-1.5 py-0.5 text-[11px] font-bold leading-none">
            CYC
          </span>
        </p>
        <p className="mt-1.5 text-xs text-white/65">Working together with Christ.</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<DashboardMode | null>(null);
  const [coordinatorAssignments, setCoordinatorAssignments] = useState<CoordinatorAssignment[]>([]);
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

  /* ---------- routing via URL hash (#users, #events, etc.) ---------- */
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((key: PageKey) => {
    setPage(key);
    setSearch("");
    setMenuOpen(false);
    if (window.location.hash !== `#${key}`) {
      window.history.pushState(null, "", `#${key}`);
    }
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  }, []);

  /* ---------- role-based session ---------- */
  const loadSession = useCallback(async () => {
    try {
      setError("");

      // Identify the authenticated account before loading either dashboard.
      const account = await api<{ email: string; account_role: string }>("auth/me");

      // Profile fields are only used for the signed-in account display.
      const profile = await api<{
        display_name?: string | null;
        avatar_url?: string | null;
      }>("profiles/me").catch(() => null);

      setMe({
        email: account.email,
        role: account.account_role,
        name: profile?.display_name || account.email.split("@")[0],
        avatar: profile?.avatar_url ?? null,
      });

     
      // Platform admins retain access to the existing full dashboard.
      if (account.account_role === "admin") {
        const overview = await api<AdminOverview>("admin/overview");

        setOverview(overview);
        setCoordinatorAssignments([]);
        setMode("admin");
        setSignedIn(true);
        setError("");
        return;
      }


      // A non-admin account can enter only with a chapter staff role
      // (Coordinator or Moderator).
      const assignments = await api<CoordinatorAssignment[]>("me/chapter-staff");

      if (!Array.isArray(assignments) || assignments.length === 0) {
        setOverview(null);
        setCoordinatorAssignments([]);
        setMode(null);
        setSignedIn(false);
        setError(
          "Your account isn't a chapter coordinator or moderator. Please contact a platform administrator.",
        );
        return;
      }

      setOverview(null);
      setCoordinatorAssignments(assignments);
      setMode("coordinator");
      setSignedIn(true);
      setError("");
    } catch (err) {
      setSignedIn(false);
      setOverview(null);
      setCoordinatorAssignments([]);
      setMode(null);
      setError(
        err instanceof Error ? err.message : "Could not verify your dashboard permissions.",
      );
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    // loadSession performs its state updates after the first awaited request.
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

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to sign in. Check your credentials."));
      }

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
      setMode(null);
      setCoordinatorAssignments([]);
      setPassword("");
      setError("");
      navigate("overview");
    }
  }

  const ctx = useMemo(
    () => ({ navigate, overview, globalSearch: search }),
    [navigate, overview, search],
  );
  const navItem = ALL_NAV.find((item) => item.key === page) ?? ALL_NAV[0];

  useEffect(() => {
    document.title = `${mode === "coordinator" ? "Chapter staff" : navItem.label} | CYC`;
  }, [mode, navItem.label]);

  /* ---------- loading state ---------- */
  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="text-center">
          <div className="mx-auto w-fit animate-pulse">
            <Image
              src="/cyc-crest.png"
              alt="Christ Youth Club logo"
              width={96}
              height={96}
              priority
              className="h-24 w-24 object-contain"
            />
          </div>
          <p className="mt-4 text-sm text-muted">Checking your session...</p>
        </div>
      </main>
    );
  }

  /* ---------- sign-in / access-denied state ---------- */
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
              <Image
                src="/cyc-crest.png"
                alt="Christ Youth Club logo"
                width={56}
                height={56}
                priority
                className="mx-auto mb-4 h-14 w-14 object-contain md:hidden"
              />
              <h1 className="text-center text-2xl font-semibold tracking-tight text-white">
                Welcome back
              </h1>
              <p className="mt-1.5 text-center text-xs text-white/50">
                Sign in to the CYC management dashboard
              </p>

              <form onSubmit={handleLogin} className="mt-7 space-y-3">
                <label className="relative block">
                  <span className="sr-only">Email address</span>
                  <Icon
                    name="mail"
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45"
                  />
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email address"
                    className={`${fieldClass} pr-3`}
                  />
                </label>

                <label className="relative block">
                  <span className="sr-only">Password</span>
                  <Icon
                    name="lock"
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-white/45 hover:text-white"
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/30 bg-red-950/60 p-3 text-xs leading-5 text-red-200"
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="!mt-6 flex w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#860000_0%,#c0392b_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(192,57,43,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingIn ? "Signing in..." : "Sign in"}
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

  /* ---------- restricted coordinator landing page ---------- */
  if (mode === "coordinator") {
    return (
      <main className="min-h-screen bg-canvas px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/cyc-crest.png"
                alt="Christ Youth Club logo"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
              <div>
                <h1 className="text-xl font-bold text-ink">CYC Chapter Dashboard</h1>
                <p className="text-sm text-muted">Chapter staff</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Sign out
            </button>
          </header>

          <section className="mt-10">
            <h2 className="text-2xl font-bold text-ink">Welcome, {me?.name || "Coordinator"}</h2>
            <p className="mt-2 text-sm text-muted">
              You have staff access to the following chapters.
            </p>
          </section>

          <section className="mt-7 grid gap-4 sm:grid-cols-2">
            {coordinatorAssignments.map((assignment) => (
              <article
                key={assignment.chapter_id}
                className="rounded-2xl border border-line bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {assignment.role === "coordinator" ? "Coordinator" : "Moderator"}
                </p>
                <h3 className="mt-3 text-lg font-bold text-ink">{assignment.chapter_name}</h3>
                <p className="mt-2 break-all text-xs text-muted">
                  Chapter ID: {assignment.chapter_id}
                </p>
                <p className="mt-4 text-sm text-muted">
                  Your chapter management workspace will appear here.
                </p>
              </article>
            ))}
          </section>
        </div>
      </main>
    );
  }

  // Never render the platform administrator screens without confirmed admin mode.
  if (mode !== "admin") return null;

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
        <main className="pt-2">
          <Screen key={page} />
        </main>
      </ShellFrame>
    </AdminContext.Provider>
  );
}

"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PageKey } from "./data";
import { CycLogo, Icon, type IconName } from "./icons";
import { Avatar, cx } from "./ui";

type NavItemDef = { key: PageKey; label: string; icon: IconName; suffix?: string; search: string };

export const NAV: NavItemDef[] = [
  { key: "overview", label: "Overview", icon: "grid", search: "Search users, chapters, posts, courses…" },
  { key: "reports", label: "Reports and moderation", icon: "flag", search: "Search users, chapters, posts, reports…" },
  { key: "users", label: "Users", icon: "user", search: "Search users, chapters, posts, courses…" },
  { key: "chapters", label: "Chapters", icon: "branch", search: "Search chapters, cities, countries…" },
  { key: "posts", label: "Posts and comments", icon: "message", search: "Search users, chapters, posts, comments…" },
  { key: "events", label: "Events", icon: "calendar", search: "Search users, chapters, posts, events…" },
  { key: "live", label: "Live and video", icon: "video", search: "Search live sessions, videos, titles, speakers…" },
  { key: "resources", label: "Spiritual resources", icon: "book", search: "Search resources, authors, categories…" },
  { key: "courses", label: "Courses and quizzes", icon: "cap", search: "Search courses, lessons, quizzes, students…" },
  { key: "departments", label: "Departments", icon: "community", search: "Search departments…" },
];

export const NAV_SECONDARY: typeof NAV = [
  { key: "notifications", label: "Notifications", icon: "bell", search: "Search notifications, users, events…" },
  { key: "audit", label: "Audit log", icon: "file", search: "Search users, actions, modules, or details…" },
  { key: "settings", label: "Settings", icon: "settings", search: "Search settings, integrations, preferences…" },
];

/** Chapter staff workspace. Coordinators see everything; Moderators moderate. */
export const CHAPTER_NAV: (NavItemDef & { coordinatorOnly?: boolean })[] = [
  { key: "overview", label: "Overview", icon: "grid", search: "Search posts, events, members…" },
  { key: "members", label: "Members", icon: "users", search: "Search members by name or email…" },
  { key: "requests", label: "Access requests", icon: "userPlus", search: "Search requests…", coordinatorOnly: true },
  { key: "posts", label: "Posts and comments", icon: "message", search: "Search posts and comments…" },
  { key: "events", label: "Events", icon: "calendar", search: "Search events…", coordinatorOnly: true },
  { key: "live", label: "Live and video", icon: "video", search: "Search live sessions and videos…", coordinatorOnly: true },
  { key: "resources", label: "Spiritual resources", icon: "book", search: "Search resources…", coordinatorOnly: true },
  { key: "courses", label: "Courses and quizzes", icon: "cap", search: "Search courses and quizzes…", coordinatorOnly: true },
];

export const CHAPTER_NAV_SECONDARY: (NavItemDef & { coordinatorOnly?: boolean })[] = [
  { key: "announcements", label: "Announcements", icon: "megaphone", search: "Search announcements…", coordinatorOnly: true },
  { key: "reports", label: "Reports and moderation", icon: "flag", search: "Search reports…" },
];

export const ALL_NAV = [...NAV, ...NAV_SECONDARY, ...CHAPTER_NAV, ...CHAPTER_NAV_SECONDARY];

function NavButton({
  item,
  active,
  onClick,
  badge,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex w-full items-center gap-3 py-3 text-left text-[13px] transition",
        "rounded-l-full pl-5 pr-4",
        active ? "bg-white font-semibold text-brand" : "text-white/80 hover:bg-white hover:text-brand",
      )}
    >
      {active ? (
        <>
          <span aria-hidden className="pointer-events-none absolute -top-5 right-0 h-5 w-5 bg-[radial-gradient(circle_at_0_0,transparent_19.5px,#fff_20px)]" />
          <span aria-hidden className="pointer-events-none absolute -bottom-5 right-0 h-5 w-5 bg-[radial-gradient(circle_at_0_100%,transparent_19.5px,#fff_20px)]" />
        </>
      ) : null}
      <Icon name={item.icon} size={21} className={active ? "text-brand" : "text-white/80 group-hover:text-brand"} />
      <span className="min-w-0 flex-1 truncate">
        {item.label}
        {item.suffix ? (
          <span className={active ? "font-normal text-faint" : "text-white/50 group-hover:text-faint"}> {item.suffix}</span>
        ) : null}
      </span>
      {badge ? (
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-[9.5px] font-semibold",
            active ? "bg-brand-soft text-brand" : "bg-white/20 text-white group-hover:bg-brand-soft group-hover:text-brand",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export type NavItem = (typeof NAV)[number];

export function Sidebar({
  active,
  onNavigate,
  open,
  onClose,
  primary = NAV,
  secondary = NAV_SECONDARY,
  subtitle = "Community Admin",
  badges,
  header,
}: {
  active: PageKey;
  onNavigate: (key: PageKey) => void;
  open: boolean;
  onClose: () => void;
  /** Menu items; defaults to the platform admin menu. */
  primary?: NavItem[];
  secondary?: NavItem[];
  subtitle?: string;
  badges?: Partial<Record<PageKey, number>>;
  /** Shown under the logo, e.g. a chapter switcher. */
  header?: ReactNode;
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      ) : null}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-[240px] transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-brand pb-5 pl-4 pt-6 [scrollbar-color:rgba(255,255,255,0.25)_transparent]">
          <div className="mb-7 flex items-center gap-3 pl-1 pr-4">
            <CycLogo size={42} />
            <div className="min-w-0">
              <p className="text-[19.5px] font-extrabold leading-none tracking-tight text-white">CYC</p>
              <p className="mt-1 truncate text-[12.5px] text-white/70">{subtitle}</p>
            </div>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className="ml-auto rounded-lg p-1.5 text-white/80 hover:bg-white/10 lg:hidden"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          {header ? <div className="-mt-3 mb-6 pr-4">{header}</div> : null}

          <nav aria-label="Main" className="space-y-1">
            {primary.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={active === item.key}
                badge={badges?.[item.key]}
                onClick={() => onNavigate(item.key)}
              />
            ))}
          </nav>

          {secondary.length ? (
            <>
              <div className="my-5 ml-5 mr-8 h-px bg-white/15" />
              <nav aria-label="Management" className="space-y-1">
                {secondary.map((item) => (
                  <NavButton
                    key={item.key}
                    item={item}
                    active={active === item.key}
                    badge={badges?.[item.key]}
                    onClick={() => onNavigate(item.key)}
                  />
                ))}
              </nav>
            </>
          ) : null}

          <p className="mt-auto px-5 pt-8 text-[9.5px] leading-5 text-white/55">
            Christ Youth Club
            <br />
            Working together with Christ
          </p>
        </div>
      </aside>
    </>
  );
}

export function Topbar({
  placeholder,
  search,
  onSearch,
  onMenu,
  onSignOut,
  onBell,
  me,
  hasUnread,
}: {
  placeholder: string;
  search: string;
  onSearch: (value: string) => void;
  onMenu: () => void;
  onSignOut: () => void;
  onBell: () => void;
  me: { name: string; email: string; avatar?: string | null; role?: string } | null;
  hasUnread: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setMenu(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const name = me?.name || "Admin";

  return (
    <header className="flex items-center gap-3 pb-2 pt-1 sm:gap-4">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onMenu}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      <label className="relative ml-auto block w-full max-w-[480px] min-w-0">
        <span className="sr-only">Search</span>
        <Icon
          name="search"
          size={20}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/70"
        />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-full border border-line bg-white pl-12 pr-4 text-[13px] text-ink shadow-[0_1px_2px_rgba(30,20,10,0.03)] outline-none placeholder:text-faint focus:border-brand/40 focus:ring-4 focus:ring-brand-soft"
        />
      </label>

      <button
        type="button"
        aria-label="Notifications"
        onClick={onBell}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink shadow-[0_1px_2px_rgba(30,20,10,0.03)] hover:bg-canvas"
      >
        <Icon name="bell" size={22} />
        {hasUnread ? (
          <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" />
        ) : null}
      </button>

      <div ref={ref} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          className="flex items-center gap-2 rounded-full"
        >
          <Avatar name={name} src={me?.avatar} size={40} />
          <span className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-white sm:flex">
            <Icon name="chevronDown" size={18} />
          </span>
          <span className="sr-only">Account menu</span>
        </button>
        {menu ? (
          <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <Avatar name={name} src={me?.avatar} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{name}</p>
                <p className="truncate text-xs text-muted">{me?.email}</p>
              </div>
            </div>
            <button
              role="menuitem"
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-brand hover:bg-canvas"
            >
              <Icon name="logout" size={17} />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function ShellFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand text-ink">
      {sidebar}
      {/* White page inset in the brand-coloured frame; it scrolls, the frame stays put. */}
      <div
        id="main-scroll"
        className="fixed inset-2 overflow-y-auto rounded-[22px] bg-white sm:inset-3 sm:rounded-[28px] lg:left-[240px]"
      >
        <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-4 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

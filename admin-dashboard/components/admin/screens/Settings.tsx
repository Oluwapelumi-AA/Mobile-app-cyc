"use client";

import { useCallback, useEffect, useState } from "react";
import { api, useAdmin } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { CycLogo, Icon, type IconName } from "../icons";
import {
  Card,
  CardHeader,
  PageHeader,
  SampleTag,
  StatusBadge,
  Tabs,
  Toggle,
  cx,
  formatDateTime,
  formatNumber,
} from "../ui";

type TabKey =
  | "general"
  | "platform"
  | "roles"
  | "content"
  | "courses"
  | "notifications"
  | "integrations"
  | "security"
  | "appearance";

const TABS: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "platform", label: "Platform" },
  { key: "roles", label: "Users & Roles" },
  { key: "content", label: "Content" },
  { key: "courses", label: "Courses & Certificates" },
  { key: "notifications", label: "Notifications" },
  { key: "integrations", label: "Integrations" },
  { key: "security", label: "Security" },
  { key: "appearance", label: "Appearance" },
];

const APP_SETTINGS: { key: string; title: string; hint: string; on: boolean }[] = [
  { key: "registrations", title: "Allow new user registrations", hint: "Let new users create accounts on the platform.", on: true },
  { key: "emailVerification", title: "Email verification", hint: "Require email verification for new accounts.", on: true },
  { key: "moderatePosts", title: "Moderate new posts", hint: "Require approval for new posts and comments.", on: false },
  { key: "live", title: "Enable live streaming", hint: "Allow users to create and join live sessions.", on: true },
  { key: "courses", title: "Enable courses and quizzes", hint: "Allow access to courses, quizzes and certificates.", on: true },
  { key: "communities", title: "Enable communities", hint: "Allow users to create and join communities.", on: true },
];

const ROLES = [
  ["Super Admin", "Full access to all features", "2"],
  ["Admin", "Access to most features", "5"],
  ["Moderator", "Can moderate content", "12"],
  ["Instructor", "Can create courses", "8"],
  ["Community Leader", "Can manage communities", "18"],
  ["User", "Standard access", "2,249"],
];

const INTEGRATIONS: { icon: IconName; name: string; hint: string; connected: boolean; tile: string }[] = [
  { icon: "mail", name: "Email (SMTP)", hint: "Send email notifications", connected: true, tile: "text-ink" },
  { icon: "bell", name: "Push Notifications", hint: "Send push notifications", connected: true, tile: "text-brand" },
  { icon: "video", name: "Live Streaming (RTMP)", hint: "Enable live video sessions", connected: true, tile: "text-ink" },
  { icon: "creditCard", name: "Payment Gateway", hint: "Handle course payments", connected: false, tile: "text-ink" },
  { icon: "cloud", name: "Cloud Storage (AWS)", hint: "Store media files", connected: true, tile: "text-sky-600" },
  { icon: "barChart", name: "Analytics (Google)", hint: "Track platform analytics", connected: true, tile: "text-ink" },
];

const STORAGE = [
  { label: "Videos", gb: 6.2, color: "#b3141b" },
  { label: "Images", gb: 3.1, color: "#ec4f7a" },
  { label: "Documents", gb: 1.8, color: "#9333ea" },
  { label: "Other", gb: 1.3, color: "#2563eb" },
];

const STORE_KEY = "cyc-admin-settings";

type Saved = { name?: string; description?: string; toggles?: Record<string, boolean> };

function readSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

export default function Settings() {
  const { overview } = useAdmin();
  const [tab, setTab] = useState<TabKey>("general");
  const [saved] = useState(readSaved);
  const [name, setName] = useState(saved.name ?? "CYC");
  const [description, setDescription] = useState(
    saved.description ?? "A community platform for spiritual growth, learning and meaningful connections.",
  );
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(APP_SETTINGS.map((s) => [s.key, s.on])),
    ...saved.toggles,
  }));
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; checked: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      await api("health");
      setHealth({ ok: true, checked: new Date().toISOString() });
    } catch {
      setHealth({ ok: false, checked: new Date().toISOString() });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("health")
      .then(() => !cancelled && setHealth({ ok: true, checked: new Date().toISOString() }))
      .catch(() => !cancelled && setHealth({ ok: false, checked: new Date().toISOString() }));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = () => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ name, description, toggles }));
    } catch {
      /* ignore */
    }
    setDirty(false);
    toast.success("Saved on this browser. A settings API is needed to apply these platform-wide.");
  };

  const danger = (title: string) =>
    ask({
      title,
      message: "This is irreversible and affects every member. It isn't available from the dashboard — it must be run by an engineer with database access.",
      confirmLabel: "I understand",
      danger: true,
      onConfirm: () => toast.error(`${title} is disabled in the dashboard.`),
    });

  const usedGb = STORAGE.reduce((s, x) => s + x.gb, 0);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your platform settings, preferences and integrations."
        action={
          <div className="flex items-center gap-3">
            <SampleTag reason="Platform settings don't have a backend endpoint yet; changes are saved in this browser only." />
            {dirty ? (
              <button type="button" onClick={save} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
                Save changes
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <Card className="px-4 pt-3 sm:px-5">
            <Tabs size="sm" tabs={TABS} value={tab} onChange={setTab} />
          </Card>

          {tab === "general" ? (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <CardHeader title="Basic information" subtitle="Update your platform details and branding." />
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <CycLogo size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-extrabold text-ink">{name || "—"}</p>
                    <p className="text-[15px] text-muted">Community Platform</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => toast.error("Logo upload needs a settings API.")} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas">Change logo</button>
                    <button type="button" aria-label="Remove logo" onClick={() => toast.error("Logo removal needs a settings API.")} className="rounded-xl border border-line px-3 py-2.5 text-brand hover:bg-brand-soft"><Icon name="trash" size={18} /></button>
                  </div>
                </div>
                <label className="mt-6 block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">Platform name</span>
                  <input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" />
                  <span className="mt-1.5 block text-[13px] text-muted">This name will appear across the platform.</span>
                </label>
                <label className="mt-5 block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">Platform description</span>
                  <textarea value={description} maxLength={200} rows={3} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" />
                  <span className="block text-right text-xs text-muted">{description.length}/200</span>
                </label>
              </Card>

              <Card className="p-5">
                <CardHeader title="App settings" subtitle="Configure key platform preferences." />
                <ul className="mt-4 space-y-4">
                  {APP_SETTINGS.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-ink">{s.title}</p>
                        <p className="text-[13px] text-muted">{s.hint}</p>
                      </div>
                      <Toggle label={s.title} checked={toggles[s.key]} onChange={(v) => { setToggles((t) => ({ ...t, [s.key]: v })); setDirty(true); }} />
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-5">
                <CardHeader title="User roles and permissions" subtitle="Manage roles and access levels." action={<button type="button" onClick={() => setTab("roles")} className="whitespace-nowrap rounded-xl border border-line px-3 py-2 text-[13px] font-medium hover:bg-canvas">Manage roles</button>} />
                <div className="scroll-thin mt-4 overflow-x-auto">
                  <table className="w-full min-w-[360px] text-left text-[13px]">
                    <thead>
                      <tr className="bg-canvas/70 text-[13px] text-ink/70">
                        <th className="rounded-l-lg px-2 py-2 font-medium">Role</th>
                        <th className="px-2 py-2 font-medium">Description</th>
                        <th className="px-2 py-2 font-medium">Users</th>
                        <th className="rounded-r-lg px-2 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROLES.map(([role, desc, users]) => (
                        <tr key={role} className="border-b border-line/70 last:border-0">
                          <td className="whitespace-nowrap px-2 py-2.5 text-ink">{role}</td>
                          <td className="px-2 py-2.5 leading-snug text-ink/75">{desc}</td>
                          <td className="px-2 py-2.5">{role === "User" && overview ? formatNumber(overview.users) : users}</td>
                          <td className="px-2 py-2.5"><StatusBadge status="Active" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <CardHeader title="Integrations" subtitle="Connect with third-party services." action={<button type="button" onClick={() => setTab("integrations")} className="whitespace-nowrap rounded-xl border border-line px-3 py-2 text-[13px] font-medium hover:bg-canvas">Manage integrations</button>} />
                <ul className="mt-4 divide-y divide-line">
                  {INTEGRATIONS.map((i) => (
                    <li key={i.name}>
                      <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left">
                        <Icon name={i.icon} size={24} className={i.tile} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium text-ink">{i.name}</span>
                          <span className="block text-[13px] text-muted">{i.hint}</span>
                        </span>
                        <StatusBadge status={i.connected ? "Connected" : "Not connected"} />
                        <Icon name="chevronRight" size={18} className="text-ink/60" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : (
            <Card className="mt-4 p-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon name="settings" size={26} /></span>
              <h2 className="mt-4 text-lg font-bold text-ink">{TABS.find((t) => t.key === tab)?.label}</h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                This settings group will be designed with its backend. General settings are available now.
              </p>
              <button type="button" onClick={() => setTab("general")} className="mt-5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas">Back to General</button>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Platform status" action={<button type="button" onClick={() => void checkHealth()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">View status <Icon name="arrowRight" size={16} /></button>} />
            <span className={cx("mt-3 inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium", health === null ? "bg-canvas text-muted" : health.ok ? "bg-emerald-50 text-emerald-700" : "bg-brand-soft text-brand")}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {health === null ? "Checking…" : health.ok ? "All systems operational" : "API unreachable"}
            </span>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {([
                ["server", health?.ok ? "Online" : health ? "Down" : "—", "API"],
                ["users", overview ? formatNumber(overview.active_users) : "—", "Active users"],
                ["database", health?.ok ? "Healthy" : health ? "Unknown" : "—", "Database"],
              ] as const).map(([icon, v, l]) => (
                <div key={l} className="rounded-xl border border-line p-3 text-center">
                  <Icon name={icon} size={24} className="mx-auto text-ink/80" />
                  <p className="mt-2 text-lg font-bold text-ink">{v}</p>
                  <p className="text-xs text-muted">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
              <span>Last checked: {health ? formatDateTime(health.checked) : "—"}</span>
              <button type="button" disabled={checking} onClick={() => void checkHealth()} className="inline-flex items-center gap-1.5 font-medium text-emerald-700 disabled:opacity-50">
                <Icon name="refresh" size={15} />Refresh
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Storage usage" action={<button type="button" className="text-sm font-semibold text-brand">Manage</button>} />
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(usedGb / 50) * 100}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="font-medium text-ink">{usedGb.toFixed(1)} GB of 50 GB used</span>
              <span className="font-semibold text-ink">{Math.round((usedGb / 50) * 100)}%</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {STORAGE.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} />
                  <span className="flex-1 text-ink/85">{s.label}</span>
                  <span className="w-16 text-right tabular-nums">{s.gb} GB</span>
                  <span className="w-10 text-right tabular-nums text-ink/70">{Math.round((s.gb / usedGb) * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {([
                ["database", "Clear cache"],
                ["cloud", "Backup data"],
                ["download", "Export settings"],
                ["fileText", "View system logs"],
              ] as const).map(([icon, label]) => (
                <button key={label} type="button" onClick={() => label === "Export settings" ? (() => {
                  const url = URL.createObjectURL(new Blob([JSON.stringify({ name, description, toggles }, null, 2)], { type: "application/json" }));
                  const a = document.createElement("a"); a.href = url; a.download = "cyc-settings.json"; a.click(); URL.revokeObjectURL(url);
                })() : toast.error(`${label} needs a backend job.`)} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3.5 text-left text-sm font-medium text-ink hover:bg-canvas">
                  <Icon name={icon} size={20} />{label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-bold text-brand">Danger zone</h2>
            <p className="mt-0.5 text-sm text-muted">These actions are irreversible. Please proceed with caution.</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => danger("Reset platform data")} className="flex items-center justify-center gap-2 rounded-xl border border-brand/40 px-3 py-3.5 text-sm font-semibold text-brand hover:bg-brand-soft"><Icon name="rotate" size={18} />Reset platform data</button>
              <button type="button" onClick={() => danger("Delete platform")} className="flex items-center justify-center gap-2 rounded-xl border border-brand/40 px-3 py-3.5 text-sm font-semibold text-brand hover:bg-brand-soft"><Icon name="trash" size={18} />Delete platform</button>
            </div>
          </Card>
        </div>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

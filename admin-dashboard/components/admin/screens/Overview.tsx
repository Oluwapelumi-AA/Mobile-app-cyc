"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { type PageKey, useAdmin, useDirectory, useLiveList } from "../data";
import { Icon, type IconName } from "../icons";
import { type ApiAudit, type ApiReport, mapAudit, mapReport, withNames } from "../mappers";
import { sampleActivitySeries, sampleAudit, sampleReports } from "../sample";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Delta,
  RangeSelect,
  SampleTag,
  smoothPath,
  Sparkline,
  StatusBadge,
  Thumb,
  ViewAll,
  formatNumber,
  timeAgo,
} from "../ui";
import { reasonTone } from "./Reports";

const SERIES = [
  { key: "posts", label: "Posts", color: "#860000", fill: true },
  { key: "comments", label: "Comments", color: "#c98a8a", fill: false },
  { key: "users", label: "New users", color: "#a34a4a", fill: false },
] as const;

function ActivityChart({ days }: { days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const len = Math.min(days, 30);
    const s = sampleActivitySeries;
    const pick = (arr: number[]) => arr.slice(arr.length - len);
    return { posts: pick(s.posts), comments: pick(s.comments), users: pick(s.users) };
  }, [days]);
  const [today] = useState(() => Date.now());
  const labels = useMemo(() => {
    const n = data.posts.length;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(today - (n - 1 - i) * 86400000);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
  }, [data.posts.length, today]);

  const W = 820;
  const H = 230;
  const padL = 34;
  const padB = 26;
  const max = 200;
  const n = data.posts.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - 8);
  const y = (v: number) => 8 + (1 - v / max) * (H - padB - 8);
  const ticks = [0, 50, 100, 150, 200];
  // ~7 evenly spaced date labels, always including the first and last day.
  const ticksAt = new Set(Array.from({ length: 7 }, (_, k) => Math.round((k * (n - 1)) / 6)));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Community activity over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - padL) / (W - padL - 8)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        <defs>
          <linearGradient id="actFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b05a5a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#b05a5a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#efefef" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#6b6662">
              {t}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          ticksAt.has(i) ? (
            <text key={l + i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="12" fill="#6b6662">
              {l}
            </text>
          ) : null,
        )}
        {SERIES.map((s) => {
          const pts = data[s.key].map((v, i) => [x(i), y(v)]);
          const d = smoothPath(pts);
          return (
            <g key={s.key}>
              {s.fill ? (
                <path d={`${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#actFill)" />
              ) : null}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={8} y2={y(0)} stroke="#121212" strokeOpacity="0.25" strokeDasharray="3 3" />
            {SERIES.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(data[s.key][hover])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > n / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <p className="mb-1 font-semibold text-ink">{labels[hover]}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-ink/80">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums text-ink">{data[s.key][hover]}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  delta,
  goodWhenUp,
  note,
  trend,
}: {
  icon: IconName;
  label: string;
  value: string;
  delta?: number;
  goodWhenUp?: boolean;
  note: string;
  trend: number[];
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 transition hover:shadow-[0_8px_24px_-12px_rgba(134,0,0,0.25)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[28px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {delta !== undefined ? <Delta value={delta} goodWhenUp={goodWhenUp} /> : null}
            <span className="truncate">{note}</span>
          </p>
        </div>
        <Sparkline data={trend} className="h-10 w-20 shrink-0" />
      </div>
    </Card>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative mx-auto h-[150px] w-[150px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f6e6e6" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#860000"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-bold leading-none tracking-tight text-ink tabular-nums">{pct}%</span>
        <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      </div>
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-muted">{label}</span>
        <span className="text-[15px] font-semibold text-ink tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const QUICK_LINKS: { key: PageKey; label: string; icon: IconName }[] = [
  { key: "reports", label: "Reports", icon: "flag" },
  { key: "users", label: "Users", icon: "user" },
  { key: "communities", label: "Departments", icon: "community" },
  { key: "posts", label: "Posts", icon: "message" },
  { key: "events", label: "Events", icon: "calendar" },
  { key: "live", label: "Live and video", icon: "video" },
  { key: "resources", label: "Resources", icon: "book" },
  { key: "notifications", label: "Announce", icon: "megaphone" },
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export default function Overview() {
  const { overview, navigate } = useAdmin();
  const [range, setRange] = useState("30");
  const [todayLabel] = useState(() =>
    new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  );

  const reports = useLiveList<ApiReport, ReturnType<typeof mapReport>>(
    "moderation/reports?status=any&limit=5",
    mapReport,
    sampleReports.slice(0, 5),
  );
  const audit = useLiveList<ApiAudit, ReturnType<typeof mapAudit>>(
    "moderation/audit-logs?limit=5",
    mapAudit,
    sampleAudit.slice(0, 5),
  );

  const dir = useDirectory(reports.mode === "live" || audit.mode === "live");
  const reportRows = withNames(reports.items, dir);
  const auditRows = withNames(audit.items, dir);
  const live = overview !== null;

  const openReports = live ? overview.open_reports : 128;
  const upcomingEvents = live ? overview.upcoming_events : 6;
  const activeShare = live ? pct(overview.active_users, overview.users) : 82;
  const newShare = live ? pct(overview.new_users_last_7_days, overview.users) : 7;
  const resolvedShare = pct(
    reportRows.filter((r) => r.status === "Resolved" || r.status === "Dismissed").length,
    reportRows.length,
  );

  const kpis = [
    {
      icon: "users" as const,
      label: "Total members",
      value: live ? formatNumber(overview.users) : "2,841",
      delta: live ? undefined : 8,
      note: live ? `+${formatNumber(overview.new_users_last_7_days)} this week` : "+203 this week",
      trend: [4, 5, 4, 6, 5, 7, 6, 8, 9],
    },
    {
      icon: "community" as const,
      label: "Departments",
      value: live ? formatNumber(overview.communities) : "36",
      delta: live ? undefined : 3,
      note: live ? `${formatNumber(overview.branches)} chapters` : "4 new this month",
      trend: [3, 4, 3, 5, 4, 5, 6, 7, 8],
    },
    {
      icon: "file" as const,
      label: live ? "Posts this week" : "Posts and comments",
      value: live ? formatNumber(overview.posts_last_7_days) : "1,245",
      delta: live ? undefined : -12,
      note: live ? `${formatNumber(overview.upcoming_events)} upcoming events` : "189 new today",
      trend: [6, 5, 6, 4, 5, 4, 5, 6, 7],
    },
    {
      icon: "flag" as const,
      label: "Open reports",
      value: formatNumber(openReports),
      delta: live ? undefined : 18,
      goodWhenUp: false,
      note: "Awaiting review",
      trend: [3, 4, 5, 4, 6, 5, 7, 6, 8],
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">{todayLabel}</p>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-[13.5px] text-muted">Here is what is happening across CYC today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!live ? <SampleTag reason="Headline numbers will appear once /admin/overview responds." /> : null}
          <button
            type="button"
            onClick={() => navigate("reports")}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-canvas"
          >
            <Icon name="flag" size={16} />
            Review reports
          </button>
          <button
            type="button"
            onClick={() => navigate("notifications")}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-brand-dark"
          >
            <Icon name="megaphone" size={16} />
            New announcement
          </button>
        </div>
      </div>

      {/* Attention banner */}
      <section className="relative mb-5 overflow-hidden rounded-2xl bg-[linear-gradient(110deg,#5c0000_0%,#860000_55%,#a51c1c_100%)] p-6 text-white">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <Image
          src="/cyc-crest.png"
          alt=""
          width={180}
          height={180}
          className="pointer-events-none absolute -bottom-10 right-6 hidden h-[180px] w-[180px] opacity-20 md:block"
        />
        <div className="relative max-w-xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">Needs your attention</p>
          <h2 className="mt-2 text-[20px] font-semibold leading-snug">
            {formatNumber(openReports)} open {openReports === 1 ? "report" : "reports"} and {formatNumber(upcomingEvents)} upcoming{" "}
            {upcomingEvents === 1 ? "event" : "events"}
          </h2>
          <p className="mt-1.5 text-[13px] text-white/75">Keep the community safe by reviewing new reports first.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => navigate("reports")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-brand hover:bg-white/90"
            >
              Open moderation queue
              <Icon name="arrowRight" size={15} />
            </button>
            <button
              type="button"
              onClick={() => navigate("events")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/10"
            >
              See events
            </button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      {/* Activity + health */}
      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CardHeader
            title="Community activity"
            subtitle="Posts, comments and new members"
            action={
              <div className="flex items-center gap-2">
                <SampleTag reason="Trend data needs an analytics endpoint; this chart shows sample values." />
                <RangeSelect value={range} onChange={setRange} />
              </div>
            }
          />
          <ul className="mb-2 mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
          <ActivityChart days={Number(range)} />
        </Card>

        <Card className="flex flex-col p-5">
          <CardHeader title="Community health" subtitle={live ? "Share of members active" : "Sample figures"} />
          <div className="my-5">
            <Ring value={activeShare} label="Active" />
          </div>
          <div className="mt-auto space-y-4">
            <Meter label="Reports resolved (latest)" value={resolvedShare} color="#860000" />
            <Meter label="New members this week" value={newShare} color="#c98a8a" />
          </div>
        </Card>
      </div>

      {/* Reports + activity */}
      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CardHeader
            title="Recent reports"
            subtitle="Latest content flagged by members"
            action={
              <div className="flex items-center gap-3">
                {reports.mode === "sample" ? <SampleTag reason={reports.error} /> : null}
                <ViewAll onClick={() => navigate("reports")} />
              </div>
            }
          />
          <ul className="mt-4 divide-y divide-line">
            {reportRows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate("reports")}
                  className="flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left transition hover:bg-canvas"
                >
                  <Thumb seed={r.id} width={38} height={38} rounded="rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {r.targetType} · {r.community} · reported by {r.reporter}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <Badge tone={reasonTone(r.reason)}>{r.reason}</Badge>
                  </span>
                  <span className="w-[92px] text-right">
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="hidden w-[78px] text-right text-[11.5px] text-muted md:block">{timeAgo(r.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {reports.mode === "loading" ? <p className="py-10 text-center text-sm text-muted">Loading reports…</p> : null}
          {reports.mode === "empty" ? <p className="py-10 text-center text-sm text-muted">No reports right now.</p> : null}
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Admin activity"
            action={
              <div className="flex items-center gap-3">
                {audit.mode === "sample" ? <SampleTag reason={audit.error} /> : null}
                <ViewAll onClick={() => navigate("audit")} />
              </div>
            }
          />
          <ol className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
            {auditRows.map((a) => (
              <li key={a.id} className="relative flex gap-3">
                <span className="relative z-10 rounded-full ring-4 ring-white">
                  <Avatar name={a.actor} size={30} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-ink">
                    <span className="font-semibold">{a.actor}</span>{" "}
                    <span className="text-ink/75">
                      {a.action.toLowerCase()} {a.module.toLowerCase()}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted">{a.details}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{timeAgo(a.at)}</p>
                </div>
              </li>
            ))}
          </ol>
          {audit.mode === "loading" ? <p className="py-10 text-center text-sm text-muted">Loading activity…</p> : null}
        </Card>
      </div>

      {/* Quick access */}
      <Card className="p-5">
        <CardHeader title="Quick access" subtitle="Jump straight to a section" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {QUICK_LINKS.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => navigate(q.key)}
              className="group flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_20px_-12px_rgba(134,0,0,0.35)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                <Icon name={q.icon} size={20} />
              </span>
              <span className="text-[12.5px] font-medium text-ink">{q.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

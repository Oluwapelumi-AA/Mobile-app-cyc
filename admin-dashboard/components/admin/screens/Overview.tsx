"use client";

import { useMemo, useState } from "react";
import { useAdmin, useDirectory, useLiveList } from "../data";
import { Icon } from "../icons";
import { type ApiAudit, type ApiReport, mapAudit, mapReport, withNames } from "../mappers";
import { sampleActivitySeries, sampleAudit, sampleReports } from "../sample";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  KpiCard,
  LinkRow,
  PageHeader,
  RangeSelect,
  RowMenu,
  SampleTag,
  smoothPath,
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

  const W = 560;
  const H = 210;
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
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#efebe8" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b6662">
              {t}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          ticksAt.has(i) ? (
            <text key={l + i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="#6b6662">
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

export default function Overview() {
  const { overview, navigate } = useAdmin();
  const [range, setRange] = useState("30");
  const [allSections, setAllSections] = useState(false);

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
  const kpis = [
    {
      icon: "users" as const,
      label: "Total users",
      value: live ? formatNumber(overview.users) : "2,841",
      delta: live ? undefined : 8,
      note: live ? `+${formatNumber(overview.new_users_last_7_days)} this week` : "+203 this week",
      trend: [4, 5, 4, 6, 5, 7, 6, 8, 9],
    },
    {
      icon: "community" as const,
      label: "Communities",
      value: live ? formatNumber(overview.communities) : "36",
      delta: live ? undefined : 3,
      note: live ? `${formatNumber(overview.branches)} branches` : "4 new this month",
      trend: [3, 4, 3, 5, 4, 5, 6, 7, 8],
    },
    {
      icon: "file" as const,
      label: live ? "Posts (7 days)" : "Posts & comments",
      value: live ? formatNumber(overview.posts_last_7_days) : "1,245",
      delta: live ? undefined : -12,
      note: live ? `${formatNumber(overview.upcoming_events)} upcoming events` : "189 new today",
      trend: [6, 5, 6, 4, 5, 4, 5, 6, 7],
    },
    {
      icon: "flag" as const,
      label: "Open reports",
      value: live ? formatNumber(overview.open_reports) : "128",
      delta: live ? undefined : 18,
      goodWhenUp: false,
      note: live ? "Awaiting review" : "26 pending review",
      trend: [3, 4, 5, 4, 6, 5, 7, 6, 8],
    },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Monitor your community and keep it safe."
        action={!live ? <SampleTag reason="Headline numbers will appear once /admin/overview responds." /> : null}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <CardHeader
            title="Community activity"
            action={
              <div className="flex items-center gap-2">
                <SampleTag reason="Trend data needs an analytics endpoint; this chart shows sample values." />
                <RangeSelect value={range} onChange={setRange} />
              </div>
            }
          />
          <ul className="mb-2 mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-ink/80">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
          <ActivityChart days={Number(range)} />
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Recent reports"
            action={
              <div className="flex items-center gap-3">
                {reports.mode === "sample" ? <SampleTag reason={reports.error} /> : null}
                <ViewAll onClick={() => navigate("reports")} />
              </div>
            }
          />
          <div className="scroll-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[500px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[12.5px] text-ink/70">
                  {["Content", "Type", "Reported by", "Status", "Time"].map((h) => (
                    <th key={h} className="whitespace-nowrap bg-canvas/70 px-2 py-2.5 font-medium first:rounded-l-lg last:rounded-r-lg">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((r) => (
                  <tr key={r.id} className="cursor-pointer text-[13px] hover:bg-canvas/40" onClick={() => navigate("reports")}>
                    <td className="border-b border-line/70 px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Thumb seed={r.id} width={34} height={34} rounded="rounded-md" />
                        <div className="min-w-0">
                          <p className="max-w-[120px] truncate font-medium text-ink">{r.title}</p>
                          <p className="max-w-[120px] truncate text-xs text-muted">
                            {r.targetType} · {r.community}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-line/70 px-2">
                      <Badge tone={reasonTone(r.reason)}>{r.reason}</Badge>
                    </td>
                    <td className="whitespace-nowrap border-b border-line/70 px-2 text-ink/80">{r.reporter}</td>
                    <td className="border-b border-line/70 px-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap border-b border-line/70 px-2 text-ink/70">{timeAgo(r.createdAt)}</td>
                  </tr>
                ))}
                {reports.mode === "loading" ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted">
                      Loading reports…
                    </td>
                  </tr>
                ) : null}
                {reports.mode === "empty" ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted">
                      No reports right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <CardHeader
            title="Recent activity"
            action={
              <div className="flex items-center gap-3">
                {audit.mode === "sample" ? <SampleTag reason={audit.error} /> : null}
                <ViewAll onClick={() => navigate("audit")} />
              </div>
            }
          />
          <div className="scroll-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[12.5px] text-ink/70">
                  {["Admin", "Action", "Details", "Time", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap bg-canvas/70 px-2 py-2.5 font-medium first:rounded-l-lg last:rounded-r-lg">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditRows.map((a) => (
                  <tr key={a.id} className="text-[13px]">
                    <td className="border-b border-line/70 px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={a.actor} size={30} />
                        <span className="whitespace-nowrap font-medium text-ink">{a.actor}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-line/70 px-2 text-ink/75">
                      {a.action} {a.module.toLowerCase()}
                    </td>
                    <td className="max-w-[220px] truncate border-b border-line/70 px-2 text-ink/75">{a.details}</td>
                    <td className="whitespace-nowrap border-b border-line/70 px-2 text-ink/70">{timeAgo(a.at)}</td>
                    <td className="border-b border-line/70 px-1">
                      <RowMenu actions={[{ label: "Open audit log", icon: "file", onSelect: () => navigate("audit") }]} />
                    </td>
                  </tr>
                ))}
                {audit.mode === "loading" ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted">
                      Loading activity…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title="Quick access" subtitle="Go to the most important sections" />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LinkRow icon="flag" title="Manage reports" subtitle="Review and take action" onClick={() => navigate("reports")} />
            <LinkRow icon="user" title="View users" subtitle="Manage accounts" onClick={() => navigate("users")} />
            <LinkRow icon="community" title="Manage communities" subtitle="View and moderate" onClick={() => navigate("communities")} />
            <LinkRow icon="cap" title="Manage courses" subtitle="Create and track courses" onClick={() => navigate("courses")} />
          </div>
          {allSections ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LinkRow icon="message" title="Posts and comments" subtitle="Moderate content" onClick={() => navigate("posts")} />
              <LinkRow icon="calendar" title="Events" subtitle="Plan and publish events" onClick={() => navigate("events")} />
              <LinkRow icon="video" title="Live and video" subtitle="Broadcasts and recordings" onClick={() => navigate("live")} />
              <LinkRow icon="book" title="Spiritual resources" subtitle="Sermons and devotionals" onClick={() => navigate("resources")} />
              <LinkRow icon="branch" title="Branches" subtitle="Chapters worldwide" onClick={() => navigate("branches")} />
              <LinkRow icon="bell" title="Notifications" subtitle="Send announcements" onClick={() => navigate("notifications")} />
              <LinkRow icon="file" title="Audit log" subtitle="Track admin actions" onClick={() => navigate("audit")} />
              <LinkRow icon="settings" title="Settings" subtitle="Platform preferences" onClick={() => navigate("settings")} />
            </div>
          ) : null}
          <button
            type="button"
            aria-expanded={allSections}
            onClick={() => setAllSections((v) => !v)}
            className="mt-3 flex w-full items-center gap-3 rounded-xl bg-brand-soft/70 px-4 py-3.5 text-left text-[15px] text-ink hover:bg-brand-soft"
          >
            <Icon name="fileText" size={20} />
            <span className="flex-1">{allSections ? "Show fewer sections" : "View all sections"}</span>
            <Icon name={allSections ? "chevronDown" : "chevronRight"} size={18} />
          </button>
        </Card>
      </div>
    </>
  );
}

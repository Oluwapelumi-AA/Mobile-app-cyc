"use client";

import { useMemo, useState } from "react";
import { downloadCsv, matches, useAdmin, useDirectory, useLiveList } from "../data";
import { Icon, type IconName } from "../icons";
import { type ApiAudit, mapAudit, withNames } from "../mappers";
import { type AuditRow, sampleAudit } from "../sample";
import {
  Avatar,
  Badge,
  BarList,
  Card,
  CardHeader,
  Checkbox,
  DateRangeChip,
  DateTimeCell,
  EmptyRow,
  LoadingRows,
  MiniStat,
  PageHeader,
  Pagination,
  QuickTile,
  RangeSelect,
  RowMenu,
  SampleTag,
  SearchField,
  SelectField,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  type Tone,
  ViewAll,
  cx,
  formatDateTime,
  usePaged,
  useSelection,
} from "../ui";
import { Modal } from "../dialogs";

const ACTION_TONE: Record<string, Tone> = {
  Updated: "blue",
  Deleted: "red",
  Approved: "green",
  Created: "purple",
  Published: "green",
  System: "gray",
  Suspended: "amber",
  Banned: "red",
  Edited: "purple",
  Login: "gray",
  Archived: "amber",
  Restored: "green",
  Reinstated: "green",
  Unbanned: "green",
};

const ACTION_COLOR: Record<string, string> = {
  Login: "#c0262d",
  Created: "#9333ea",
  Updated: "#2563eb",
  Deleted: "#f43f5e",
  Approved: "#059669",
  Suspended: "#f97316",
  Published: "#eab308",
};

const ACTIVITY_ICON: Record<string, [IconName, string]> = {
  Updated: ["shieldCheck", "bg-sky-50 text-sky-700"],
  Deleted: ["trash", "bg-rose-50 text-rose-600"],
  Approved: ["user", "bg-emerald-50 text-emerald-600"],
  Created: ["calendar", "bg-violet-50 text-violet-600"],
  Published: ["checkCircle", "bg-emerald-50 text-emerald-600"],
};

type TabKey = "all" | AuditRow["category"];

export default function Audit() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiAudit, AuditRow>("moderation/audit-logs?limit=100", mapAudit, sampleAudit);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [range, setRange] = useState("30");
  const [perPage, setPerPage] = useState("10");
  const [desc, setDesc] = useState(true);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const sample = data.mode === "sample";

  const dir = useDirectory(data.mode === "live");
  const items = useMemo(() => withNames(data.items, dir), [data.items, dir]);
  const uniq = (fn: (a: AuditRow) => string) => [...new Set(items.map(fn))];
  const filtered = items
    .filter(
      (a) =>
        (tab === "all" || a.category === tab) &&
        (action === "all" || a.action === action) &&
        (actor === "all" || a.actor === actor) &&
        (moduleFilter === "all" || a.module === moduleFilter) &&
        matches(search || globalSearch, a.actor, a.action, a.module, a.details, a.ip),
    )
    .sort((a, b) => (desc ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
  const paged = usePaged(filtered, Number(perPage));
  const sel = useSelection(paged.slice.map((a) => a.id));
  const count = (c: AuditRow["category"]) => items.filter((a) => a.category === c).length;

  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((a) => m.set(a.action, (m.get(a.action) ?? 0) + 1));
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7).map(([label, value]) => ({ label, value, color: ACTION_COLOR[label] ?? "#9ca3af" }));
    const rest = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    if (rest) top.push({ label: "Other", value: rest, color: "#9ca3af" });
    return top;
  }, [items]);

  const exportLogs = () =>
    downloadCsv(
      "cyc-audit-log.csv",
      filtered.map((a) => ({ at: a.at, user: a.actor, role: a.actorRole, action: a.action, module: a.module, details: a.details, ip: a.ip, status: a.status })),
    );

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Track all important actions and changes made in the admin panel and across the platform."
        action={sample ? <SampleTag reason={data.error} /> : null}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="border-b border-line">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All logs", count: items.length },
                { key: "admin", label: "Admin actions", count: count("admin") },
                { key: "user", label: "User actions", count: count("user") },
                { key: "system", label: "System events", count: count("system") },
                { key: "content", label: "Content changes", count: count("content") },
              ]}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:w-52" value={search} onChange={setSearch} placeholder="Search logs..." />
            <SelectField label="Action" value={action} onChange={setAction} className="md:w-36" options={[{ value: "all", label: "All actions" }, ...uniq((a) => a.action).map((v) => ({ value: v, label: v }))]} />
            <SelectField label="User" value={actor} onChange={setActor} className="md:w-36" options={[{ value: "all", label: "All users" }, ...uniq((a) => a.actor).map((v) => ({ value: v, label: v }))]} />
            <SelectField label="Module" value={moduleFilter} onChange={setModuleFilter} className="md:w-36" options={[{ value: "all", label: "All modules" }, ...uniq((a) => a.module).map((v) => ({ value: v, label: v }))]} />
            <DateRangeChip days={Number(range)} />
          </div>

          <div className="mt-4">
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>
                    <button type="button" onClick={() => setDesc((d) => !d)} className="inline-flex items-center gap-1">
                      Date &amp; time <Icon name="sort" size={13} />
                    </button>
                  </Th>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Module</Th>
                  <Th>Details</Th>
                  <Th>IP address</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={9} /> : null}
                {paged.slice.map((a) => (
                  <tr key={a.id} className="hover:bg-canvas/40">
                    <Td><Checkbox label="Select entry" checked={sel.selected.has(a.id)} onChange={(v) => sel.toggle(a.id, v)} /></Td>
                    <Td><DateTimeCell value={a.at} /></Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {a.actor === "System" ? (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas"><Icon name="shield" size={17} /></span>
                        ) : (
                          <Avatar name={a.actor} size={36} />
                        )}
                        <div className="min-w-0">
                          <p className="whitespace-nowrap font-medium text-ink">{a.actor}</p>
                          <p className="text-[12.5px] text-muted">{a.actorRole}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge tone={ACTION_TONE[a.action] ?? "gray"} className="px-2.5 py-1.5">{a.action}</Badge></Td>
                    <Td>{a.module}</Td>
                    <Td className="min-w-[160px] max-w-[220px]"><span className="line-clamp-3 leading-snug">{a.details}</span></Td>
                    <Td className="whitespace-nowrap">{a.ip}</Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td className="text-center">
                      <RowMenu actions={[{ label: "View details", icon: "eye", onSelect: () => setDetail(a) }, { label: `Filter by ${a.actor}`, icon: "filter", onSelect: () => setActor(a.actor) }]} />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={9} title="No log entries match" /> : null}
              </tbody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
            </div>
            <SelectField label="Items per page" value={perPage} onChange={(v) => { setPerPage(v); paged.setPage(1); }} className="w-28 sm:ml-3" options={[{ value: "10", label: "10 / page" }, { value: "25", label: "25 / page" }, { value: "50", label: "50 / page" }]} />
          </div>
          {data.nextCursor ? (
            <div className="mt-3 text-center">
              <button type="button" disabled={data.loadingMore} onClick={() => void data.loadMore()} className="text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-50">
                {data.loadingMore ? "Loading…" : "Load older entries"}
              </button>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Audit overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="fileText" value={String(items.length)} label="Total logs" delta={sample ? 18 : undefined} />
              <MiniStat icon="users" value={String(count("admin"))} label="Admin actions" delta={sample ? 12 : undefined} />
              <MiniStat icon="community" value={String(count("user"))} label="User actions" delta={sample ? 26 : undefined} />
              <MiniStat icon="settings" value={String(count("system"))} label="System events" delta={sample ? 14 : undefined} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Actions breakdown" action={<ViewAll />} />
            <div className="mt-4">
              <BarList items={breakdown} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Recent activity" action={<ViewAll />} />
            <ul className="mt-4 space-y-3.5">
              {[...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((a) => {
                const [icon, tile] = ACTIVITY_ICON[a.action] ?? (["info", "bg-canvas text-ink/70"] as [IconName, string]);
                return (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tile)}><Icon name={icon} size={18} /></span>
                    <span className="min-w-0 text-sm">
                      <span className="block truncate text-ink">{a.actor} {a.action.toLowerCase()} {a.module.toLowerCase()}</span>
                      <span className="block text-xs text-muted">{formatDateTime(a.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile primary icon="download" label="Export logs" onClick={exportLogs} />
              <QuickTile icon="shield" label="View login history" onClick={() => setModuleFilter("Auth")} />
              <QuickTile icon="user" label="Filter by user" onClick={() => setTab("user")} />
              <QuickTile icon="settings" label="System settings" />
            </div>
          </Card>
        </div>
      </div>

      <Modal open={detail !== null} title="Log entry" onClose={() => setDetail(null)}>
        {detail ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["When", formatDateTime(detail.at)],
              ["User", `${detail.actor} (${detail.actorRole})`],
              ["Action", detail.action],
              ["Module", detail.module],
              ["IP address", detail.ip],
              ["Status", detail.status],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-1 font-medium text-ink">{v}</dd>
              </div>
            ))}
            <div className="col-span-2 rounded-xl border border-line p-3">
              <dt className="text-xs text-muted">Details</dt>
              <dd className="mt-1 text-ink">{detail.details}</dd>
            </div>
          </dl>
        ) : null}
      </Modal>
    </>
  );
}

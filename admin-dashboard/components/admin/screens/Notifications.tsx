"use client";

import { useState } from "react";
import { matches, useAdmin, useLiveList } from "../data";
import { Modal, useToast } from "../dialogs";
import { Icon, type IconName } from "../icons";
import { type NotificationRow, sampleNotifications } from "../sample";
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
  MiniStat,
  PageHeader,
  Pagination,
  PrimaryButton,
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

const TYPE_META: Record<NotificationRow["type"], { icon: IconName; tone: Tone; color: string; tile: string }> = {
  Live: { icon: "megaphone", tone: "red", color: "#c0262d", tile: "bg-brand-soft text-brand" },
  Course: { icon: "cap", tone: "purple", color: "#9333ea", tile: "bg-violet-50 text-violet-600" },
  Department: { icon: "community", tone: "teal", color: "#0d9488", tile: "bg-teal-50 text-teal-600" },
  Event: { icon: "calendar", tone: "red", color: "#e11d48", tile: "bg-rose-50 text-rose-600" },
  Security: { icon: "shield", tone: "gray", color: "#64748b", tile: "bg-slate-100 text-slate-600" },
  Resource: { icon: "fileText", tone: "red", color: "#ea580c", tile: "bg-orange-50 text-orange-600" },
  System: { icon: "info", tone: "gray", color: "#6366f1", tile: "bg-indigo-50 text-indigo-600" },
  Newsletter: { icon: "mail", tone: "blue", color: "#2563eb", tile: "bg-sky-50 text-sky-700" },
  Update: { icon: "settings", tone: "teal", color: "#0f766e", tile: "bg-teal-50 text-teal-700" },
};

type TabKey = "all" | NotificationRow["status"];

export default function Notifications() {
  const { globalSearch } = useAdmin();
  // The API has per-user inbox notifications, but no admin "broadcast" endpoint yet.
  const data = useLiveList<never, NotificationRow>(null, (x) => x, sampleNotifications);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [audience, setAudience] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30");
  const [perPage, setPerPage] = useState("10");
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", audience: "All users", type: "System" as NotificationRow["type"] });
  const toast = useToast();

  const items = data.items;
  const audiences = [...new Set(items.map((n) => n.audience))];
  const filtered = items.filter(
    (n) =>
      (tab === "all" || n.status === tab) &&
      (type === "all" || n.type === type) &&
      (audience === "all" || n.audience === audience) &&
      (status === "all" || n.status === status) &&
      matches(search || globalSearch, n.title, n.body, n.createdBy),
  );
  const paged = usePaged(filtered, Number(perPage));
  const sel = useSelection(paged.slice.map((n) => n.id));

  const typeCounts = (Object.keys(TYPE_META) as NotificationRow["type"][])
    .map((t) => ({ t, v: items.filter((n) => n.type === t).length }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 7);

  const save = (s: NotificationRow["status"]) => {
    if (!draft.title.trim()) {
      toast.error("Add a title first.");
      return;
    }
    const row: NotificationRow = {
      id: `n-${Date.now()}`,
      title: draft.title.trim(),
      body: draft.body.trim(),
      type: draft.type,
      audience: draft.audience,
      status: s,
      createdBy: "You",
      date: new Date().toISOString(),
    };
    data.setItems((rows) => [row, ...rows]);
    setComposeOpen(false);
    setDraft({ title: "", body: "", audience: "All users", type: "System" });
    toast.success(s === "Draft" ? "Saved as draft (preview only)." : "Added to the list (preview only — sending needs the broadcast API).");
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Send and manage in-app, email and push notifications."
        action={
          <div className="flex items-center gap-3">
            <SampleTag reason="Members' inbox notifications exist in the API, but admin broadcasts (send to all / a department) need a new endpoint." />
            <PrimaryButton onClick={() => setComposeOpen(true)}>New notification</PrimaryButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="border-b border-line">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All notifications", count: items.length },
                { key: "Scheduled", label: "Scheduled", count: items.filter((n) => n.status === "Scheduled").length },
                { key: "Sent", label: "Sent", count: items.filter((n) => n.status === "Sent").length },
                { key: "Draft", label: "Drafts", count: items.filter((n) => n.status === "Draft").length },
              ]}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search notifications..." />
            <SelectField label="Type" value={type} onChange={setType} className="md:w-[106px]" options={[{ value: "all", label: "All types" }, ...Object.keys(TYPE_META).map((t) => ({ value: t, label: t }))]} />
            <SelectField label="Audience" value={audience} onChange={setAudience} className="md:w-[132px]" options={[{ value: "all", label: "All audiences" }, ...audiences.map((a) => ({ value: a, label: a }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[106px]" options={[{ value: "all", label: "All statuses" }, ...["Sent", "Scheduled", "Draft"].map((s) => ({ value: s, label: s }))]} />
            <DateRangeChip days={Number(range)} />
          </div>

          <div className="mt-4">
            <Table minWidth={800}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Audience</Th>
                  <Th>Status</Th>
                  <Th>Created by</Th>
                  <Th>Date</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((n) => {
                  const meta = TYPE_META[n.type];
                  return (
                    <tr key={n.id} className="hover:bg-canvas/40">
                      <Td><Checkbox label={`Select ${n.title}`} checked={sel.selected.has(n.id)} onChange={(v) => sel.toggle(n.id, v)} /></Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.tile)}>
                            <Icon name={meta.icon} size={20} />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[180px] truncate font-semibold text-ink">{n.title}</p>
                            <p className="line-clamp-2 max-w-[180px] text-[12.5px] leading-snug text-ink/70">{n.body}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><Badge tone={meta.tone}>{n.type}</Badge></Td>
                      <Td className="max-w-[120px]">{n.audience}</Td>
                      <Td><StatusBadge status={n.status} /></Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          {n.createdBy === "System" ? (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas"><Icon name="shield" size={15} /></span>
                          ) : (
                            <Avatar name={n.createdBy} size={28} />
                          )}
                          <span className="whitespace-nowrap">{n.createdBy}</span>
                        </div>
                      </Td>
                      <Td><DateTimeCell value={n.date} /></Td>
                      <Td className="text-center">
                        <RowMenu
                          actions={[
                            { label: "Duplicate", icon: "copy", onSelect: () => { data.setItems((rows) => [{ ...n, id: `${n.id}-c${Date.now()}`, status: "Draft", title: `${n.title} (copy)` }, ...rows]); toast.success("Copied to drafts."); } },
                            ...(n.status !== "Sent" ? [{ label: "Delete", icon: "trash" as const, danger: true, onSelect: () => { data.setItems((rows) => rows.filter((r) => r.id !== n.id)); toast.success("Deleted."); } }] : []),
                          ]}
                        />
                      </Td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? <EmptyRow cols={8} title="No notifications found" /> : null}
              </tbody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
            </div>
            <SelectField label="Items per page" value={perPage} onChange={(v) => { setPerPage(v); paged.setPage(1); }} className="w-28 sm:ml-3" options={[{ value: "10", label: "10 / page" }, { value: "25", label: "25 / page" }, { value: "50", label: "50 / page" }]} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Notification overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="send" value={String(items.filter((n) => n.status === "Sent").length)} label="Total sent" delta={18} />
              <MiniStat icon="mail" value="96.2%" label="Delivery rate" delta={4} />
              <MiniStat icon="eye" value="12.4K" label="Total opens" delta={26} />
              <MiniStat icon="pointer" value="1.8K" label="Total clicks" delta={14} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Notification types" action={<ViewAll />} />
            <div className="mt-4">
              <BarList items={typeCounts.map(({ t, v }) => ({ label: t, value: v, color: TYPE_META[t].color, icon: TYPE_META[t].icon }))} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Recent activity" action={<ViewAll />} />
            <ul className="mt-4 space-y-3.5">
              {items.slice(0, 4).map((n) => {
                const label = n.status === "Sent" ? "Notification sent" : n.status === "Scheduled" ? "Notification scheduled" : "Notification draft updated";
                const tile = n.status === "Sent" ? "bg-teal-50 text-teal-600" : n.status === "Scheduled" ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-600";
                const icon: IconName = n.status === "Sent" ? "send" : n.status === "Scheduled" ? "calendar" : "edit";
                return (
                  <li key={n.id} className="flex items-start gap-3">
                    <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tile)}><Icon name={icon} size={18} /></span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold text-ink">{label}</span>
                      <span className="block truncate text-ink/75">{n.title}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">{formatDateTime(n.date)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile primary icon="plus" label="New notification" onClick={() => setComposeOpen(true)} />
              <QuickTile icon="fileText" label="Notification templates" />
              <QuickTile icon="users" label="Manage subscribers" />
              <QuickTile icon="settings" label="Notification settings" />
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={composeOpen}
        title="New notification"
        onClose={() => setComposeOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => save("Draft")} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas">Save draft</button>
            <button type="button" onClick={() => save("Scheduled")} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Schedule</button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Title</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Message</span>
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={3} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Type" value={draft.type} onChange={(v) => setDraft({ ...draft, type: v as NotificationRow["type"] })} options={Object.keys(TYPE_META).map((t) => ({ value: t, label: t }))} />
            <SelectField label="Audience" value={draft.audience} onChange={(v) => setDraft({ ...draft, audience: v })} options={["All users", "Department members", "Registered attendees", "Students", "Youth"].map((a) => ({ value: a, label: a }))} />
          </div>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Preview only: delivering this needs an admin broadcast endpoint in the API.</p>
        </div>
      </Modal>
      {toast.element}
    </>
  );
}

"use client";

import { useState } from "react";
import { api, downloadCsv, matches, useAdmin, useLiveList } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ApiEvent, mapEvent } from "../mappers";
import { type EventRow, sampleEvents } from "../sample";
import {
  Badge,
  Card,
  Checkbox,
  EmptyRow,
  ExportButton,
  KpiCard,
  LoadingRows,
  PageHeader,
  Pagination,
  PrimaryButton,
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
  Thumb,
  type Tone,
  ViewAll,
  compactNumber,
  cx,
  usePaged,
  useSelection,
} from "../ui";

const CATEGORY_TONE: Record<string, Tone> = {
  Prayer: "red",
  Conference: "purple",
  Worship: "amber",
  Study: "green",
  Outreach: "blue",
  Music: "purple",
};

function eventWhen(e: EventRow) {
  const d = new Date(e.startsAt);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { day, time: `${time} (${e.timezoneLabel})` };
}

type TabKey = "all" | "upcoming" | "ongoing" | "past";

export default function Events() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiEvent, EventRow>("events?limit=100", mapEvent, sampleEvents);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30");
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";

  const [now] = useState(() => Date.now());
  const items = data.items;
  const phase = (e: EventRow): TabKey =>
    e.ongoing ? "ongoing" : new Date(e.startsAt).getTime() > now ? "upcoming" : "past";
  const count = (t: TabKey) => items.filter((e) => phase(e) === t).length;
  const categories = [...new Set(items.map((e) => e.category))];

  const filtered = items
    .filter(
      (e) =>
        (tab === "all" || phase(e) === tab) &&
        (category === "all" || e.category === category) &&
        (status === "all" || e.status === status) &&
        matches(search || globalSearch, e.title, e.tagline, e.location, e.category),
    )
    .sort((a, b) => {
      const pa = phase(a) === "past" ? 1 : 0;
      const pb = phase(b) === "past" ? 1 : 0;
      return pa - pb || (pa ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt));
    });
  const paged = usePaged(filtered, 6);
  const sel = useSelection(paged.slice.map((e) => e.id));

  const featured =
    items.find((e) => e.id === featuredId) ??
    items.find((e) => phase(e) === "upcoming" && e.status === "Published" && e.attendees > 0) ??
    items[0] ??
    null;
  const recentPast = items.filter((e) => phase(e) === "past").sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 2);

  const cancel = (e: EventRow) =>
    ask({
      title: "Cancel event",
      message: `“${e.title}” will be cancelled and registered attendees notified.`,
      confirmLabel: "Cancel event",
      danger: true,
      onConfirm: async () => {
        try {
          if (data.mode === "live") await api(`events/${e.id}/cancel`, { method: "POST" });
          data.setItems((rows) => rows.map((r) => (r.id === e.id ? { ...r, status: "Cancelled" } : r)));
          toast.success("Event cancelled.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not cancel the event.");
        }
      },
    });

  const duplicate = (e: EventRow) => {
    if (data.mode === "live") {
      toast.error("Duplicating needs the create-event form, which isn't wired yet.");
      return;
    }
    const copy: EventRow = { ...e, id: `${e.id}-copy-${crypto.randomUUID()}`, title: `${e.title} (copy)`, status: "Draft", attendees: 0, shares: 0 };
    data.setItems((rows) => [copy, ...rows]);
    toast.success("Draft copy created.");
  };

  const totalAttendees = items.reduce((s, e) => s + e.attendees, 0);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Create and manage community events."
        action={
          <div className="flex items-center gap-3">
            {sample ? <SampleTag reason={data.error} /> : null}
            <PrimaryButton onClick={() => setCreateOpen(true)}>Create Event</PrimaryButton>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <KpiCard icon="calendar" label="Total Events" value={String(items.length)} delta={sample ? 12 : undefined} trend={[3, 4, 3, 5, 4, 6, 7]} />
        <KpiCard icon="users" label="Total Attendees" value={compactNumber(totalAttendees)} delta={sample ? 18 : undefined} trend={[2, 3, 4, 3, 5, 6, 8]} />
        <KpiCard icon="checkCircle" label="Upcoming Events" value={String(count("upcoming"))} delta={sample ? 6 : undefined} trend={[4, 3, 5, 4, 5, 6, 7]} />
        <KpiCard icon="star" label="Past Events" value={String(count("past"))} delta={sample ? -14 : undefined} trend={[6, 5, 6, 4, 5, 6, 7]} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All Events", count: items.length },
                { key: "upcoming", label: "Upcoming", count: count("upcoming") },
                { key: "ongoing", label: "Ongoing", count: count("ongoing") },
                { key: "past", label: "Past Events", count: count("past") },
              ]}
            />
            <RangeSelect className="mb-3" value={range} onChange={setRange} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search events..." />
            <SelectField label="Category" value={category} onChange={setCategory} className="md:w-[150px]" options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[120px]" options={[{ value: "all", label: "All Status" }, ...["Published", "Draft", "Scheduled", "Cancelled", "Completed"].map((s) => ({ value: s, label: s }))]} />
            <ExportButton onClick={() => downloadCsv("cyc-events.csv", filtered.map((e) => ({ title: e.title, category: e.category, starts_at: e.startsAt, location: e.location, status: e.status, attendees: e.attendees })))} />
          </div>

          <div className="mt-4">
            <Table minWidth={780}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Event</Th>
                  <Th>Category</Th>
                  <Th>Date &amp; Time</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={7} /> : null}
                {paged.slice.map((e) => {
                  const w = eventWhen(e);
                  return (
                    <tr
                      key={e.id}
                      className={cx("cursor-pointer hover:bg-canvas/40", featured?.id === e.id ? "bg-brand-soft/25" : "")}
                      onClick={(ev) => {
                        if ((ev.target as HTMLElement).closest("button,input")) return;
                        setFeaturedId(e.id);
                      }}
                    >
                      <Td><Checkbox label={`Select ${e.title}`} checked={sel.selected.has(e.id)} onChange={(v) => sel.toggle(e.id, v)} /></Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Thumb seed={e.title} width={52} height={48} />
                          <div className="min-w-0">
                            <p className="max-w-[180px] truncate font-semibold text-ink">{e.title}</p>
                            <p className="max-w-[180px] truncate text-[11.5px] text-ink/70">{e.tagline}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><Badge tone={CATEGORY_TONE[e.category] ?? "gray"} className="px-2.5 py-1.5">{e.category}</Badge></Td>
                      <Td className="whitespace-nowrap">
                        <p>{w.day}</p>
                        <p className="text-ink/70">{w.time}</p>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Icon name="pin" size={17} className="text-ink/70" />
                          {e.location}
                        </span>
                      </Td>
                      <Td>{e.ongoing ? <Badge tone="red" dot>Ongoing</Badge> : <StatusBadge status={e.status} />}</Td>
                      <Td className="text-center">
                        <RowMenu
                          actions={[
                            { label: "View", icon: "eye", onSelect: () => setFeaturedId(e.id) },
                            { label: "Duplicate", icon: "copy", onSelect: () => duplicate(e) },
                            ...(e.status !== "Cancelled" && phase(e) !== "past"
                              ? [{ label: "Cancel event", icon: "trash" as const, danger: true, onSelect: () => cancel(e) }]
                              : []),
                          ]}
                        />
                      </Td>
                    </tr>
                  );
                })}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={7} title="No events found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} events`} />
        </Card>

        <div className="space-y-5">
          {featured ? (
            <Card className="overflow-hidden p-3">
              <div className="relative">
                <Thumb seed={featured.title} icon="users" width="100%" height={190} rounded="rounded-xl" />
                <span className="absolute right-3 top-3">
                  <StatusBadge status={featured.ongoing ? "Live" : featured.status} />
                </span>
              </div>
              <div className="px-2 pb-2 pt-4">
                <h2 className="text-xl font-bold text-ink">{featured.title}</h2>
                <p className="mt-1 text-[13px] text-ink/80">{featured.tagline}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 border-b border-line pb-4 text-sm sm:grid-cols-2">
                  <span className="flex items-start gap-2">
                    <Icon name="calendar" size={18} className="mt-0.5 shrink-0 text-brand" />
                    <span>{eventWhen(featured).day.replace(/^\w+, /, (m) => m)}<br /><span className="text-ink/70">{eventWhen(featured).time}</span></span>
                  </span>
                  <span className="flex items-start gap-2">
                    <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-brand" />
                    {featured.location}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-ink">About this event</h3>
                <p className="mt-1 text-sm leading-6 text-ink/80">{featured.description || "No description yet."}</p>
                <div className="mt-4 grid grid-cols-2 divide-x divide-line border-b border-line pb-4 text-center">
                  <div className="flex items-center justify-center gap-2.5">
                    <Icon name="users" size={22} className="text-brand" />
                    <span className="text-left"><span className="block text-lg font-bold leading-tight text-ink">{featured.attendees}</span><span className="text-xs text-muted">Attendees</span></span>
                  </div>
                  <div className="flex items-center justify-center gap-2.5">
                    <Icon name="share" size={22} className="text-brand" />
                    <span className="text-left"><span className="block text-lg font-bold leading-tight text-ink">{featured.shares}</span><span className="text-xs text-muted">Shares</span></span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => toast.success("Editing opens the event form (coming next).")} className="flex items-center justify-center gap-1.5 rounded-lg border border-brand/40 px-2 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft"><Icon name="edit" size={16} />Edit</button>
                  <button type="button" onClick={() => duplicate(featured)} className="flex items-center justify-center gap-1.5 rounded-lg border border-brand/40 px-2 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft"><Icon name="copy" size={16} />Duplicate</button>
                  <button type="button" disabled={featured.status === "Cancelled"} onClick={() => cancel(featured)} className="flex items-center justify-center gap-1.5 rounded-lg border border-brand/40 px-2 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft disabled:opacity-40"><Icon name="trash" size={16} />Cancel</button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Recent Events</h2>
              <ViewAll onClick={() => setTab("past")} />
            </div>
            <ul className="mt-3 space-y-3">
              {recentPast.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <Thumb seed={e.title} width={56} height={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{e.title}</p>
                    <p className="text-[11.5px] text-ink/70">{eventWhen(e).day} • {eventWhen(e).time.split(" (")[0]}</p>
                  </div>
                  <StatusBadge status={e.status === "Cancelled" ? "Cancelled" : "Completed"} />
                </li>
              ))}
              {recentPast.length === 0 ? <li className="text-sm text-muted">No past events yet.</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      <Modal open={createOpen} title="Create event" onClose={() => setCreateOpen(false)}>
        <p className="text-sm leading-6 text-ink/80">
          The API supports creating events (<code>POST /events</code>). The create form is the next piece to wire up — it needs
          title, start/end time, time zone, location or online link, and optional capacity.
        </p>
      </Modal>
      {dialog}
      {toast.element}
    </>
  );
}

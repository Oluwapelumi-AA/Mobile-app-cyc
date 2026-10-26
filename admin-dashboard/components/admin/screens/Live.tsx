"use client";

import { useMemo, useState } from "react";
import { api, matches, useAdmin, useLiveList } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ApiMeeting, mapMeeting } from "../mappers";
import { sampleVideos, type VideoRow } from "../sample";
import {
  Badge,
  Card,
  CardHeader,
  Checkbox,
  DateRangeChip,
  EmptyRow,
  LoadingRows,
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
  Thumb,
  ViewAll,
  compactNumber,
  formatDate,
  usePaged,
  useSelection,
} from "../ui";

type TabKey = "all" | "Live now" | "Scheduled" | "recorded" | "Draft";

export default function Live() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiMeeting, VideoRow>("meetings?limit=100", mapMeeting, sampleVideos);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [community, setCommunity] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30");
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";

  const items = data.items;
  const recorded = (v: VideoRow) => v.status === "Published" || v.status === "Ended";
  const communities = useMemo(() => [...new Set(items.map((v) => v.community))], [items]);
  const filtered = items.filter(
    (v) =>
      (tab === "all" || (tab === "recorded" ? recorded(v) : v.status === tab)) &&
      (kind === "all" || v.kind === kind) &&
      (community === "all" || v.community === community) &&
      (status === "all" || v.status === status) &&
      matches(search || globalSearch, v.title, v.subtitle, v.host, v.community),
  );
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((v) => v.id));
  const liveNow = items.find((v) => v.status === "Live now") ?? null;

  const endSession = (v: VideoRow) =>
    ask({
      title: "End live session",
      message: `“${v.title}” will end for all viewers. A recording is kept if recording was enabled.`,
      confirmLabel: "End session",
      danger: true,
      onConfirm: async () => {
        try {
          if (data.mode === "live") await api(`meetings/${v.id}/end`, { method: "POST" });
          data.setItems((rows) => rows.map((r) => (r.id === v.id ? { ...r, status: "Ended" } : r)));
          toast.success("Live session ended.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not end the session.");
        }
      },
    });

  const count = (fn: (v: VideoRow) => boolean) => items.filter(fn).length;

  return (
    <>
      <PageHeader
        title="Live and video"
        subtitle="Manage live sessions, recorded videos and broadcasts."
        action={
          <div className="flex items-center gap-3">
            {sample ? <SampleTag reason={data.error} /> : null}
            <PrimaryButton onClick={() => toast.success("Hosts go live from the CYC app (POST /meetings → /start).")}>Go live</PrimaryButton>
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
                { key: "all", label: "All content", count: items.length },
                { key: "Live now", label: "Live now", count: count((v) => v.status === "Live now") },
                { key: "Scheduled", label: "Upcoming", count: count((v) => v.status === "Scheduled") },
                { key: "recorded", label: "Recorded", count: count(recorded) },
                { key: "Draft", label: "Drafts", count: count((v) => v.status === "Draft") },
              ]}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search live or video..." />
            <SelectField label="Type" value={kind} onChange={setKind} className="md:w-[106px]" options={[{ value: "all", label: "All types" }, { value: "Live", label: "Live" }, { value: "Video", label: "Video" }]} />
            <SelectField label="Department" value={community} onChange={setCommunity} className="md:w-[138px]" options={[{ value: "all", label: "All departments" }, ...communities.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[116px]" options={[{ value: "all", label: "All statuses" }, ...["Live now", "Scheduled", "Published", "Ended", "Draft"].map((s) => ({ value: s, label: s }))]} />
            <DateRangeChip days={Number(range)} />
          </div>

          <div className="mt-4">
            <Table minWidth={790}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Speaker/Host</Th>
                  <Th>Department</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th sortable>Views</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={9} /> : null}
                {paged.slice.map((v) => (
                  <tr key={v.id} className="hover:bg-canvas/40">
                    <Td><Checkbox label={`Select ${v.title}`} checked={sel.selected.has(v.id)} onChange={(c) => sel.toggle(v.id, c)} /></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb seed={v.title} width={64} height={46} duration={v.duration !== "—" ? v.duration : undefined} />
                        <div className="min-w-0">
                          <p className="max-w-[150px] truncate font-semibold text-ink">{v.title}</p>
                          <p className="line-clamp-2 max-w-[150px] text-[11px] leading-snug text-ink/70">{v.subtitle}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge tone={v.kind === "Live" ? "red" : "gray"}>{v.kind}</Badge></Td>
                    <Td className="whitespace-nowrap">{v.host}</Td>
                    <Td className="whitespace-nowrap">{v.community}</Td>
                    <Td>
                      {v.status === "Live now" ? (
                        <Badge tone="red"><Icon name="broadcast" size={13} />Live now</Badge>
                      ) : (
                        <StatusBadge status={v.status === "Ended" ? "Ended" : v.status} />
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(v.date)}</Td>
                    <Td>{v.views === null ? "–" : compactNumber(v.views)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          ...(v.status === "Live now" ? [{ label: "End session", icon: "stopCircle" as const, danger: true, onSelect: () => endSession(v) }] : []),
                          { label: "View analytics", icon: "barChart", onSelect: () => toast.success("Analytics need a views endpoint in the API.") },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={9} title="No live sessions or videos found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Live now" action={<ViewAll onClick={() => setTab("Live now")} />} />
            {liveNow ? (
              <>
                <div className="relative mt-4">
                  <Thumb seed={liveNow.title} icon="users" width="100%" height={170} rounded="rounded-xl" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-2 py-1 text-xs font-bold text-white">
                    <Icon name="broadcast" size={14} />LIVE
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-ink">{liveNow.title}</h3>
                <p className="text-sm text-ink/75">{liveNow.subtitle}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    ["users", liveNow.watching, "Watching"],
                    ["thumbsUp", liveNow.likes, "Likes"],
                    ["message", liveNow.comments, "Comments"],
                  ] as const).map(([icon, v, l]) => (
                    <div key={l} className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon name={icon} size={17} /></span>
                      <span><span className="block font-bold leading-tight text-ink">{v ?? "—"}</span><span className="text-[9.5px] text-muted">{l}</span></span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => endSession(liveNow)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-soft py-3 text-sm font-semibold text-brand hover:bg-brand-tint">
                  <Icon name="stopCircle" size={18} />End live session
                </button>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-canvas px-4 py-8 text-center text-sm text-muted">Nobody is live right now.</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title="Content overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="play" value={String(count((v) => v.kind === "Video"))} label="Total videos" delta={sample ? 12 : undefined} />
              <MiniStat icon="broadcast" value={String(count((v) => v.kind === "Live"))} label="Live sessions" delta={sample ? 33 : undefined} />
              <MiniStat icon="users" value={sample ? "12.4K" : "—"} label="Total views" delta={sample ? 28 : undefined} />
              <MiniStat icon="clock" value={sample ? "1.8K" : "—"} label="Watch time (hrs)" delta={sample ? 41 : undefined} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile icon="broadcast" label="Go live now" />
              <QuickTile icon="video" label="Create from recording" />
              <QuickTile icon="upload" label="Upload video" />
              <QuickTile icon="barChart" label="View analytics" />
              <QuickTile icon="message" label="Manage categories" />
              <QuickTile icon="settings" label="Content settings" />
            </div>
          </Card>
        </div>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

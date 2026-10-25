"use client";

import { useMemo, useState } from "react";
import { api, downloadCsv, matches, useAdmin, useDirectory, useLiveList } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { type ApiReport, mapReport, withNames } from "../mappers";
import { type ReportRow, sampleReports } from "../sample";
import {
  Badge,
  Card,
  CardHeader,
  Checkbox,
  DateRangeChip,
  Donut,
  DonutLegend,
  EmptyRow,
  ExportButton,
  LinkRow,
  LoadingRows,
  MiniStat,
  Pagination,
  RED_RAMP,
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
  PageHeader,
  formatDateTime,
  timeAgo,
  usePaged,
  useSelection,
} from "../ui";

/** All report reasons use the brand red, as in the designs. */
export function reasonTone(reason: string): Tone {
  return reason ? "red" : "gray";
}

type TabKey = "all" | "New" | "Under review" | "Resolved" | "Dismissed";

export default function Reports() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiReport, ReportRow>("moderation/reports?status=any&limit=100", mapReport, sampleReports);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [community, setCommunity] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30");
  const [detail, setDetail] = useState<ReportRow | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const dir = useDirectory(data.mode === "live");
  const items = useMemo(() => withNames(data.items, dir), [data.items, dir]);
  const count = (s: ReportRow["status"]) => items.filter((r) => r.status === s).length;
  const reasons = useMemo(() => [...new Set(items.map((r) => r.reason))], [items]);
  const communities = useMemo(() => [...new Set(items.map((r) => r.community))], [items]);

  const filtered = items.filter(
    (r) =>
      (tab === "all" || r.status === tab) &&
      (type === "all" || r.reason === type) &&
      (community === "all" || r.community === community) &&
      (status === "all" || r.status === status) &&
      matches(search || globalSearch, r.title, r.reason, r.reporter, r.community, r.targetType),
  );
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((r) => r.id));

  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((r) => counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
    const segs = top.map(([label, value], i) => ({ label, value, color: RED_RAMP[i] }));
    if (rest) segs.push({ label: "Other", value: rest, color: RED_RAMP[6] });
    return segs;
  }, [items]);

  async function resolve(report: ReportRow, outcome: "actioned" | "dismissed", note: string, removeContent = false) {
    const next: ReportRow["status"] = outcome === "actioned" ? "Resolved" : "Dismissed";
    try {
      if (data.mode === "live") {
        await api(`moderation/reports/${report.id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ status: outcome, note: note || null, remove_content: removeContent }),
        });
      }
      data.setItems((rows) => rows.map((r) => (r.id === report.id ? { ...r, status: next } : r)));
      setDetail(null);
      toast.success(outcome === "actioned" ? "Report resolved." : "Report dismissed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the report.");
    }
  }

  const askResolve = (r: ReportRow, outcome: "actioned" | "dismissed", remove = false) =>
    ask({
      title: outcome === "dismissed" ? "Dismiss report" : remove ? "Remove content & resolve" : "Mark as resolved",
      message:
        outcome === "dismissed"
          ? "The content will stay up and the report will be closed."
          : remove
            ? "The reported content will be removed for everyone and the report closed."
            : "The report will be closed as actioned.",
      confirmLabel: outcome === "dismissed" ? "Dismiss" : remove ? "Remove & resolve" : "Resolve",
      danger: remove,
      input: { label: "Moderator note", placeholder: "Optional note for the audit log" },
      onConfirm: (note) => resolve(r, outcome, note, remove),
    });

  const tabs = [
    { key: "all" as const, label: "All reports", count: items.length },
    { key: "New" as const, label: "Pending", count: count("New") },
    { key: "Under review" as const, label: "Under review", count: count("Under review") },
    { key: "Resolved" as const, label: "Resolved", count: count("Resolved") },
    { key: "Dismissed" as const, label: "Dismissed", count: count("Dismissed") },
  ];

  const sample = data.mode === "sample";

  return (
    <>
      <PageHeader
        title="Reports and moderation"
        subtitle="Review and manage reported content to keep the community safe."
        action={sample ? <SampleTag reason={data.error} /> : null}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="border-b border-line">
            <Tabs tabs={tabs} value={tab} onChange={(k) => { setTab(k); paged.setPage(1); }} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search reports..." />
            <SelectField label="Type" value={type} onChange={setType} className="md:w-[108px]" options={[{ value: "all", label: "All types" }, ...reasons.map((r) => ({ value: r, label: r }))]} />
            <SelectField label="Community" value={community} onChange={setCommunity} className="md:w-[138px]" options={[{ value: "all", label: "All communities" }, ...communities.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[106px]" options={[{ value: "all", label: "All status" }, ...["New", "Under review", "Resolved", "Dismissed"].map((s) => ({ value: s, label: s }))]} />
            <DateRangeChip days={Number(range)} />
            <ExportButton
              onClick={() =>
                downloadCsv(
                  "cyc-reports.csv",
                  filtered.map((r) => ({ title: r.title, target: r.targetType, community: r.community, reason: r.reason, reported_by: r.reporter, status: r.status, created_at: r.createdAt })),
                )
              }
            />
          </div>

          {sel.selected.size > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft/60 px-3 py-2 text-sm">
              <span className="font-medium text-ink">{sel.selected.size} selected</span>
              <button type="button" className="rounded-lg px-2 py-1 font-medium text-brand hover:bg-white" onClick={() => {
                items.filter((r) => sel.selected.has(r.id) && (r.status === "New" || r.status === "Under review")).forEach((r) => void resolve(r, "dismissed", "Bulk dismissed"));
                sel.clear();
              }}>
                Dismiss selected
              </button>
              <button type="button" className="ml-auto text-muted hover:text-ink" onClick={sel.clear}>
                Clear
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <Table minWidth={780}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Content</Th>
                  <Th>Type</Th>
                  <Th>Reported by</Th>
                  <Th sortable>Status</Th>
                  <Th>Date</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={7} /> : null}
                {paged.slice.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/40">
                    <Td><Checkbox label={`Select ${r.title}`} checked={sel.selected.has(r.id)} onChange={(v) => sel.toggle(r.id, v)} /></Td>
                    <Td>
                      <button type="button" onClick={() => setDetail(r)} className="flex items-center gap-3 text-left">
                        <Thumb seed={r.id} width={40} height={40} rounded="rounded-md" />
                        <span className="min-w-0">
                          <span className="block max-w-[190px] truncate font-medium text-ink hover:text-brand">{r.title}</span>
                          <span className="block truncate text-[13px] text-muted">{r.targetType} · {r.community}</span>
                        </span>
                      </button>
                    </Td>
                    <Td><Badge tone={reasonTone(r.reason)}>{r.reason}</Badge></Td>
                    <Td className="whitespace-nowrap">{r.reporter}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td className="whitespace-nowrap text-ink/70">{timeAgo(r.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "View details", icon: "eye", onSelect: () => setDetail(r) },
                          ...(r.status === "New" || r.status === "Under review"
                            ? [
                                { label: "Mark resolved", icon: "check" as const, onSelect: () => askResolve(r, "actioned") },
                                { label: "Remove content", icon: "trash" as const, danger: true, onSelect: () => askResolve(r, "actioned", true) },
                                { label: "Dismiss", icon: "x" as const, onSelect: () => askResolve(r, "dismissed") },
                              ]
                            : []),
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? (
                  <EmptyRow cols={7} title="No reports match" hint="Try another tab or clear the filters." />
                ) : null}
              </tbody>
            </Table>
          </div>
          <Pagination
            page={paged.page}
            pages={paged.pages}
            onPage={paged.setPage}
            summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} reports`}
          />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Reports overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="flag" value={String(items.length)} label="Total reports" delta={sample ? 18 : undefined} goodWhenUp={false} />
              <MiniStat icon="clock" value={String(count("New"))} label="Pending review" delta={sample ? 12 : undefined} goodWhenUp={false} />
              <MiniStat icon="check" tone="green" value={String(count("Resolved"))} label="Resolved" delta={sample ? 24 : undefined} />
              <MiniStat icon="x" value={String(count("Dismissed"))} label="Dismissed" delta={sample ? -5 : undefined} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Reports by type" />
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
              <Donut segments={byType} />
              <DonutLegend segments={byType} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Moderation actions" />
            <div className="mt-4 space-y-2.5">
              <LinkRow icon="flag" title="Review pending reports" subtitle={`${count("New")} reports waiting for review`} onClick={() => { setTab("New"); paged.setPage(1); }} />
              <LinkRow icon="users" title="Manage flagged users" subtitle="Suspend or reinstate accounts" onClick={() => { setType("all"); setTab("all"); setSearch("User"); }} />
              <LinkRow icon="ban" title="Content filters" subtitle="Manage blocked words and links" />
              <LinkRow icon="settings" title="Moderation settings" subtitle="Configure rules and permissions" />
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={detail !== null}
        title="Report details"
        onClose={() => setDetail(null)}
        footer={
          detail && (detail.status === "New" || detail.status === "Under review") ? (
            <>
              <button type="button" onClick={() => askResolve(detail, "dismissed")} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas">Dismiss</button>
              <button type="button" onClick={() => askResolve(detail, "actioned", true)} className="rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-tint">Remove content</button>
              <button type="button" onClick={() => askResolve(detail, "actioned")} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Mark resolved</button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Thumb seed={detail.id} width={56} height={56} rounded="rounded-xl" />
              <div>
                <p className="font-semibold text-ink">{detail.title}</p>
                <p className="text-sm text-muted">{detail.targetType} · {detail.community}</p>
              </div>
            </div>
            {detail.snippet ? <blockquote className="rounded-xl bg-canvas px-4 py-3 text-sm italic text-ink/80">“{detail.snippet}”</blockquote> : null}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Reason", <Badge key="r" tone="red">{detail.reason}</Badge>],
                ["Status", <StatusBadge key="s" status={detail.status} />],
                ["Reported by", detail.reporter],
                ["Reported", formatDateTime(detail.createdAt)],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl border border-line p-3">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-1 font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {detail.details ? <p className="text-sm text-ink/80"><span className="font-medium text-ink">Reporter note: </span>{detail.details}</p> : null}
          </div>
        ) : null}
      </Modal>
      {dialog}
      {toast.element}
    </>
  );
}

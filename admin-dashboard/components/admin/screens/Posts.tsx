"use client";

import { useMemo, useState } from "react";
import { matches, useAdmin, useLiveList } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ContentRow, sampleContent } from "../sample";
import {
  Avatar,
  Card,
  CardHeader,
  Checkbox,
  DateRangeChip,
  EmptyRow,
  MiniStat,
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
  ViewAll,
  cx,
  formatDate,
  timeAgo,
  usePaged,
  useSelection,
} from "../ui";

type TabKey = "all" | "Post" | "Comment" | "Flagged" | "Deleted";

export default function Posts() {
  const { globalSearch, navigate } = useAdmin();
  // There is no admin-wide posts list in the API yet (only per-department feeds),
  // so this screen runs on sample data until one is added.
  const data = useLiveList<never, ContentRow>(null, (x) => x, sampleContent);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [community, setCommunity] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const items = data.items;
  const communities = useMemo(() => [...new Set(items.map((c) => c.community))], [items]);
  const filtered = items.filter(
    (c) =>
      (tab === "all" ? c.status !== "Deleted" : tab === "Flagged" || tab === "Deleted" ? c.status === tab : c.kind === tab && c.status !== "Deleted") &&
      (kind === "all" || c.kind === kind) &&
      (community === "all" || c.community === community) &&
      (status === "all" || c.status === status) &&
      matches(search || globalSearch, c.title, c.excerpt, c.author, c.community),
  );
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((c) => c.id));

  const preview = items.find((c) => c.id === previewId) ?? items[0] ?? null;

  const setStatusOf = (c: ContentRow, s: ContentRow["status"], msg: string) => {
    data.setItems((rows) => rows.map((r) => (r.id === c.id ? { ...r, status: s } : r)));
    toast.success(msg);
  };
  const del = (c: ContentRow) =>
    ask({
      title: `Delete ${c.kind.toLowerCase()}`,
      message: `“${c.title}” will be removed for everyone.`,
      confirmLabel: "Delete",
      danger: true,
      input: { label: "Reason", placeholder: "Optional note for the audit log" },
      onConfirm: () => setStatusOf(c, "Deleted", `${c.kind} deleted.`),
    });

  const flagged = items.filter((c) => c.status === "Flagged" || c.status === "Under review").slice(0, 3);
  const posts = items.filter((c) => c.kind === "Post").length;
  const comments = items.filter((c) => c.kind === "Comment").length;

  return (
    <>
      <PageHeader
        title="Posts and comments"
        subtitle="Moderate posts and comments across the platform."
        action={<SampleTag reason="The API has no platform-wide posts list yet (only per-department feeds). Add GET /admin/posts to make this live." />}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All content", count: items.filter((c) => c.status !== "Deleted").length },
                { key: "Post", label: "Posts", count: items.filter((c) => c.kind === "Post" && c.status !== "Deleted").length },
                { key: "Comment", label: "Comments", count: items.filter((c) => c.kind === "Comment" && c.status !== "Deleted").length },
                { key: "Flagged", label: "Flagged", count: items.filter((c) => c.status === "Flagged").length },
                { key: "Deleted", label: "Deleted", count: items.filter((c) => c.status === "Deleted").length },
              ]}
            />
            <PrimaryButton className="mb-3 self-start md:self-auto" onClick={() => toast.success("Posts are written in the CYC app.")}>Create post</PrimaryButton>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search content..." />
            <SelectField label="Type" value={kind} onChange={setKind} className="md:w-[106px]" options={[{ value: "all", label: "All types" }, { value: "Post", label: "Posts" }, { value: "Comment", label: "Comments" }]} />
            <SelectField label="Department" value={community} onChange={setCommunity} className="md:w-[138px]" options={[{ value: "all", label: "All departments" }, ...communities.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[106px]" options={[{ value: "all", label: "All status" }, ...["Active", "Flagged", "Under review", "Deleted"].map((s) => ({ value: s, label: s }))]} />
            <DateRangeChip days={Number(range)} />
          </div>

          <div className="mt-4">
            <Table minWidth={800}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Content</Th>
                  <Th>Author</Th>
                  <Th>Department</Th>
                  <Th>Type</Th>
                  <Th sortable>Status</Th>
                  <Th>Date</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((c) => (
                  <tr
                    key={c.id}
                    className={cx("cursor-pointer hover:bg-canvas/40", preview?.id === c.id ? "bg-brand-soft/25" : "")}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,input")) return;
                      setPreviewId(c.id);
                      setExpanded(false);
                    }}
                  >
                    <Td><Checkbox label={`Select ${c.title}`} checked={sel.selected.has(c.id)} onChange={(v) => sel.toggle(c.id, v)} /></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        {c.kind === "Post" ? (
                          <Thumb seed={c.title} width={46} height={46} />
                        ) : (
                          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg border border-line bg-white">
                            <Icon name="message" size={20} />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[200px] truncate font-medium text-ink">{c.title}</p>
                          <p className="max-w-[200px] truncate text-[11.5px] text-ink/70">{c.excerpt}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={c.author} size={30} />
                        <span className="whitespace-nowrap">{c.author}</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{c.community}</Td>
                    <Td>{c.kind}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="whitespace-nowrap">{timeAgo(c.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "Preview", icon: "eye", onSelect: () => setPreviewId(c.id) },
                          { label: "Approve", icon: "check", onSelect: () => setStatusOf(c, "Active", "Content approved.") },
                          { label: "Flag", icon: "flag", onSelect: () => setStatusOf(c, "Flagged", "Content flagged for review.") },
                          { label: "Delete", icon: "trash", danger: true, onSelect: () => del(c) },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {filtered.length === 0 ? <EmptyRow cols={8} title="No content found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Content overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="file" value={String(posts)} label="Posts" delta={12} />
              <MiniStat icon="message" value={String(comments)} label="Comments" delta={8} />
              <MiniStat icon="flag" value={String(items.filter((c) => c.status === "Flagged").length)} label="Flagged" delta={-24} goodWhenUp={false} />
              <MiniStat icon="trash" value={String(items.filter((c) => c.status === "Deleted").length)} label="Deleted" delta={-15} goodWhenUp={false} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Recent flagged content" action={<ViewAll onClick={() => navigate("reports")} />} />
            <ul className="mt-4 space-y-3">
              {flagged.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <Thumb seed={c.title} width={48} height={48} />
                  <Icon name="flag" size={18} className="shrink-0 text-brand" />
                  <button type="button" onClick={() => setPreviewId(c.id)} className="min-w-0 flex-1 text-left text-sm">
                    <span className="block truncate font-medium text-ink">{c.title}</span>
                    <span className="block truncate text-ink/70">“{c.excerpt}”</span>
                    <span className="block text-xs text-muted">{timeAgo(c.createdAt)}</span>
                  </button>
                  <RowMenu actions={[{ label: "Approve", icon: "check", onSelect: () => setStatusOf(c, "Active", "Content approved.") }, { label: "Delete", icon: "trash", danger: true, onSelect: () => del(c) }]} />
                </li>
              ))}
              {flagged.length === 0 ? <li className="text-sm text-muted">Nothing flagged. 🎉</li> : null}
            </ul>
          </Card>

          {preview ? (
            <Card className="p-5">
              <CardHeader title="Content preview" />
              <div className="mt-4 flex gap-3">
                <Thumb seed={preview.title} width={64} height={64} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-snug text-ink">{preview.title}</p>
                    <StatusBadge status={preview.status} />
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    by {preview.author} • {formatDate(preview.createdAt)}
                  </p>
                </div>
              </div>
              <p className={cx("mt-3 text-sm leading-6 text-ink/80", expanded ? "" : "line-clamp-2")}>{preview.excerpt}</p>
              <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-medium text-sky-700 hover:underline">
                {expanded ? "Show less" : "Show more"}
              </button>
              <div className="mt-3 flex items-center gap-6 text-sm text-ink/80">
                <span className="flex items-center gap-1.5"><Icon name="heart" size={18} className="fill-brand text-brand" />{preview.likes}</span>
                <span className="flex items-center gap-1.5"><Icon name="message" size={17} />{preview.comments}</span>
                <span className="flex items-center gap-1.5"><Icon name="share" size={17} />{preview.shares}</span>
              </div>

              <h3 className="mb-2 mt-5 font-semibold text-ink">Moderation actions</h3>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setStatusOf(preview, "Active", "Content approved.")} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"><Icon name="check" size={17} />Approve</button>
                <button type="button" onClick={() => setStatusOf(preview, "Flagged", "Content flagged.")} className="flex items-center justify-center gap-2 rounded-xl border border-brand/30 px-3 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft"><Icon name="flag" size={17} />Flag</button>
                <button type="button" onClick={() => del(preview)} className="flex items-center justify-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-sm font-medium text-brand hover:bg-brand-tint"><Icon name="trash" size={17} />Delete</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => navigate("users")} className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"><Icon name="ban" size={17} />Mute author</button>
                <button type="button" onClick={() => navigate("users")} className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"><Icon name="user" size={17} />View author</button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

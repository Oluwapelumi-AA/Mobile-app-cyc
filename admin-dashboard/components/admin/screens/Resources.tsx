"use client";

import { useState } from "react";
import { api, matches, useAdmin, useLiveList } from "../data";
import { useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ApiResource, mapResource } from "../mappers";
import { type ResourceRow, sampleResources } from "../sample";
import {
  Avatar,
  Badge,
  BarList,
  Card,
  CardHeader,
  Checkbox,
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
  type Tone,
  ViewAll,
  compactNumber,
  cx,
  formatDate,
  usePaged,
  useSelection,
} from "../ui";

export const TYPE_TONE: Record<ResourceRow["type"], Tone> = {
  Sermon: "red",
  "Bible Study": "purple",
  Devotional: "blue",
  Article: "amber",
  Other: "gray",
};

const TYPE_COLOR: Record<ResourceRow["type"], string> = {
  Sermon: "#c0262d",
  Devotional: "#2563eb",
  "Bible Study": "#9333ea",
  Article: "#eab308",
  Other: "#9ca3af",
};

type TabKey = "all" | ResourceRow["type"];

export default function Resources() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiResource, ResourceRow>("resources?limit=100", mapResource, sampleResources);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState("30");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const toast = useToast();
  const sample = data.mode === "sample";

  const items = data.items;
  const count = (t: ResourceRow["type"]) => items.filter((r) => r.type === t).length;
  const categories = [...new Set(items.map((r) => r.category))];
  const filtered = items
    .filter(
      (r) =>
        (tab === "all" || r.type === tab) &&
        (type === "all" || r.type === type) &&
        (category === "all" || r.category === category) &&
        (status === "all" || r.status === status) &&
        matches(search || globalSearch, r.title, r.summary, r.author, r.category),
    )
    .sort((a, b) =>
      sort === "views" ? (b.views ?? -1) - (a.views ?? -1) : sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((r) => r.id));

  const preview = items.find((r) => r.id === previewId) ?? items[0] ?? null;

  const setPublished = async (r: ResourceRow, publish: boolean) => {
    try {
      if (data.mode === "live") await api(`resources/${r.id}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      data.setItems((rows) => rows.map((x) => (x.id === r.id ? { ...x, status: publish ? "Published" : "Draft" } : x)));
      toast.success(publish ? "Resource published." : "Resource moved to drafts.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the resource.");
    }
  };

  const types: ResourceRow["type"][] = ["Sermon", "Devotional", "Bible Study", "Article", "Other"];
  const plural: Record<ResourceRow["type"], string> = { Sermon: "Sermons", Devotional: "Devotionals", "Bible Study": "Bible studies", Article: "Articles", Other: "Other" };
  const totalViews = items.reduce((s, r) => s + (r.views ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Spiritual resources"
        subtitle="Manage sermons, devotionals, Bible studies, articles and other resources."
        action={sample ? <SampleTag reason={data.error} /> : null}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[{ key: "all" as TabKey, label: "All resources", count: items.length }, ...types.map((t) => ({ key: t as TabKey, label: plural[t], count: count(t) }))]}
            />
            <PrimaryButton className="mb-3 self-start md:self-auto" onClick={() => toast.success("The add-resource form is the next piece to wire (POST /resources).")}>Add resource</PrimaryButton>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search resources..." />
            <SelectField label="Type" value={type} onChange={setType} className="md:w-[106px]" options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
            <SelectField label="Category" value={category} onChange={setCategory} className="md:w-[132px]" options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[116px]" options={[{ value: "all", label: "All statuses" }, ...["Published", "Draft", "Archived"].map((s) => ({ value: s, label: s }))]} />
            <SelectField label="Sort" value={sort} onChange={setSort} className="md:w-[132px]" options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "views", label: "Most viewed" }]} />
          </div>

          <div className="mt-4">
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Author</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                  <Th sortable>Views</Th>
                  <Th>Date</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={9} /> : null}
                {paged.slice.map((r) => (
                  <tr
                    key={r.id}
                    className={cx("cursor-pointer hover:bg-canvas/40", preview?.id === r.id ? "bg-brand-soft/25" : "")}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,input")) return;
                      setPreviewId(r.id);
                    }}
                  >
                    <Td><Checkbox label={`Select ${r.title}`} checked={sel.selected.has(r.id)} onChange={(v) => sel.toggle(r.id, v)} /></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb seed={r.title} width={64} height={50} />
                        <div className="min-w-0">
                          <p className="max-w-[170px] truncate font-semibold text-ink">{r.title}</p>
                          <p className="line-clamp-2 max-w-[170px] text-[12.5px] leading-snug text-ink/70">{r.summary}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge tone={TYPE_TONE[r.type]}>{r.type}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={r.author} size={28} />
                        <span className="whitespace-nowrap">{r.author}</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{r.category}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td>{r.views === null ? "–" : compactNumber(r.views)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "Preview", icon: "eye", onSelect: () => setPreviewId(r.id) },
                          r.status === "Published"
                            ? { label: "Unpublish", icon: "x", onSelect: () => void setPublished(r, false) }
                            : { label: "Publish", icon: "check", onSelect: () => void setPublished(r, true) },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={9} title="No resources found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Resources overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="book" value={String(items.length)} label="Total resources" delta={sample ? 18 : undefined} />
              <MiniStat icon="eye" value={sample ? compactNumber(totalViews) : "—"} label="Total views" delta={sample ? 26 : undefined} />
              <MiniStat icon="download" value={sample ? "2.1K" : "—"} label="Downloads" delta={sample ? 32 : undefined} />
              <MiniStat icon="users" value={String(new Set(items.map((r) => r.author)).size)} label="Contributors" delta={sample ? 14 : undefined} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Top categories" action={<ViewAll />} />
            <div className="mt-4">
              <BarList items={types.map((t) => ({ label: plural[t], value: count(t), color: TYPE_COLOR[t] }))} />
            </div>
          </Card>

          {preview ? (
            <Card className="p-5">
              <CardHeader title="Resource preview" action={<button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas">Edit</button>} />
              <Thumb seed={preview.title} icon="cross" width="100%" height={120} rounded="rounded-xl" className="mt-4" />
              <h3 className="mt-3 text-lg font-bold text-ink">{preview.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink/75">
                <span className="flex items-center gap-1"><Icon name="fileText" size={15} />{preview.type}</span>
                <span className="flex items-center gap-1"><Icon name="user" size={15} />{preview.author}</span>
                <span className="flex items-center gap-1"><Icon name="calendar" size={15} />{formatDate(preview.date)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/80">{preview.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-ink/80">
                <span className="flex items-center gap-1.5"><Icon name="eye" size={17} />{preview.views !== null ? compactNumber(preview.views) : "—"}</span>
                <span className="flex items-center gap-1.5"><Icon name="download" size={17} />{preview.downloads ?? "—"}</span>
                <span className="flex items-center gap-1.5"><Icon name="message" size={17} />{preview.comments ?? "—"}</span>
                <span className="flex items-center gap-1.5"><Icon name="heart" size={17} />{preview.likes ?? "—"}</span>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile primary icon="plus" label="Add resource" />
              <QuickTile icon="message" label="Manage categories" />
              <QuickTile icon="upload" label="Upload files" />
              <QuickTile icon="settings" label="Resource settings" />
            </div>
          </Card>
        </div>
      </div>
      {toast.element}
    </>
  );
}

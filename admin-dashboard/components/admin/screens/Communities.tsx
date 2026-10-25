"use client";

import { useMemo, useState } from "react";
import { matches, useAdmin, useLiveList } from "../data";
import { Modal, useToast } from "../dialogs";
import { type ApiCommunity, mapCommunity } from "../mappers";
import { communityCategories, type CommunityRow, sampleCommunities, sampleCommunityActivity } from "../sample";
import {
  Card,
  CardHeader,
  Checkbox,
  Donut,
  DonutLegend,
  EmptyRow,
  LoadingRows,
  MiniStat,
  PageHeader,
  Pagination,
  PrimaryButton,
  QuickTile,
  RED_RAMP,
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
  formatDate,
  formatNumber,
  timeAgo,
  usePaged,
  useSelection,
} from "../ui";

type TabKey = "all" | CommunityRow["status"];

export default function Communities() {
  const { globalSearch, navigate } = useAdmin();
  const data = useLiveList<ApiCommunity, CommunityRow>("communities?limit=100", mapCommunity, sampleCommunities);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();
  const sample = data.mode === "sample";

  const items = data.items;
  const count = (s: CommunityRow["status"]) => items.filter((c) => c.status === s).length;
  const types = useMemo(() => [...new Set(items.map((c) => c.type))], [items]);
  const cats = useMemo(() => [...new Set(items.map((c) => c.category))], [items]);

  const filtered = items
    .filter(
      (c) =>
        (tab === "all" || c.status === tab) &&
        (type === "all" || c.type === type) &&
        (category === "all" || c.category === category) &&
        (status === "all" || c.status === status) &&
        matches(search || globalSearch, c.name, c.description, c.category),
    )
    .sort((a, b) =>
      sort === "members"
        ? b.members - a.members
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((c) => c.id));

  const catSegments = (sample ? communityCategories : cats.map((c) => ({ label: c, value: items.filter((i) => i.category === c).length }))).map(
    (s, i) => ({ ...s, color: RED_RAMP[i % RED_RAMP.length] }),
  );

  const setCommunityStatus = (c: CommunityRow, s: CommunityRow["status"]) => {
    if (!sample) {
      toast.error("Community status changes need an admin endpoint in the API.");
      return;
    }
    data.setItems((rows) => rows.map((r) => (r.id === c.id ? { ...r, status: s } : r)));
    toast.success(`“${c.name}” set to ${s.toLowerCase()}.`);
  };

  return (
    <>
      <PageHeader
        title="Communities"
        subtitle="Manage communities, groups and chapters."
        action={sample ? <SampleTag reason={data.error} /> : null}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All communities", count: items.length },
                { key: "Active", label: "Active", count: count("Active") },
                { key: "Inactive", label: "Inactive", count: count("Inactive") },
                { key: "Pending", label: "Pending", count: count("Pending") },
                { key: "Archived", label: "Archived", count: count("Archived") },
              ]}
            />
            <PrimaryButton className="mb-3 self-start md:self-auto" onClick={() => setCreateOpen(true)}>Create community</PrimaryButton>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search communities..." />
            <SelectField label="Type" value={type} onChange={setType} className="md:w-[116px]" options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
            <SelectField label="Category" value={category} onChange={setCategory} className="md:w-[132px]" options={[{ value: "all", label: "All categories" }, ...cats.map((t) => ({ value: t, label: t }))]} />
            <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[116px]" options={[{ value: "all", label: "All statuses" }, ...["Active", "Inactive", "Pending", "Archived"].map((s) => ({ value: s, label: s }))]} />
            <SelectField label="Sort" value={sort} onChange={setSort} className="md:w-[132px]" options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "members", label: "Most members" }]} />
          </div>

          <div className="mt-4">
            <Table minWidth={800}>
              <thead>
                <tr>
                  <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                  <Th>Community</Th>
                  <Th>Type</Th>
                  <Th>Members</Th>
                  <Th>Posts</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={8} /> : null}
                {paged.slice.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas/40">
                    <Td><Checkbox label={`Select ${c.name}`} checked={sel.selected.has(c.id)} onChange={(v) => sel.toggle(c.id, v)} /></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb seed={c.name} width={56} height={46} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{c.name}</p>
                          <p className="line-clamp-2 max-w-[200px] text-[13px] leading-snug text-ink/70">{c.description || "—"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{c.type}</Td>
                    <Td>{formatNumber(c.members)}</Td>
                    <Td>{c.posts ?? "—"}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="whitespace-nowrap">{formatDate(c.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "View posts", icon: "message", onSelect: () => navigate("posts") },
                          c.status === "Pending"
                            ? { label: "Approve", icon: "check", onSelect: () => setCommunityStatus(c, "Active") }
                            : c.status === "Active"
                              ? { label: "Set inactive", icon: "clock", onSelect: () => setCommunityStatus(c, "Inactive") }
                              : { label: "Reactivate", icon: "checkCircle", onSelect: () => setCommunityStatus(c, "Active") },
                          { label: "Archive", icon: "trash", danger: true, onSelect: () => setCommunityStatus(c, "Archived") },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={8} title="No communities found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} communities`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Community overview" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="community" value={String(items.length)} label="Total communities" delta={sample ? 12 : undefined} />
              <MiniStat icon="check" tone="green" value={String(count("Active"))} label="Active communities" delta={sample ? 8 : undefined} />
              <MiniStat icon="clock" value={String(count("Inactive"))} label="Inactive communities" delta={sample ? -29 : undefined} goodWhenUp={false} />
              <MiniStat icon="hourglass" value={String(count("Pending"))} label="Pending approval" />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Communities by category" />
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
              <Donut segments={catSegments} />
              <DonutLegend segments={catSegments} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Recent activity" action={<ViewAll onClick={() => navigate("audit")} />} />
            {sample ? (
              <ul className="mt-4 space-y-3">
                {sampleCommunityActivity.map((a) => (
                  <li key={a.text} className="flex items-center gap-3">
                    <Thumb seed={a.text} width={36} height={36} rounded="rounded-md" />
                    <span className="min-w-0 text-sm">
                      <span className="block text-ink">{a.text}</span>
                      <span className="block text-xs text-muted">{timeAgo(a.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Community changes appear in the audit log.</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile primary icon="plus" label="Create community" onClick={() => setCreateOpen(true)} />
              <QuickTile icon="message" label="Manage categories" />
              <QuickTile icon="clock" label="Review pending" onClick={() => setTab("Pending")} />
              <QuickTile icon="settings" label="Community settings" onClick={() => navigate("settings")} />
            </div>
          </Card>
        </div>
      </div>

      <Modal open={createOpen} title="Create community" onClose={() => setCreateOpen(false)}>
        <p className="text-sm leading-6 text-ink/80">
          Communities are created by members and leaders in the CYC app (<code>POST /communities</code>), which makes the
          creator its owner. Ask the community leader to create it in the app, then manage it from here.
        </p>
      </Modal>
      {toast.element}
    </>
  );
}

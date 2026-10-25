"use client";

import { useState } from "react";
import { api, matches, useAdmin, useLiveList } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ApiBranch, mapBranch } from "../mappers";
import { type BranchRow, sampleBranches } from "../sample";
import {
  BarList,
  Card,
  CardHeader,
  EmptyRow,
  LoadingRows,
  MiniStat,
  PageHeader,
  Pagination,
  PrimaryButton,
  RowMenu,
  SampleTag,
  SearchField,
  SelectField,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  formatDate,
  formatNumber,
  usePaged,
} from "../ui";

const FLAGS: Record<string, string> = { NG: "🇳🇬", GH: "🇬🇭", GB: "🇬🇧", US: "🇺🇸", CA: "🇨🇦", KE: "🇰🇪", ZA: "🇿🇦" };

type TabKey = "all" | "active" | "archived";

export default function Branches() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiBranch, BranchRow>("branches?include_archived=true", mapBranch, sampleBranches);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";

  const items = data.items;
  const countries = [...new Set(items.map((b) => b.country))];
  const filtered = items.filter(
    (b) =>
      (tab === "all" || (tab === "active" ? b.active : !b.active)) &&
      (country === "all" || b.country === country) &&
      matches(search || globalSearch, b.name, b.city, b.country, b.contact),
  );
  const paged = usePaged(filtered, 10);

  const toggle = (b: BranchRow) =>
    ask({
      title: b.active ? `Archive ${b.name}` : `Restore ${b.name}`,
      message: b.active
        ? "Members stay in the branch, but it is hidden from sign-up and branch pickers."
        : "The branch becomes visible again.",
      confirmLabel: b.active ? "Archive" : "Restore",
      danger: b.active,
      onConfirm: async () => {
        try {
          if (data.mode === "live") await api(`branches/${b.id}/${b.active ? "archive" : "restore"}`, { method: "POST" });
          data.setItems((rows) => rows.map((r) => (r.id === b.id ? { ...r, active: !b.active } : r)));
          toast.success(b.active ? "Branch archived." : "Branch restored.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not update the branch.");
        }
      },
    });

  const totalMembers = items.reduce((s, b) => s + b.members, 0);
  const top = [...items].sort((a, b) => b.members - a.members).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Manage CYC branches and chapters around the world."
        action={
          <div className="flex items-center gap-3">
            {sample ? <SampleTag reason={data.error} /> : null}
            <PrimaryButton onClick={() => toast.success("The add-branch form is the next piece to wire (POST /branches).")}>Add branch</PrimaryButton>
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
                { key: "all", label: "All branches", count: items.length },
                { key: "active", label: "Active", count: items.filter((b) => b.active).length },
                { key: "archived", label: "Archived", count: items.filter((b) => !b.active).length },
              ]}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search branches..." />
            <SelectField label="Country" value={country} onChange={setCountry} className="md:w-[132px]" options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]} />
          </div>
          <div className="mt-4">
            <Table minWidth={780}>
              <thead>
                <tr>
                  <Th>Branch</Th>
                  <Th>Location</Th>
                  <Th>Members</Th>
                  <Th>Communities</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={8} /> : null}
                {paged.slice.map((b) => (
                  <tr key={b.id} className="hover:bg-canvas/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon name="branch" size={20} /></span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{b.name}</p>
                          <p className="truncate text-[13px] text-muted">{b.timezone}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{FLAGS[b.country] ?? "🌍"} {b.city}, {b.country}</Td>
                    <Td>{formatNumber(b.members)}</Td>
                    <Td>{b.communities}</Td>
                    <Td className="whitespace-nowrap">{b.contact}</Td>
                    <Td><StatusBadge status={b.active ? "Active" : "Archived"} /></Td>
                    <Td className="whitespace-nowrap">{formatDate(b.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu actions={[b.active ? { label: "Archive", icon: "trash", danger: true, onSelect: () => toggle(b) } : { label: "Restore", icon: "rotate", onSelect: () => toggle(b) }]} />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={8} title="No branches found" /> : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} branches`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Branch overview" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="branch" value={String(items.length)} label="Total branches" />
              <MiniStat icon="check" tone="green" value={String(items.filter((b) => b.active).length)} label="Active branches" />
              <MiniStat icon="users" value={formatNumber(totalMembers)} label="Members" />
              <MiniStat icon="globe" value={String(countries.length)} label="Countries" />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Largest branches" />
            <div className="mt-4">
              <BarList items={top.map((b, i) => ({ label: b.name.replace(/^CYC /, ""), value: b.members, color: ["#860000", "#c62828", "#e05a5f", "#ec8a8d", "#f3b3b5"][i], display: formatNumber(b.members) }))} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Icon name="lock" size={19} /></span>
              <div>
                <h3 className="font-semibold text-ink">Admins only</h3>
                <p className="mt-1 text-sm leading-6 text-ink/75">Creating, archiving and restoring branches is limited to platform admins. Moderators can view branches but not change them.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

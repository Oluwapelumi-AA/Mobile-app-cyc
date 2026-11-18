"use client";

import { useEffect, useState } from "react";
import { api, matches, useAdmin, useLiveList } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type ApiDepartment, mapDepartment } from "../mappers";
import { type DepartmentRow, sampleDepartments } from "../sample";
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
  SecondaryButton,
  SelectField,
  Table,
  Td,
  Th,
  Thumb,
  formatDate,
  formatNumber,
  usePaged,
} from "../ui";

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/**
 * Departments are platform-wide (Choir, Media, Ushering, ...). Each official
 * Member belongs to one department, picked when an admin assigns them to a
 * chapter (Users → Membership).
 */
export default function Departments() {
  const { globalSearch, navigate } = useAdmin();
  const data = useLiveList<ApiDepartment, DepartmentRow>("departments", mapDepartment, sampleDepartments);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [editing, setEditing] = useState<DepartmentRow | "new" | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";

  const items = data.items;
  const filtered = items
    .filter((d) => matches(search || globalSearch, d.name, d.description))
    .sort((a, b) =>
      sort === "members"
        ? b.members - a.members
        : sort === "newest"
          ? b.createdAt.localeCompare(a.createdAt)
          : a.name.localeCompare(b.name),
    );
  const paged = usePaged(filtered, 10);
  const assigned = items.reduce((sum, d) => sum + d.members, 0);
  const top = [...items].sort((a, b) => b.members - a.members).slice(0, 5);

  const remove = (d: DepartmentRow) =>
    ask({
      title: `Delete ${d.name}`,
      message:
        d.members > 0
          ? `${formatNumber(d.members)} member${d.members === 1 ? "" : "s"} will be left without a department until you assign them another one.`
          : "This department has no members.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          if (!sample) await api(`departments/${d.id}`, { method: "DELETE" });
          data.setItems((rows) => rows.filter((r) => r.id !== d.id));
          toast.success(`${d.name} was deleted.`);
        } catch (err) {
          toast.error(errorText(err, "Could not delete the department."));
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Platform-wide departments. Every official member belongs to one, alongside their chapter."
        action={
          <div className="flex items-center gap-3">
            {sample ? <SampleTag reason={data.error} /> : null}
            <PrimaryButton onClick={() => setEditing("new")}>Create department</PrimaryButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search departments..." />
            <SelectField
              label="Sort"
              value={sort}
              onChange={setSort}
              className="md:w-[140px]"
              options={[
                { value: "name", label: "Name (A–Z)" },
                { value: "members", label: "Most members" },
                { value: "newest", label: "Newest first" },
              ]}
            />
          </div>

          <div className="mt-4">
            <Table minWidth={640}>
              <thead>
                <tr>
                  <Th>Department</Th>
                  <Th>Members</Th>
                  <Th>Created</Th>
                  <Th>Updated</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={5} /> : null}
                {paged.slice.map((d) => (
                  <tr key={d.id} className="hover:bg-canvas/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb seed={d.name} width={46} height={46} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{d.name}</p>
                          <p className="line-clamp-2 max-w-[280px] text-[11.5px] leading-snug text-ink/70">{d.description || "—"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{formatNumber(d.members)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(d.createdAt)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(d.updatedAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "Edit", icon: "edit", onSelect: () => setEditing(d) },
                          { label: "Delete", icon: "trash", danger: true, onSelect: () => remove(d) },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? (
                  <EmptyRow cols={5} title="No departments found" hint="Create the first department." />
                ) : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} departments`} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Department overview" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="community" value={String(items.length)} label="Departments" />
              <MiniStat icon="users" value={formatNumber(assigned)} label="Members assigned" />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Largest departments" />
            <div className="mt-4">
              <BarList
                items={top.map((d, i) => ({
                  label: d.name,
                  value: d.members,
                  color: ["#860000", "#c62828", "#e05a5f", "#ec8a8d", "#f3b3b5"][i],
                  display: formatNumber(d.members),
                }))}
              />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Icon name="userPlus" size={19} />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Assigning members</h3>
                <p className="mt-1 text-sm leading-6 text-ink/75">
                  Open a user and use the <span className="font-medium text-ink">Membership</span> tab to place them in a
                  chapter and a department.
                </p>
                <button type="button" onClick={() => navigate("users")} className="mt-2 text-sm font-semibold text-brand">
                  Go to users
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <DepartmentForm
        department={editing}
        live={!sample}
        onClose={() => setEditing(null)}
        onSaved={(row, created) => {
          setEditing(null);
          data.setItems((rows) => (created ? [...rows, row] : rows.map((r) => (r.id === row.id ? { ...row, members: r.members } : r))));
          toast.success(created ? `${row.name} was created.` : `${row.name} was updated.`);
        }}
        onError={(message) => toast.error(message)}
      />
      {dialog}
      {toast.element}
    </>
  );
}

function DepartmentForm({
  department,
  live,
  onClose,
  onSaved,
  onError,
}: {
  department: DepartmentRow | "new" | null;
  live: boolean;
  onClose: () => void;
  onSaved: (row: DepartmentRow, created: boolean) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const isNew = department === "new";

  useEffect(() => {
    if (department === null) return;
    // Reset the form whenever a different department (or "new") is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(department === "new" ? "" : department.name);
    setDescription(department === "new" ? "" : department.description);
  }, [department]);

  if (department === null) return null;

  async function save() {
    if (!live) {
      onError("Connect the API to save departments.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api<ApiDepartment>(isNew ? "departments" : `departments/${(department as DepartmentRow).id}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      onSaved(mapDepartment(saved), isNew);
    } catch (err) {
      onError(errorText(err, "Could not save the department."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isNew ? "Create department" : `Edit ${(department as DepartmentRow).name}`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon={null} disabled={saving || name.trim().length < 2} onClick={() => void save()}>
            {saving ? "Saving…" : isNew ? "Create" : "Save changes"}
          </PrimaryButton>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Name<span className="text-brand"> *</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Choir"
          className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
        />
      </label>
    </Modal>
  );
}

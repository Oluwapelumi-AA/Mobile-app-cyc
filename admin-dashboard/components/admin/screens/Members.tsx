"use client";

import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv, matches, useAdmin } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { FormError, TextArea, TextInput, orNull, useSubmit } from "../forms";
import {
  Avatar,
  Badge,
  Card,
  EmptyRow,
  ExportButton,
  LoadingRows,
  Notice,
  PageHeader,
  Pagination,
  PrimaryButton,
  RowMenu,
  SearchField,
  SecondaryButton,
  SelectField,
  Table,
  Tabs,
  Td,
  Th,
  formatDate,
  usePaged,
} from "../ui";

type ApiMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  department_name: string | null;
  staff_role: "coordinator" | "moderator" | null;
  is_banned: boolean;
  joined_at: string;
};

type TabKey = "all" | "staff" | "banned";

const nameOf = (m: ApiMember) => m.display_name?.trim() || m.email.split("@")[0];

/**
 * The chapter's official Members. Moderators can ban and reinstate;
 * Coordinators can also edit a member's public profile. Adding or removing
 * members is done by platform admins.
 */
export default function Members() {
  const { scope, globalSearch } = useAdmin();
  const [rows, setRows] = useState<ApiMember[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [editing, setEditing] = useState<ApiMember | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const coordinator = scope?.role === "coordinator";

  const load = useCallback(() => {
    if (!scope) return;
    api<ApiMember[]>(`chapters/${scope.id}/members`)
      .then((r) => {
        setRows(r ?? []);
        setError("");
      })
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Could not load members.");
      });
  }, [scope]);
  useEffect(load, [load]);

  const items = rows ?? [];
  const departments = [...new Set(items.map((m) => m.department_name).filter((d): d is string => !!d))].sort();
  const filtered = items.filter(
    (m) =>
      (tab === "all" || (tab === "staff" ? m.staff_role !== null : m.is_banned)) &&
      (department === "all" || (department === "none" ? !m.department_name : m.department_name === department)) &&
      matches(search || globalSearch, nameOf(m), m.email, m.department_name ?? ""),
  );
  const paged = usePaged(filtered, 15);

  const ban = (m: ApiMember) =>
    ask({
      title: `Ban ${nameOf(m)}`,
      message: "They'll still be a member and can read the chapter, but can't post, comment, react or register for events until reinstated.",
      confirmLabel: "Ban member",
      danger: true,
      input: { label: "Reason (shown in the audit log)", placeholder: "Repeated spam in comments" },
      onConfirm: async (reason) => {
        try {
          await api(`chapters/${scope?.id}/bans/${m.user_id}`, {
            method: "PUT",
            body: JSON.stringify({ reason: reason.trim() || null }),
          });
          toast.success(`${nameOf(m)} is banned from this chapter.`);
          load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not ban this member.");
        }
      },
    });

  const unban = (m: ApiMember) =>
    ask({
      title: `Reinstate ${nameOf(m)}`,
      message: "They'll be able to post, comment, react and register for events again.",
      confirmLabel: "Reinstate",
      onConfirm: async () => {
        try {
          await api(`chapters/${scope?.id}/bans/${m.user_id}`, { method: "DELETE" });
          toast.success(`${nameOf(m)} is reinstated.`);
          load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not reinstate this member.");
        }
      },
    });

  if (!scope) return null;

  return (
    <>
      <PageHeader title="Members" subtitle={`Official members of ${scope.name}.`} />
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card className="p-4 sm:p-5">
        <div className="border-b border-line">
          <Tabs
            value={tab}
            onChange={(k) => {
              setTab(k);
              paged.setPage(1);
            }}
            tabs={[
              { key: "all", label: "All members", count: items.length },
              { key: "staff", label: "Chapter staff", count: items.filter((m) => m.staff_role).length },
              { key: "banned", label: "Banned", count: items.filter((m) => m.is_banned).length },
            ]}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex">
          <SearchField className="col-span-2 md:flex-1" value={search} onChange={setSearch} placeholder="Search by name, email or department…" />
          <SelectField
            label="Department"
            value={department}
            onChange={setDepartment}
            className="md:w-[180px]"
            options={[
              { value: "all", label: "All departments" },
              { value: "none", label: "No department" },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
          />
          <ExportButton
            onClick={() =>
              downloadCsv(
                `${scope.name.toLowerCase().replace(/\s+/g, "-")}-members.csv`,
                filtered.map((m) => ({
                  name: nameOf(m),
                  email: m.email,
                  department: m.department_name ?? "",
                  role: m.staff_role ?? "member",
                  banned: m.is_banned,
                  joined: m.joined_at,
                })),
              )
            }
          />
        </div>

        <div className="mt-4">
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Department</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th className="text-center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? <LoadingRows cols={6} /> : null}
              {paged.slice.map((m) => (
                <tr key={m.user_id} className="hover:bg-canvas/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={nameOf(m)} src={m.avatar_url} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{nameOf(m)}</p>
                        <p className="truncate text-xs text-muted">{m.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{m.department_name ?? <span className="text-muted">—</span>}</Td>
                  <Td>
                    {m.staff_role ? (
                      <Badge tone={m.staff_role === "coordinator" ? "red" : "blue"}>
                        {m.staff_role === "coordinator" ? "Coordinator" : "Moderator"}
                      </Badge>
                    ) : (
                      "Member"
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(m.joined_at)}</Td>
                  <Td>
                    {m.is_banned ? (
                      <Badge tone="red">Banned</Badge>
                    ) : m.is_active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="gray">Suspended</Badge>
                    )}
                  </Td>
                  <Td className="text-center">
                    <RowMenu
                      actions={[
                        ...(coordinator ? [{ label: "Edit profile", icon: "edit" as const, onSelect: () => setEditing(m) }] : []),
                        ...(m.staff_role
                          ? []
                          : m.is_banned
                            ? [{ label: "Reinstate", icon: "check" as const, onSelect: () => unban(m) }]
                            : [{ label: "Ban from chapter", icon: "ban" as const, danger: true, onSelect: () => ban(m) }]),
                      ]}
                    />
                  </Td>
                </tr>
              ))}
              {rows !== null && filtered.length === 0 ? (
                <EmptyRow
                  cols={6}
                  title={items.length === 0 ? "No members yet" : "No members match"}
                  hint={items.length === 0 ? "Platform admins add official members. Guests can ask to join under Access requests." : undefined}
                />
              ) : null}
            </tbody>
          </Table>
        </div>
        <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} members`} />
      </Card>

      {editing ? (
        <EditProfile
          key={editing.user_id}
          chapterId={scope.id}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success("Profile updated.");
            setEditing(null);
            load();
          }}
        />
      ) : null}
      {dialog}
      {toast.element}
    </>
  );
}

function EditProfile({
  chapterId,
  member,
  onClose,
  onSaved,
}: {
  chapterId: string;
  member: ApiMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.display_name ?? "");
  const [bio, setBio] = useState("");
  const { busy, error, run } = useSubmit();

  const save = () =>
    run(async () => {
      if (name.trim().length < 2) throw new Error("The display name needs at least 2 characters.");
      await api(`chapters/${chapterId}/members/${member.user_id}/profile`, {
        method: "PATCH",
        // An empty bio box leaves the current bio as it is.
        body: JSON.stringify(orNull(bio) ? { display_name: name.trim(), bio: orNull(bio) } : { display_name: name.trim() }),
      });
      onSaved();
    });

  return (
    <Modal
      open
      title={`Edit ${nameOf(member)}`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon="check" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Display name" required value={name} onChange={setName} />
        <TextArea label="Bio" rows={3} value={bio} onChange={setBio} placeholder="Leave empty to keep their current bio." />
        <p className="text-xs text-muted">Email, department and membership are managed by platform admins.</p>
      </div>
      <FormError message={error} />
    </Modal>
  );
}

"use client";

import { type ReactNode, useMemo, useState } from "react";
import { api, downloadCsv, matches, useAdmin, useLiveList } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { Icon, type IconName } from "../icons";
import { type ApiUser, mapUser } from "../mappers";
import { sampleUserActivity, sampleUsers, type UserRow } from "../sample";
import {
  Avatar,
  Badge,
  Card,
  Checkbox,
  DateRangeChip,
  EmptyRow,
  ExportButton,
  LoadingRows,
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
  cx,
  formatDate,
  timeAgo,
  usePaged,
  useSelection,
} from "../ui";

type TabKey = "all" | "Admin" | "Moderator" | "Pending" | "Suspended";
type PanelTab = "overview" | "activity" | "communities" | "reports";

export default function Users() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiUser, UserRow>("admin/users?limit=100", mapUser, sampleUsers);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("overview");
  const [roleModal, setRoleModal] = useState<UserRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const live = data.mode === "live";

  const items = data.items;
  const filtered = items.filter((u) => {
    const tabOk =
      tab === "all" ||
      (tab === "Admin" && u.role === "Admin") ||
      (tab === "Moderator" && u.role === "Moderator") ||
      (tab === "Pending" && u.status === "Pending") ||
      (tab === "Suspended" && (u.status === "Suspended" || u.status === "Banned"));
    return (
      tabOk &&
      (role === "all" || u.role === role) &&
      (status === "all" || u.status === status) &&
      matches(search || globalSearch, u.name, u.email)
    );
  });
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((u) => u.id));

  const selected = useMemo(() => items.find((u) => u.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const counts = {
    all: items.length,
    Admin: items.filter((u) => u.role === "Admin").length,
    Moderator: items.filter((u) => u.role === "Moderator").length,
    Pending: items.filter((u) => u.status === "Pending").length,
    Suspended: items.filter((u) => u.status === "Suspended" || u.status === "Banned").length,
  };

  const patch = (id: string, change: Partial<UserRow>) =>
    data.setItems((rows) => rows.map((u) => (u.id === id ? { ...u, ...change } : u)));

  async function run(action: () => Promise<unknown>, localChange: Partial<UserRow>, user: UserRow, message: string) {
    try {
      if (live) {
        const updated = (await action()) as ApiUser | undefined;
        if (updated && typeof updated === "object" && "id" in updated) patch(user.id, mapUser(updated));
        else patch(user.id, localChange);
      } else {
        patch(user.id, localChange);
      }
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The action failed.");
    }
  }

  const suspend = (u: UserRow, ban = false) =>
    ask({
      title: ban ? `Ban ${u.name}` : `Suspend ${u.name}`,
      message: ban
        ? "They will be signed out and blocked from the platform. This is recorded in the audit log."
        : "They will be signed out and unable to sign in until reinstated.",
      confirmLabel: ban ? "Ban user" : "Suspend user",
      danger: true,
      input: { label: "Reason", required: true, placeholder: "Shown in the audit log" },
      onConfirm: (reason) =>
        run(
          () => api(`admin/users/${u.id}/suspend`, { method: "POST", body: JSON.stringify({ reason: ban ? `Ban: ${reason}` : reason }) }),
          { status: ban ? "Banned" : "Suspended" },
          u,
          ban ? `${u.name} was banned.` : `${u.name} was suspended.`,
        ),
    });

  const reinstate = (u: UserRow) =>
    ask({
      title: `Reinstate ${u.name}`,
      message: "They will be able to sign in again.",
      confirmLabel: "Reinstate",
      input: { label: "Note", placeholder: "Optional" },
      onConfirm: (note) =>
        run(
          () => api(`admin/users/${u.id}/reinstate`, { method: "POST", body: JSON.stringify(note ? { note } : {}) }),
          { status: "Active" },
          u,
          `${u.name} was reinstated.`,
        ),
    });

  const mute = (u: UserRow) => {
    if (live) {
      toast.error("Muting isn't available in the API yet — use Suspend instead.");
      return;
    }
    patch(u.id, { status: u.status === "Muted" ? "Active" : "Muted" });
    toast.success(u.status === "Muted" ? `${u.name} was unmuted.` : `${u.name} was muted.`);
  };

  const rowActions = (u: UserRow) => {
    const blocked = u.status === "Suspended" || u.status === "Banned";
    return [
      { label: "View details", icon: "eye" as IconName, onSelect: () => { setSelectedId(u.id); setPanelOpen(true); } },
      { label: "Change role", icon: "cap" as IconName, onSelect: () => setRoleModal(u) },
      blocked
        ? { label: "Reinstate", icon: "checkCircle" as IconName, onSelect: () => reinstate(u) }
        : { label: "Suspend", icon: "ban" as IconName, danger: true, onSelect: () => suspend(u) },
    ];
  };

  return (
    <>
      <div className={cx("grid grid-cols-1 gap-5", panelOpen && selected ? "xl:grid-cols-[minmax(0,1fr)_370px]" : "")}>
        <div className="min-w-0">
          <PageHeader
            title="Users"
            subtitle="Manage user accounts, roles, permissions and activity."
            action={
              <div className="flex items-center gap-3">
                {data.mode === "sample" ? <SampleTag reason={data.error} /> : null}
                <PrimaryButton onClick={() => setInviteOpen(true)}>Add user</PrimaryButton>
              </div>
            }
          />
          <Card className="p-4 sm:p-5">
            <div className="border-b border-line">
              <Tabs
                value={tab}
                onChange={(k) => { setTab(k); paged.setPage(1); }}
                tabs={[
                  { key: "all", label: "All users", count: counts.all },
                  { key: "Admin", label: "Admins", count: counts.Admin },
                  { key: "Moderator", label: "Moderators", count: counts.Moderator },
                  { key: "Pending", label: "Pending", count: counts.Pending },
                  { key: "Suspended", label: "Suspended", count: counts.Suspended },
                ]}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
              <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search users..." />
              <SelectField label="Role" value={role} onChange={setRole} className="md:w-[106px]" options={[{ value: "all", label: "All roles" }, { value: "Member", label: "Member" }, { value: "Moderator", label: "Moderator" }, { value: "Admin", label: "Admin" }]} />
              <SelectField label="Department" value="all" onChange={() => {}} className="md:w-[132px]" options={[{ value: "all", label: "All departments" }]} />
              <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[106px]" options={[{ value: "all", label: "All status" }, ...["Active", "Pending", "Muted", "Suspended", "Banned"].map((s) => ({ value: s, label: s }))]} />
              <DateRangeChip />
              <ExportButton onClick={() => downloadCsv("cyc-users.csv", filtered.map((u) => ({ name: u.name, email: u.email, role: u.role, status: u.status, joined: u.joined, last_active: u.lastActive ?? "" })))} />
            </div>

            <div className="mt-4">
              <Table minWidth={780}>
                <thead>
                  <tr>
                    <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
                    <Th sortable>User</Th>
                    <Th>Role</Th>
                    <Th>Departments</Th>
                    <Th sortable>Status</Th>
                    <Th sortable>Joined</Th>
                    <Th sortable>Last active</Th>
                    <Th className="text-center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.mode === "loading" ? <LoadingRows cols={8} /> : null}
                  {paged.slice.map((u) => (
                    <tr
                      key={u.id}
                      className={cx("cursor-pointer hover:bg-canvas/40", selected?.id === u.id && panelOpen ? "row-active" : "")}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,input")) return;
                        setSelectedId(u.id);
                        setPanelOpen(true);
                      }}
                    >
                      <Td><Checkbox label={`Select ${u.name}`} checked={sel.selected.has(u.id)} onChange={(v) => sel.toggle(u.id, v)} /></Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar} size={38} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{u.name}</p>
                            <p className="truncate text-[11.5px] text-muted">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>{u.role}</Td>
                      <Td>{u.communities ?? "—"}</Td>
                      <Td><StatusBadge status={u.status} /></Td>
                      <Td className="whitespace-nowrap">{formatDate(u.joined)}</Td>
                      <Td className="whitespace-nowrap">{u.lastActive ? timeAgo(u.lastActive) : "Never"}</Td>
                      <Td className="text-center"><RowMenu actions={rowActions(u)} /></Td>
                    </tr>
                  ))}
                  {data.mode !== "loading" && filtered.length === 0 ? <EmptyRow cols={8} title="No users found" hint="Try a different search or reset the filters." /> : null}
                </tbody>
              </Table>
            </div>
            <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} users`} />
            {data.nextCursor ? (
              <div className="mt-3 text-center">
                <button type="button" disabled={data.loadingMore} onClick={() => void data.loadMore()} className="text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-50">
                  {data.loadingMore ? "Loading…" : "Load more users from the server"}
                </button>
              </div>
            ) : null}
          </Card>
        </div>

        {panelOpen && selected ? (
          <UserPanel
            user={selected}
            tab={panelTab}
            onTab={setPanelTab}
            onClose={() => setPanelOpen(false)}
            onRole={() => setRoleModal(selected)}
            onMute={() => mute(selected)}
            onSuspend={() => (selected.status === "Suspended" || selected.status === "Banned" ? reinstate(selected) : suspend(selected))}
            onBan={() => suspend(selected, true)}
            onMessage={() => toast.success("Direct messages will open in the CYC app.")}
          />
        ) : null}
      </div>

      <Modal
        open={roleModal !== null}
        title="Change role"
        onClose={() => setRoleModal(null)}
      >
        {roleModal ? (
          <div className="space-y-2">
            <p className="mb-3 text-sm text-ink/80">Choose a new role for <span className="font-semibold text-ink">{roleModal.name}</span>.</p>
            {([
              ["user", "Member", "Standard access to the app"],
              ["moderator", "Moderator", "Can review reports and moderate content"],
              ["admin", "Admin", "Full access to this dashboard"],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const u = roleModal;
                  setRoleModal(null);
                  if (u.apiRole === value) return;
                  void run(
                    () => api(`admin/users/${u.id}/role`, { method: "PATCH", body: JSON.stringify({ account_role: value }) }),
                    { apiRole: value, role: label },
                    u,
                    `${u.name} is now ${label === "Admin" ? "an" : "a"} ${label}.`,
                  );
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left",
                  roleModal.apiRole === value ? "border-brand bg-brand-soft/50" : "border-line hover:bg-canvas",
                )}
              >
                <span>
                  <span className="block font-medium text-ink">{label}</span>
                  <span className="block text-[11.5px] text-muted">{hint}</span>
                </span>
                {roleModal.apiRole === value ? <Icon name="check" className="text-brand" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal open={inviteOpen} title="Add user" onClose={() => setInviteOpen(false)}>
        <p className="text-sm leading-6 text-ink/80">
          Members create their own accounts in the CYC app. To give someone staff access, find them in this list and use{" "}
          <span className="font-medium text-ink">Change role</span>.
        </p>
        <p className="mt-3 rounded-xl bg-canvas px-4 py-3 text-[11.5px] text-muted">
          Inviting users from the dashboard needs a backend endpoint (e.g. <code>POST /admin/users/invite</code>) that doesn&apos;t exist yet.
        </p>
      </Modal>
      {dialog}
      {toast.element}
    </>
  );
}

function UserPanel({
  user,
  tab,
  onTab,
  onClose,
  onRole,
  onMute,
  onSuspend,
  onBan,
  onMessage,
}: {
  user: UserRow;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  onRole: () => void;
  onMute: () => void;
  onSuspend: () => void;
  onBan: () => void;
  onMessage: () => void;
}) {
  const blocked = user.status === "Suspended" || user.status === "Banned";
  const rows: [IconName, string, ReactNode][] = [
    ["user", "Role", user.role],
    ["shieldCheck", "Account status", <StatusBadge key="s" status={user.status} />],
    ["badgeCheck", "Email verified", <StatusBadge key="e" status={user.emailVerified ? "Yes" : "No"} />],
    ["phone", "Phone verified", user.live ? "—" : <StatusBadge key="p" status="No" />],
    ["clock", "Last active", user.lastActive ? timeAgo(user.lastActive) : "Never"],
    ["calendar", "Joined", formatDate(user.joined)],
  ];

  return (
    <Card className="self-start p-5 xl:sticky xl:top-4">
      <div className="flex items-start gap-4">
        <Avatar name={user.name} src={user.avatar} size={72} />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-ink">{user.name}</h2>
            <StatusBadge status={user.status} />
          </div>
          <p className="truncate text-sm text-ink/70">{user.email}</p>
          <p className="text-sm text-muted">Member since {formatDate(user.joined)}</p>
        </div>
        <button type="button" aria-label="Close panel" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line py-3 text-center">
        {[
          [user.communities, "Departments"],
          [user.posts, "Posts"],
          [user.comments, "Comments"],
        ].map(([v, l]) => (
          <div key={String(l)}>
            <p className="text-xl font-bold text-ink">{v ?? "—"}</p>
            <p className="text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 border-b border-line">
        <Tabs
          size="sm"
          value={tab}
          onChange={onTab}
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "activity", label: "Activity" },
            { key: "communities", label: "Departments" },
            { key: "reports", label: "Reports" },
          ]}
        />
      </div>

      {tab === "overview" ? (
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line">
          {rows.map(([icon, label, value]) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Icon name={icon} size={17} className="text-ink/70" />
              <dt className="flex-1 text-ink/80">{label}</dt>
              <dd className="text-ink/90">{value}</dd>
            </div>
          ))}
        </dl>
      ) : tab === "reports" ? (
        <div className="mt-4 rounded-xl bg-canvas px-4 py-5 text-center">
          <p className="text-2xl font-bold text-ink">{user.openReports}</p>
          <p className="text-sm text-muted">Open reports about this user or their content</p>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-canvas px-4 py-5 text-center text-sm text-muted">
          {user.live ? "Per-user activity needs an activity endpoint in the API." : "Detailed activity appears here."}
        </p>
      )}

      {!user.live ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-ink">Recent activity</h3>
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => onTab("activity")}>View all</button>
          </div>
          <ul className="space-y-3">
            {sampleUserActivity.map((a) => (
              <li key={a.text} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line">
                  <Icon name={a.icon} size={17} />
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block text-ink">{a.text}</span>
                  <span className="block text-xs text-muted">{timeAgo(a.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 font-semibold text-ink">Actions</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <PanelAction icon="message" label="Send message" onClick={onMessage} />
        <PanelAction icon="user" label="View profile" onClick={() => onTab("overview")} />
        <PanelAction icon="cap" label="Change role" onClick={onRole} />
        <PanelAction icon="volumeOff" label={user.status === "Muted" ? "Unmute user" : "Mute user"} tone="warning" onClick={onMute} />
        <PanelAction icon={blocked ? "checkCircle" : "ban"} label={blocked ? "Reinstate user" : "Suspend user"} tone={blocked ? "success" : "danger"} onClick={onSuspend} />
        <PanelAction icon="ban" label="Ban user" tone="danger" onClick={onBan} disabled={user.status === "Banned"} />
      </div>
      {user.live ? (
        <p className="mt-3 text-[10.5px] text-muted">
          <Badge tone="gray">Note</Badge> Mute isn&apos;t in the API yet; Ban suspends the account with a “Ban:” reason.
        </p>
      ) : null}
    </Card>
  );
}

function PanelAction({
  icon,
  label,
  onClick,
  tone = "default",
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: "default" | "warning" | "danger" | "success";
  disabled?: boolean;
}) {
  const tones = {
    default: "border-line bg-white text-ink hover:bg-canvas",
    warning: "border-transparent bg-amber-50 text-amber-800 hover:bg-amber-100",
    danger: "border-transparent bg-brand-soft text-brand hover:bg-brand-tint",
    success: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition disabled:opacity-50", tones[tone])}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api, invalidateChapters, matches, useAdmin, useLiveList } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import {
  type ApiChapter,
  type ApiChapterDashboard,
  type ApiChapterMember,
  type ApiStaff,
  mapChapter,
} from "../mappers";
import { type ChapterRow, sampleChapters } from "../sample";
import {
  Avatar,
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
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cx,
  formatDate,
  formatNumber,
  usePaged,
} from "../ui";

const FLAGS: Record<string, string> = {
  NG: "🇳🇬",
  GH: "🇬🇭",
  GB: "🇬🇧",
  IE: "🇮🇪",
  CM: "🇨🇲",
  US: "🇺🇸",
  CA: "🇨🇦",
  KE: "🇰🇪",
  ZA: "🇿🇦",
};

type TabKey = "all" | "active" | "archived";

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export default function Chapters() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiChapter, ChapterRow>("chapters?include_archived=true", mapChapter, sampleChapters);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [editing, setEditing] = useState<ChapterRow | "new" | null>(null);
  const [managing, setManaging] = useState<ChapterRow | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";
  const live = !sample;

  const items = data.items;
  const countries = [...new Set(items.map((b) => b.country))];
  const filtered = items.filter(
    (b) =>
      (tab === "all" || (tab === "active" ? b.active : !b.active)) &&
      (country === "all" || b.country === country) &&
      matches(search || globalSearch, b.name, b.city, b.country, b.contact),
  );
  const paged = usePaged(filtered, 10);

  const toggle = (b: ChapterRow) =>
    ask({
      title: b.active ? `Archive ${b.name}` : `Restore ${b.name}`,
      message: b.active
        ? "Members keep their chapter, but it is hidden from everyone except platform staff and can't be picked any more."
        : "The chapter becomes visible again.",
      confirmLabel: b.active ? "Archive" : "Restore",
      danger: b.active,
      onConfirm: async () => {
        try {
          if (live) await api(`chapters/${b.id}/${b.active ? "archive" : "restore"}`, { method: "POST" });
          data.setItems((rows) => rows.map((r) => (r.id === b.id ? { ...r, active: !b.active } : r)));
          invalidateChapters();
          toast.success(b.active ? "Chapter archived." : "Chapter restored.");
        } catch (err) {
          toast.error(errorText(err, "Could not update the chapter."));
        }
      },
    });

  const totalMembers = items.reduce((s, b) => s + b.members, 0);
  const top = [...items].sort((a, b) => b.members - a.members).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Chapters"
        subtitle="Chapters are where members belong: their posts, events, meetings, resources and moderation all live here."
        action={
          <div className="flex items-center gap-3">
            {sample ? <SampleTag reason={data.error} /> : null}
            <PrimaryButton onClick={() => setEditing("new")}>Add chapter</PrimaryButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="border-b border-line">
            <Tabs
              value={tab}
              onChange={(k) => {
                setTab(k);
                paged.setPage(1);
              }}
              tabs={[
                { key: "all", label: "All chapters", count: items.length },
                { key: "active", label: "Active", count: items.filter((b) => b.active).length },
                { key: "archived", label: "Archived", count: items.filter((b) => !b.active).length },
              ]}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search chapters..." />
            <SelectField
              label="Country"
              value={country}
              onChange={setCountry}
              className="md:w-[132px]"
              options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <div className="mt-4">
            <Table minWidth={780}>
              <thead>
                <tr>
                  <Th>Chapter</Th>
                  <Th>Location</Th>
                  <Th>Members</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={7} /> : null}
                {paged.slice.map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-canvas/40" onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    setManaging(b);
                  }}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                          <Icon name="branch" size={20} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{b.name}</p>
                          <p className="truncate text-[11.5px] text-muted">{b.timezone}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {FLAGS[b.country] ?? "🌍"} {b.city}, {b.country}
                    </Td>
                    <Td>{formatNumber(b.members)}</Td>
                    <Td className="whitespace-nowrap">{b.contact}</Td>
                    <Td>
                      <StatusBadge status={b.active ? "Active" : "Archived"} />
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(b.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "Manage", icon: "settings", onSelect: () => setManaging(b) },
                          { label: "Edit details", icon: "edit", onSelect: () => setEditing(b) },
                          b.active
                            ? { label: "Archive", icon: "trash", danger: true, onSelect: () => toggle(b) }
                            : { label: "Restore", icon: "rotate", onSelect: () => toggle(b) },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? (
                  <EmptyRow cols={7} title="No chapters found" hint="Add the first chapter to get started." />
                ) : null}
              </tbody>
            </Table>
          </div>
          <Pagination
            page={paged.page}
            pages={paged.pages}
            onPage={paged.setPage}
            summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} chapters`}
          />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Chapter overview" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="branch" value={String(items.length)} label="Total chapters" />
              <MiniStat icon="check" tone="green" value={String(items.filter((b) => b.active).length)} label="Active chapters" />
              <MiniStat icon="users" value={formatNumber(totalMembers)} label="Members" />
              <MiniStat icon="globe" value={String(countries.length)} label="Countries" />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Largest chapters" />
            <div className="mt-4">
              <BarList
                items={top.map((b, i) => ({
                  label: b.name.replace(/^CYC /, ""),
                  value: b.members,
                  color: ["#860000", "#c62828", "#e05a5f", "#ec8a8d", "#f3b3b5"][i],
                  display: formatNumber(b.members),
                }))}
              />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Icon name="lock" size={19} />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Who does what</h3>
                <p className="mt-1 text-sm leading-6 text-ink/75">
                  Platform admins create chapters, assign members and appoint coordinators. Each chapter has one{" "}
                  <span className="font-medium text-ink">Coordinator</span> who runs it: events, live sessions,
                  announcements, access requests and moderation. Resources and courses are managed by admins.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ChapterForm
        chapter={editing}
        live={live}
        onClose={() => setEditing(null)}
        onSaved={(row, created) => {
          setEditing(null);
          invalidateChapters();
          if (created) {
            data.reload();
          } else {
            data.setItems((rows) => rows.map((r) => (r.id === row.id ? row : r)));
          }
          toast.success(created ? `${row.name} was created.` : `${row.name} was updated.`);
        }}
        onError={(message) => toast.error(message)}
      />
      {managing ? (
        <ChapterManager chapter={managing} live={live} onClose={() => setManaging(null)} onToast={toast} />
      ) : null}
      {dialog}
      {toast.element}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit                                                       */
/* ------------------------------------------------------------------ */

type FormState = {
  name: string;
  city: string;
  country_code: string;
  timezone: string;
  language_code: string;
  contact_email: string;
  description: string;
  contact_phone: string;
  state: string;
  venue: string;
  address: string;
  meeting_schedule: string;
  meeting_time: string;
  latitude: string;
  longitude: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  city: "",
  country_code: "NG",
  timezone: "Africa/Lagos",
  language_code: "en",
  contact_email: "",
  description: "",
  contact_phone: "",
  state: "",
  venue: "",
  address: "",
  meeting_schedule: "",
  meeting_time: "",
  latitude: "",
  longitude: "",
};

function ChapterForm({
  chapter,
  live,
  onClose,
  onSaved,
  onError,
}: {
  chapter: ChapterRow | "new" | null;
  live: boolean;
  onClose: () => void;
  onSaved: (row: ChapterRow, created: boolean) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isNew = chapter === "new";

  useEffect(() => {
    if (chapter === null) return;
    // Reset the form whenever a different chapter (or "new") is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(
      chapter === "new"
        ? EMPTY_FORM
        : {
            name: chapter.name,
            city: chapter.city === "—" ? "" : chapter.city,
            country_code: chapter.country,
            timezone: chapter.timezone,
            language_code: chapter.language ?? "",
            contact_email: chapter.contact === "—" ? "" : chapter.contact,
            description: chapter.description,
            contact_phone: chapter.details?.contact_phone ?? "",
            state: chapter.details?.state ?? "",
            venue: chapter.details?.venue ?? "",
            address: chapter.details?.address ?? "",
            meeting_schedule: chapter.details?.meeting_schedule ?? "",
            meeting_time: chapter.details?.meeting_time ?? "",
            latitude: chapter.details?.latitude?.toString() ?? "",
            longitude: chapter.details?.longitude?.toString() ?? "",
          },
    );
  }, [chapter]);

  if (chapter === null) return null;

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!live) {
      onError("Connect the API to save chapters.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        city: form.city.trim() || null,
        country_code: form.country_code.trim().toUpperCase(),
        timezone: form.timezone.trim(),
        language_code: form.language_code.trim() || null,
        contact_email: form.contact_email.trim() || null,
        description: form.description.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        state: form.state.trim() || null,
        venue: form.venue.trim() || null,
        address: form.address.trim() || null,
        meeting_schedule: form.meeting_schedule.trim() || null,
        meeting_time: form.meeting_time.trim() || null,
        latitude: form.latitude.trim() ? Number(form.latitude) : null,
        longitude: form.longitude.trim() ? Number(form.longitude) : null,
      };
      const saved = await api<ApiChapter>(isNew ? "chapters" : `chapters/${(chapter as ChapterRow).id}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      onSaved(mapChapter(saved), isNew);
    } catch (err) {
      onError(errorText(err, "Could not save the chapter."));
    } finally {
      setSaving(false);
    }
  }

  const valid = form.name.trim().length >= 2 && form.country_code.trim().length === 2 && form.timezone.trim();

  return (
    <Modal
      open
      title={isNew ? "Add chapter" : `Edit ${(chapter as ChapterRow).name}`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon={null} disabled={!valid || saving} onClick={() => void save()}>
            {saving ? "Saving…" : isNew ? "Create chapter" : "Save changes"}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2" value={form.name} onChange={set("name")} placeholder="CYC Lagos" />
        <Field label="City" value={form.city} onChange={set("city")} placeholder="Lagos" />
        <Field label="Country code" required value={form.country_code} onChange={set("country_code")} placeholder="NG" />
        <Field label="Time zone" required value={form.timezone} onChange={set("timezone")} placeholder="Africa/Lagos" />
        <Field label="Language" value={form.language_code} onChange={set("language_code")} placeholder="en-NG" />
        <Field label="State or region" value={form.state} onChange={set("state")} placeholder="Lagos State" />
        <Field label="Contact phone" value={form.contact_phone} onChange={set("contact_phone")} placeholder="+234 800 000 0000" />
        <Field label="Contact email" className="sm:col-span-2" value={form.contact_email} onChange={set("contact_email")} placeholder="lagos@cyc.org" />
        <Field label="Meeting day" value={form.meeting_schedule} onChange={set("meeting_schedule")} placeholder="Sundays" />
        <Field label="Meeting time" value={form.meeting_time} onChange={set("meeting_time")} placeholder="2:00 pm – 4:00 pm" />
        <Field label="Venue" value={form.venue} onChange={set("venue")} placeholder="Chapter hall" />
        <Field label="Street address" value={form.address} onChange={set("address")} placeholder="12 Wuse Road" />
        <Field label="Latitude (for “near you”)" value={form.latitude} onChange={set("latitude")} placeholder="9.0765" />
        <Field label="Longitude" value={form.longitude} onChange={set("longitude")} placeholder="7.3986" />
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
          />
        </label>
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-brand"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Manage one chapter                                                  */
/* ------------------------------------------------------------------ */

type ManagerTab = "overview" | "staff" | "members" | "announce";
type Toast = { success: (text: string) => void; error: (text: string) => void };

function ChapterManager({
  chapter,
  live,
  onClose,
  onToast,
}: {
  chapter: ChapterRow;
  live: boolean;
  onClose: () => void;
  onToast: Toast;
}) {
  const [tab, setTab] = useState<ManagerTab>("overview");

  return (
    <Modal open wide title={chapter.name} onClose={onClose}>
      <div className="-mt-2 border-b border-line">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "staff", label: "Coordinator" },
            { key: "members", label: "Members" },
            { key: "announce", label: "Announce" },
          ]}
        />
      </div>
      {!live ? (
        <p className="mt-5 rounded-xl bg-canvas px-4 py-5 text-center text-sm text-muted">
          Sample chapter. Connect the API to manage staff and members.
        </p>
      ) : tab === "overview" ? (
        <ChapterStats chapterId={chapter.id} />
      ) : tab === "staff" ? (
        <StaffPanel chapterId={chapter.id} onToast={onToast} />
      ) : tab === "members" ? (
        <MembersPanel chapterId={chapter.id} onToast={onToast} />
      ) : (
        <AnnouncePanel chapterId={chapter.id} onToast={onToast} />
      )}
    </Modal>
  );
}

function useFetch<T>(path: string) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string }>({
    path: "",
    data: null,
    error: "",
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ path, data, error: "" }))
      .catch((err) => !cancelled && setState({ path, data: null, error: errorText(err, "Could not load.") }));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = state.path !== path;
  return { data: loading ? null : state.data, error: loading ? "" : state.error, loading, reload };
}

function ChapterStats({ chapterId }: { chapterId: string }) {
  const { data, error, loading } = useFetch<ApiChapterDashboard>(`chapters/${chapterId}/dashboard`);
  if (loading) return <p className="mt-5 text-sm text-muted">Loading…</p>;
  if (error || !data) return <p className="mt-5 text-sm text-brand">{error}</p>;
  const stats: [string, number][] = [
    ["Members", data.member_count],
    ["Coordinators", data.coordinator_count],
    ["Posts", data.post_count],
    ["Upcoming events", data.upcoming_event_count],
    ["Published resources", data.published_resource_count],
    ["Open reports", data.open_report_count],
    ["Pending access requests", data.pending_access_request_count],
    ["Bans", data.ban_count],
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line px-4 py-3">
          <p className="text-xl font-bold text-ink">{formatNumber(value)}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}


function StaffPanel({ chapterId, onToast }: { chapterId: string; onToast: Toast }) {
  const { navigate } = useAdmin();
  const staff = useFetch<ApiStaff[]>(`chapters/${chapterId}/staff`);
  const [busy, setBusy] = useState(false);

  async function remove(userId: string) {
    setBusy(true);
    try {
      await api(`chapters/${chapterId}/staff/${userId}`, { method: "DELETE" });
      onToast.success("Coordinator removed. They stay a member of the chapter.");
      staff.reload();
    } catch (err) {
      onToast.error(errorText(err, "Could not remove the coordinator."));
    } finally {
      setBusy(false);
    }
  }

  const rows = staff.data ?? [];

  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-semibold text-ink">Coordinator</h3>
      {staff.loading ? <p className="text-sm text-muted">Loading…</p> : null}
      {staff.error ? <p className="text-sm text-brand">{staff.error}</p> : null}
      {!staff.loading && rows.length === 0 ? (
        <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">This chapter has no coordinator yet.</p>
      ) : null}
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((s) => {
            const name = s.display_name || s.email || s.user_id;
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{name}</p>
                  <p className="truncate text-xs text-muted">{s.email}</p>
                </div>
                <StatusBadge status="Coordinator" />
                <SecondaryButton tone="danger" disabled={busy} onClick={() => void remove(s.user_id)}>
                  Remove
                </SecondaryButton>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton icon={rows.length ? "refresh" : "plus"} onClick={() => navigate("team")}>
          {rows.length ? "Replace coordinator" : "Assign a coordinator"}
        </PrimaryButton>
        <p className="text-xs text-muted">Opens Admins and coordinators, where you pick the person and this chapter.</p>
      </div>
    </div>
  );
}

function MembersPanel({ chapterId, onToast }: { chapterId: string; onToast: Toast }) {
  const members = useFetch<ApiChapterMember[]>(`chapters/${chapterId}/members`);
  const { ask, dialog } = useConfirm();
  const [search, setSearch] = useState("");

  const act = (title: string, message: string, label: string, run: (note: string) => Promise<unknown>, done: string, input = false) =>
    ask({
      title,
      message,
      confirmLabel: label,
      danger: true,
      input: input ? { label: "Reason", placeholder: "Shown to other staff in the ban list" } : undefined,
      onConfirm: async (note) => {
        try {
          await run(note);
          onToast.success(done);
          members.reload();
        } catch (err) {
          onToast.error(errorText(err, "The action failed."));
        }
      },
    });

  const rows = (members.data ?? []).filter((m) => matches(search, m.display_name, m.email, m.department_name));

  return (
    <div className="mt-5">
      <SearchField value={search} onChange={setSearch} placeholder="Search members..." />
      {members.loading ? <p className="mt-3 text-sm text-muted">Loading…</p> : null}
      {members.error ? <p className="mt-3 text-sm text-brand">{members.error}</p> : null}
      {!members.loading && !members.error && rows.length === 0 ? (
        <p className="mt-3 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          No members yet. Assign members from the Users screen (Membership tab).
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {rows.map((m) => {
          const name = m.display_name || m.email;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar name={name} src={m.avatar_url} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-xs text-muted">
                  {m.email}
                  {m.department_name ? ` · ${m.department_name}` : ""}
                </p>
              </div>
              {m.staff_role ? <StatusBadge status="Coordinator" /> : null}
              {m.is_banned ? <StatusBadge status="Banned" /> : null}
              <RowMenu
                actions={[
                  m.is_banned
                    ? {
                        label: "Lift ban",
                        icon: "checkCircle",
                        onSelect: () =>
                          act(
                            `Lift ban on ${name}`,
                            "They can post, comment, react and register in this chapter again.",
                            "Lift ban",
                            () => api(`chapters/${chapterId}/bans/${m.user_id}`, { method: "DELETE" }),
                            "Ban lifted.",
                          ),
                      }
                    : {
                        label: "Ban from chapter",
                        icon: "ban",
                        danger: true,
                        onSelect: () =>
                          act(
                            `Ban ${name}`,
                            "They stay a member and can still read, but can't post, comment, react or register here until the ban is lifted.",
                            "Ban",
                            (note) =>
                              api(`chapters/${chapterId}/bans/${m.user_id}`, {
                                method: "PUT",
                                body: JSON.stringify(note ? { reason: note } : {}),
                              }),
                            "Member banned.",
                            true,
                          ),
                      },
                  {
                    label: "Remove from chapter",
                    icon: "trash",
                    danger: true,
                    onSelect: () =>
                      act(
                        `Remove ${name}`,
                        "They become a guest and lose access to this chapter's content. They're notified.",
                        "Remove",
                        () => api(`chapters/${chapterId}/members/${m.user_id}`, { method: "DELETE" }),
                        "Member removed.",
                      ),
                  },
                ]}
              />
            </li>
          );
        })}
      </ul>
      {dialog}
    </div>
  );
}

function AnnouncePanel({ chapterId, onToast }: { chapterId: string; onToast: Toast }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const result = await api<{ recipients: number }>(`chapters/${chapterId}/announcements`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      onToast.success(`Announcement sent to ${result.recipients} member${result.recipients === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
    } catch (err) {
      onToast.error(errorText(err, "Could not send the announcement."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-muted">
        Sent as an in-app and push notification to every active member of this chapter (members can turn chapter
        notifications off in their settings).
      </p>
      <Field label="Title" required value={title} onChange={setTitle} placeholder="Chapter retreat this Saturday" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Message<span className="text-brand"> *</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
        />
      </label>
      <div className="flex justify-end">
        <PrimaryButton icon="megaphone" disabled={sending || !title.trim() || !body.trim()} onClick={() => void send()}>
          {sending ? "Sending…" : "Send announcement"}
        </PrimaryButton>
      </div>
    </div>
  );
}

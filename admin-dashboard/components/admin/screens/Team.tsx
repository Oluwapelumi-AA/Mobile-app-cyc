"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, matches, useAdmin, useChapters } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { CheckRow, FormError, Select, TextInput, useSubmit } from "../forms";
import { Icon } from "../icons";
import type { ApiUser } from "../mappers";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyRow,
  LoadingRows,
  MiniStat,
  Notice,
  PageHeader,
  PrimaryButton,
  RowMenu,
  SearchField,
  SecondaryButton,
  Table,
  Tabs,
  Td,
  Th,
  cx,
  formatDate,
  timeAgo,
} from "../ui";

type Person = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
};
type PlatformStaff = Person & { account_role: "admin" | "moderator" | "user"; created_at: string };
type ChapterStaff = Person & {
  id: string;
  chapter_id: string;
  chapter_name: string;
  chapter_active: boolean;
  role: "coordinator" | "moderator";
  assigned_at: string;
};
type TeamData = { platform: PlatformStaff[]; chapter_staff: ChapterStaff[] };
type ChangeResult = { user_id: string; email: string; display_name: string | null; temporary_password: string | null };

type TabKey = "coordinators" | "moderators" | "platform";

const nameOf = (p: { display_name: string | null; email: string }) => p.display_name?.trim() || p.email.split("@")[0];

/**
 * Admins only: who runs the app. Add Coordinators (always with their
 * Chapter), add Admins and app Moderators, remove roles and reset
 * passwords.
 */
export default function Team() {
  const { globalSearch } = useAdmin();
  const { chapters } = useChapters();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("coordinators");
  const [search, setSearch] = useState("");
  const [wizard, setWizard] = useState<{ chapterId?: string; replace?: boolean } | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [revealed, setRevealed] = useState<ChangeResult | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const load = useCallback(() => {
    api<TeamData>("admin/team")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the team."));
  }, []);
  useEffect(load, [load]);

  const staff = useMemo(() => data?.chapter_staff ?? [], [data]);
  const coordinators = staff.filter((s) => s.role === "coordinator");
  const moderators = staff.filter((s) => s.role === "moderator");
  const platform = data?.platform ?? [];
  const coordinated = new Set(coordinators.map((c) => c.chapter_id));
  const uncovered = chapters.filter((c) => c.active && !coordinated.has(c.id));
  const q = search || globalSearch;

  const removeCoordinator = (c: ChapterStaff) =>
    ask({
      title: `Remove ${nameOf(c)} as Coordinator`,
      message: `${c.chapter_name} will have no Coordinator until you add one. ${nameOf(c)} stays a member of the chapter.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`admin/coordinators/${c.chapter_id}`, { method: "DELETE" });
          toast.success(`${nameOf(c)} is no longer Coordinator of ${c.chapter_name}.`);
          load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not remove the Coordinator.");
        }
      },
    });

  const removePlatform = (p: PlatformStaff) =>
    ask({
      title: `Remove ${nameOf(p)}'s ${p.account_role} role`,
      message: "They'll keep their account and chapter membership, but lose app-wide access to the dashboard.",
      confirmLabel: "Remove role",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`admin/platform-staff/${p.user_id}`, { method: "DELETE" });
          toast.success(`${nameOf(p)} is no longer an ${p.account_role}.`);
          load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not remove the role.");
        }
      },
    });

  const resetPassword = (p: Person) =>
    ask({
      title: `Reset ${nameOf(p)}'s password`,
      message: "They'll be signed out everywhere and need the new temporary password to sign in.",
      confirmLabel: "Reset password",
      onConfirm: async () => {
        try {
          const result = await api<ChangeResult>(`admin/users/${p.user_id}/temporary-password`, { method: "POST" });
          setRevealed(result);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not reset the password.");
        }
      },
    });

  const afterChange = (result: ChangeResult, message: string) => {
    load();
    if (result.temporary_password) setRevealed(result);
    else toast.success(message);
  };

  return (
    <>
      <PageHeader
        title="Admins and coordinators"
        subtitle="Who runs the app: platform admins, and each chapter's coordinator."
        action={
          <div className="flex gap-2">
            <SecondaryButton icon="shield" onClick={() => setAddingAdmin(true)}>
              Add admin
            </SecondaryButton>
            <PrimaryButton onClick={() => setWizard({})}>Add coordinator</PrimaryButton>
          </div>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat icon="shieldCheck" value={data ? String(platform.filter((p) => p.account_role === "admin").length) : "—"} label="Admins" />
        <MiniStat icon="shield" value={data ? String(platform.filter((p) => p.account_role === "moderator").length) : "—"} label="App moderators" />
        <MiniStat icon="star" value={data ? String(coordinators.length) : "—"} label="Coordinators" />
        <MiniStat icon="branch" value={data ? String(uncovered.length) : "—"} label="Chapters without one" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "coordinators", label: "Coordinators", count: coordinators.length },
                { key: "moderators", label: "Chapter moderators", count: moderators.length },
                { key: "platform", label: "Admins", count: platform.length },
              ]}
            />
            <SearchField className="mb-3 md:w-[240px]" value={search} onChange={setSearch} placeholder="Search by name, email or chapter…" />
          </div>

          <div className="mt-4">
            {tab === "platform" ? (
              <Table minWidth={680}>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Role</Th>
                    <Th>Last signed in</Th>
                    <Th className="text-center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {data === null ? <LoadingRows cols={4} rows={3} /> : null}
                  {platform
                    .filter((p) => matches(q, nameOf(p), p.email))
                    .map((p) => (
                      <tr key={p.user_id} className="hover:bg-canvas/40">
                        <Td><PersonCell person={p} /></Td>
                        <Td>
                          <Badge tone={p.account_role === "admin" ? "red" : "blue"}>
                            {p.account_role === "admin" ? "Admin" : "App moderator"}
                          </Badge>
                        </Td>
                        <Td className="whitespace-nowrap">{p.last_login_at ? timeAgo(p.last_login_at) : <span className="text-muted">Never</span>}</Td>
                        <Td className="text-center">
                          <RowMenu
                            actions={[
                              { label: "Reset password", icon: "lock", onSelect: () => resetPassword(p) },
                              { label: "Remove role", icon: "x", danger: true, onSelect: () => removePlatform(p) },
                            ]}
                          />
                        </Td>
                      </tr>
                    ))}
                  {data !== null && platform.length === 0 ? <EmptyRow cols={4} title="No admins" /> : null}
                </tbody>
              </Table>
            ) : (
              <Table minWidth={760}>
                <thead>
                  <tr>
                    <Th>{tab === "coordinators" ? "Coordinator" : "Moderator"}</Th>
                    <Th>Chapter</Th>
                    <Th>Since</Th>
                    <Th>Last signed in</Th>
                    <Th className="text-center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {data === null ? <LoadingRows cols={5} rows={3} /> : null}
                  {(tab === "coordinators" ? coordinators : moderators)
                    .filter((s) => matches(q, nameOf(s), s.email, s.chapter_name))
                    .map((s) => (
                      <tr key={s.id} className="hover:bg-canvas/40">
                        <Td><PersonCell person={s} /></Td>
                        <Td>
                          <span className="font-medium text-ink">{s.chapter_name}</span>
                          {!s.chapter_active ? <Badge tone="gray" className="ml-2">Archived</Badge> : null}
                        </Td>
                        <Td className="whitespace-nowrap">{formatDate(s.assigned_at)}</Td>
                        <Td className="whitespace-nowrap">{s.last_login_at ? timeAgo(s.last_login_at) : <span className="text-muted">Never</span>}</Td>
                        <Td className="text-center">
                          <RowMenu
                            actions={
                              tab === "coordinators"
                                ? [
                                    { label: "Replace coordinator", icon: "refresh", onSelect: () => setWizard({ chapterId: s.chapter_id, replace: true }) },
                                    { label: "Reset password", icon: "lock", onSelect: () => resetPassword(s) },
                                    { label: "Remove as coordinator", icon: "x", danger: true, onSelect: () => removeCoordinator(s) },
                                  ]
                                : [
                                    { label: "Make coordinator", icon: "star", onSelect: () => setWizard({ chapterId: s.chapter_id }) },
                                    { label: "Reset password", icon: "lock", onSelect: () => resetPassword(s) },
                                  ]
                            }
                          />
                        </Td>
                      </tr>
                    ))}
                  {data !== null && (tab === "coordinators" ? coordinators : moderators).length === 0 ? (
                    <EmptyRow
                      cols={5}
                      title={tab === "coordinators" ? "No coordinators yet" : "No chapter moderators"}
                      hint={tab === "coordinators" ? "Add one, and choose their chapter in the same step." : "Add chapter moderators from Chapters → Manage → Staff."}
                    />
                  ) : null}
                </tbody>
              </Table>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Chapters without a coordinator" />
            <ul className="mt-3 divide-y divide-line">
              {uncovered.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate font-medium text-ink">{c.name}</span>
                  <button type="button" onClick={() => setWizard({ chapterId: c.id })} className="shrink-0 text-sm font-semibold text-brand hover:underline">
                    Assign
                  </button>
                </li>
              ))}
              {uncovered.length === 0 ? (
                <li className="py-2.5 text-sm text-muted">
                  {chapters.some((c) => c.active) ? "Every active chapter has a coordinator." : "No chapters yet. Create one on the Chapters page."}
                </li>
              ) : null}
            </ul>
          </Card>
          <Card className="p-5">
            <CardHeader title="How it works" />
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/75">
              <li>A coordinator always has a chapter. They become a member of it, and it&apos;s the chapter they manage.</li>
              <li>Each chapter has one coordinator. Replacing one keeps the old coordinator as a member.</li>
              <li>New accounts get a temporary password, shown once. Share it privately; they can change it after signing in.</li>
            </ul>
          </Card>
        </div>
      </div>

      {wizard ? (
        <AddCoordinator
          key={`${wizard.chapterId ?? "any"}-${wizard.replace ? "r" : ""}`}
          presetChapterId={wizard.chapterId}
          presetReplace={wizard.replace ?? false}
          coordinators={coordinators}
          onClose={() => setWizard(null)}
          onDone={(result, chapterName) => {
            setWizard(null);
            afterChange(result, `${nameOf(result)} is now Coordinator of ${chapterName}.`);
          }}
        />
      ) : null}
      {addingAdmin ? (
        <AddAdmin
          onClose={() => setAddingAdmin(false)}
          onDone={(result, role) => {
            setAddingAdmin(false);
            afterChange(result, `${nameOf(result)} is now an ${role === "admin" ? "admin" : "app moderator"}.`);
          }}
        />
      ) : null}
      {revealed ? <PasswordReveal result={revealed} onClose={() => setRevealed(null)} /> : null}
      {dialog}
      {toast.element}
    </>
  );
}

function PersonCell({ person }: { person: Person }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={nameOf(person)} src={person.avatar_url} size={34} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">
          {nameOf(person)}
          {!person.is_active ? <Badge tone="gray" className="ml-2">Suspended</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted">{person.email}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choosing a person: an existing user, or a new account               */
/* ------------------------------------------------------------------ */

type PersonPick = { mode: "existing"; user: ApiUser | null } | { mode: "new"; name: string; email: string };

function PersonPicker({ value, onChange }: { value: PersonPick; onChange: (v: PersonPick) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiUser[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api<{ items: ApiUser[] }>(`admin/users?q=${encodeURIComponent(q)}&limit=8`)
        .then((p) => !cancelled && setResults(p.items ?? []))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1">
        {(["existing", "new"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode === "existing" ? { mode, user: null } : { mode, name: "", email: "" })}
            className={cx(
              "rounded-lg px-3 py-2 text-sm font-semibold",
              value.mode === mode ? "bg-white text-brand shadow-sm" : "text-ink/70 hover:text-ink",
            )}
          >
            {mode === "existing" ? "Existing user" : "New account"}
          </button>
        ))}
      </div>

      {value.mode === "existing" ? (
        value.user ? (
          <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
            <Avatar name={nameOf({ display_name: value.user.display_name, email: value.user.email })} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{nameOf({ display_name: value.user.display_name, email: value.user.email })}</p>
              <p className="truncate text-xs text-muted">{value.user.email}</p>
            </div>
            <SecondaryButton onClick={() => onChange({ mode: "existing", user: null })}>Change</SecondaryButton>
          </div>
        ) : (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search users by name or email…" />
            <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {(query.trim().length < 2 ? [] : results).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={!u.is_active}
                    onClick={() => onChange({ mode: "existing", user: u })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas disabled:opacity-50"
                  >
                    <Avatar name={nameOf({ display_name: u.display_name, email: u.email })} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{nameOf({ display_name: u.display_name, email: u.email })}</span>
                      <span className="block truncate text-xs text-muted">
                        {u.email}
                        {u.membership_status === "member" ? " · Member" : " · Guest"}
                        {!u.is_active ? " · Suspended" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {query.trim().length < 2 ? <li className="px-3 py-2.5 text-xs text-muted">Type at least 2 letters.</li> : null}
              {query.trim().length >= 2 && results.length === 0 ? <li className="px-3 py-2.5 text-xs text-muted">No users match. Create a new account instead.</li> : null}
            </ul>
          </>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="Full name" required value={value.name} onChange={(name) => onChange({ ...value, name })} placeholder="Grace Adeyemi" />
          <TextInput label="Email" required type="email" value={value.email} onChange={(email) => onChange({ ...value, email })} placeholder="grace@example.com" />
          <p className="text-xs text-muted sm:col-span-2">We&apos;ll create the account with a temporary password that you&apos;ll see on the last step.</p>
        </div>
      )}
    </div>
  );
}

function personBody(pick: PersonPick) {
  if (pick.mode === "existing") {
    if (!pick.user) throw new Error("Choose a user, or switch to New account.");
    return { user_id: pick.user.id };
  }
  if (pick.name.trim().length < 2) throw new Error("Enter their full name.");
  if (!/^\S+@\S+\.\S+$/.test(pick.email.trim())) throw new Error("Enter a valid email address.");
  return { new_account: { display_name: pick.name.trim(), email: pick.email.trim() } };
}

const pickName = (pick: PersonPick) =>
  pick.mode === "existing"
    ? pick.user
      ? nameOf({ display_name: pick.user.display_name, email: pick.user.email })
      : "—"
    : pick.name.trim() || "New account";

/* ------------------------------------------------------------------ */
/* Add coordinator: person → chapter → done                            */
/* ------------------------------------------------------------------ */

function AddCoordinator({
  presetChapterId,
  presetReplace,
  coordinators,
  onClose,
  onDone,
}: {
  presetChapterId?: string;
  presetReplace: boolean;
  coordinators: ChapterStaff[];
  onClose: () => void;
  onDone: (result: ChangeResult, chapterName: string) => void;
}) {
  const { chapters, name: chapterName } = useChapters();
  const [step, setStep] = useState<1 | 2>(1);
  const [pick, setPick] = useState<PersonPick>({ mode: "existing", user: null });
  const [chapterId, setChapterId] = useState(presetChapterId ?? "");
  const [replace, setReplace] = useState(presetReplace);
  const { busy, error, setError, run } = useSubmit();

  const active = chapters.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = chapterId || active[0]?.id || "";
  const current = coordinators.find((c) => c.chapter_id === chosen);
  const sameAsCurrent = pick.mode === "existing" && pick.user && current?.user_id === pick.user.id;
  const moving =
    pick.mode === "existing" && pick.user?.membership_status === "member" && pick.user.chapter_id && pick.user.chapter_id !== chosen
      ? chapterName(pick.user.chapter_id)
      : null;

  const next = () => {
    try {
      personBody(pick);
      setError("");
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the details.");
    }
  };

  const submit = () =>
    run(async () => {
      if (!chosen) throw new Error("Create a chapter first.");
      if (sameAsCurrent) throw new Error("They're already this chapter's coordinator.");
      if (current && !replace) throw new Error(`${chapterName(chosen)} already has a coordinator. Tick “Replace” or pick another chapter.`);
      const result = await api<ChangeResult>("admin/coordinators", {
        method: "POST",
        body: JSON.stringify({ ...personBody(pick), chapter_id: chosen, replace_current: !!current && replace }),
      });
      onDone(result, chapterName(chosen));
    });

  return (
    <Modal
      open
      wide
      title="Add coordinator"
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton icon="arrowRight" onClick={next}>
              Next: choose chapter
            </PrimaryButton>
          </>
        ) : (
          <>
            <SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton>
            <PrimaryButton icon="check" disabled={busy || !chosen} onClick={submit}>
              {busy ? "Saving…" : "Make coordinator"}
            </PrimaryButton>
          </>
        )
      }
    >
      <ol className="-mt-1 mb-5 flex items-center gap-2 text-xs font-semibold">
        {["Person", "Chapter"].map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 ? <span className="h-px w-6 bg-line" /> : null}
            <span className={cx("flex h-6 w-6 items-center justify-center rounded-full", step > i ? "bg-brand text-white" : "bg-canvas text-ink/60")}>
              {step > i + 1 ? <Icon name="check" size={13} /> : i + 1}
            </span>
            <span className={step === i + 1 ? "text-ink" : "text-ink/60"}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <PersonPicker value={pick} onChange={setPick} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink/80">
            Which chapter will <span className="font-semibold text-ink">{pickName(pick)}</span> coordinate?
          </p>
          {active.length === 0 ? (
            <Notice tone="info">There are no active chapters. Create one on the Chapters page first.</Notice>
          ) : (
            <Select
              label="Chapter"
              required
              value={chosen}
              onChange={(v) => {
                setChapterId(v);
                setReplace(false);
              }}
              options={active.map((c) => {
                const holder = coordinators.find((s) => s.chapter_id === c.id);
                return { value: c.id, label: holder ? `${c.name} — coordinated by ${nameOf(holder)}` : `${c.name} — no coordinator` };
              })}
            />
          )}

          {current && !sameAsCurrent ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">
                <span className="font-semibold">{nameOf(current)}</span> already coordinates {current.chapter_name}. A chapter has one coordinator.
              </p>
              <CheckRow
                className="mt-2"
                label={`Replace ${nameOf(current)}`}
                hint="They stay a member of the chapter."
                checked={replace}
                onChange={setReplace}
              />
            </div>
          ) : null}
          {sameAsCurrent ? <Notice tone="info">They already coordinate this chapter.</Notice> : null}
          {moving ? (
            <Notice tone="info">
              They&apos;re currently a member of {moving}. Making them coordinator moves their membership to {chapterName(chosen)}.
            </Notice>
          ) : null}
        </div>
      )}
      <FormError message={error} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add admin or app moderator                                          */
/* ------------------------------------------------------------------ */

function AddAdmin({ onClose, onDone }: { onClose: () => void; onDone: (result: ChangeResult, role: string) => void }) {
  const [pick, setPick] = useState<PersonPick>({ mode: "existing", user: null });
  const [role, setRole] = useState("admin");
  const { busy, error, run } = useSubmit();

  const submit = () =>
    run(async () => {
      const result = await api<ChangeResult>("admin/platform-staff", {
        method: "POST",
        body: JSON.stringify({ ...personBody(pick), account_role: role }),
      });
      onDone(result, role);
    });

  return (
    <Modal
      open
      wide
      title="Add admin"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon="check" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Add"}
          </PrimaryButton>
        </>
      }
    >
      <PersonPicker value={pick} onChange={setPick} />
      <Select
        className="mt-4"
        label="Role"
        value={role}
        onChange={setRole}
        options={[
          { value: "admin", label: "Admin — full access to the whole dashboard" },
          { value: "moderator", label: "App moderator — moderates every chapter" },
        ]}
      />
      <FormError message={error} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Showing a temporary password once                                   */
/* ------------------------------------------------------------------ */

function PasswordReveal({ result, onClose }: { result: ChangeResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Email: ${result.email}\nTemporary password: ${result.temporary_password}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal open title="Account ready" onClose={onClose} footer={<PrimaryButton icon="check" onClick={onClose}>Done</PrimaryButton>}>
      <p className="text-sm text-ink/80">
        Share these sign-in details with <span className="font-semibold text-ink">{nameOf(result)}</span> privately. This password is shown only once.
      </p>
      <div className="mt-4 rounded-xl border border-line bg-canvas p-4 font-mono text-sm">
        <p className="text-ink/70">Email</p>
        <p className="mb-3 font-semibold text-ink">{result.email}</p>
        <p className="text-ink/70">Temporary password</p>
        <p className="select-all text-lg font-bold tracking-wider text-ink">{result.temporary_password}</p>
      </div>
      <SecondaryButton icon="copy" className="mt-3" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy details"}
      </SecondaryButton>
      <p className="mt-3 text-xs text-muted">They should change it after signing in. If it&apos;s lost, use Reset password to make a new one.</p>
    </Modal>
  );
}

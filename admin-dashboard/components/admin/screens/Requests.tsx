"use client";

import { useCallback, useEffect, useState } from "react";
import { api, matches, useAdmin } from "../data";
import { Modal, useConfirm, useToast } from "../dialogs";
import { FormError, useSubmit } from "../forms";
import {
  Avatar,
  Badge,
  Card,
  EmptyRow,
  LoadingRows,
  Notice,
  PageHeader,
  PrimaryButton,
  SearchField,
  SecondaryButton,
  Table,
  Tabs,
  Td,
  Th,
  formatDate,
  timeAgo,
} from "../ui";

type Status = "pending" | "approved" | "declined" | "cancelled";

type ApiRequest = {
  id: string;
  user_id: string;
  status: Status;
  reviewed_at: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
};

type GrantItem = { post_id: string | null; event_id: string | null; meeting_id: string | null; resource_id: string | null };
type ApiGrant = { user_id: string; items: GrantItem[] };

type Kind = "event_id" | "meeting_id" | "resource_id" | "post_id";
type Option = { id: string; title: string; detail: string };

const nameOf = (r: ApiRequest) => r.user_name?.trim() || r.user_email?.split("@")[0] || "Unknown guest";

/**
 * Guests ask to join a chapter. The Coordinator approves or declines, then
 * shares individual events, live sessions, resources or posts with them.
 */
export default function Requests() {
  const { scope, globalSearch } = useAdmin();
  const [rows, setRows] = useState<ApiRequest[] | null>(null);
  const [grants, setGrants] = useState<Map<string, GrantItem[]>>(new Map());
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [sharing, setSharing] = useState<ApiRequest | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const load = useCallback(() => {
    if (!scope) return;
    api<ApiRequest[]>(`chapters/${scope.id}/access-requests`)
      .then((r) => {
        setRows(r ?? []);
        setError("");
      })
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Could not load access requests.");
      });
    api<ApiGrant[]>(`chapters/${scope.id}/access-grants`)
      .then((list) => {
        const byUser = new Map<string, GrantItem[]>();
        for (const g of list ?? []) byUser.set(g.user_id, [...(byUser.get(g.user_id) ?? []), ...g.items]);
        setGrants(byUser);
      })
      .catch(() => setGrants(new Map()));
  }, [scope]);
  useEffect(load, [load]);

  const items = rows ?? [];
  const filtered = items.filter((r) => r.status === tab && matches(search || globalSearch, nameOf(r), r.user_email ?? ""));
  const count = (s: Status) => items.filter((r) => r.status === s).length;

  const review = (r: ApiRequest, decision: "approved" | "declined") =>
    ask({
      title: decision === "approved" ? `Approve ${nameOf(r)}` : `Decline ${nameOf(r)}`,
      message:
        decision === "approved"
          ? "They'll stay a guest. After approving, choose which events, sessions, resources or posts to share with them."
          : "They won't get access to this chapter's content. They can ask again later.",
      confirmLabel: decision === "approved" ? "Approve" : "Decline",
      danger: decision === "declined",
      onConfirm: async () => {
        try {
          const updated = await api<ApiRequest>(`chapter-access-requests/${r.id}/review`, {
            method: "POST",
            body: JSON.stringify({ status: decision }),
          });
          load();
          if (decision === "approved") {
            toast.success(`${nameOf(r)} approved. Now choose what to share.`);
            setSharing({ ...r, ...updated });
          } else {
            toast.success("Request declined.");
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not review the request.");
        }
      },
    });

  if (!scope) return null;

  return (
    <>
      <PageHeader title="Access requests" subtitle={`Guests asking to see ${scope.name}'s content.`} />
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "pending", label: "Pending", count: count("pending") },
              { key: "approved", label: "Approved guests", count: count("approved") },
              { key: "declined", label: "Declined", count: count("declined") },
              { key: "cancelled", label: "Withdrawn", count: count("cancelled") },
            ]}
          />
          <SearchField className="mb-3 md:w-[260px]" value={search} onChange={setSearch} placeholder="Search by name or email…" />
        </div>

        <div className="mt-4">
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>Guest</Th>
                <Th>Asked</Th>
                {tab === "approved" ? <Th>Shared with them</Th> : <Th>Reviewed</Th>}
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? <LoadingRows cols={4} rows={3} /> : null}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={nameOf(r)} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{nameOf(r)}</p>
                        <p className="truncate text-xs text-muted">{r.user_email ?? r.user_id}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{timeAgo(r.created_at)}</Td>
                  <Td className="whitespace-nowrap">
                    {tab === "approved" ? (
                      <Badge tone={(grants.get(r.user_id)?.length ?? 0) > 0 ? "green" : "gray"}>
                        {grants.get(r.user_id)?.length ?? 0} items
                      </Badge>
                    ) : r.reviewed_at ? (
                      formatDate(r.reviewed_at)
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => review(r, "declined")}>Decline</SecondaryButton>
                        <PrimaryButton icon="check" onClick={() => review(r, "approved")}>
                          Approve
                        </PrimaryButton>
                      </div>
                    ) : r.status === "approved" ? (
                      <SecondaryButton icon="plus" tone="brand" onClick={() => setSharing(r)}>
                        Share content
                      </SecondaryButton>
                    ) : null}
                  </Td>
                </tr>
              ))}
              {rows !== null && filtered.length === 0 ? (
                <EmptyRow
                  cols={4}
                  title={tab === "pending" ? "No one is waiting" : "Nothing here"}
                  hint={tab === "pending" ? "Guests ask to join from the CYC app." : undefined}
                />
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      {sharing ? (
        <ShareDialog
          key={sharing.user_id}
          chapterId={scope.id}
          guest={sharing}
          already={grants.get(sharing.user_id) ?? []}
          onClose={() => setSharing(null)}
          onSaved={(n) => {
            toast.success(`Shared ${n} item${n === 1 ? "" : "s"} with ${nameOf(sharing)}.`);
            setSharing(null);
            load();
          }}
        />
      ) : null}
      {dialog}
      {toast.element}
    </>
  );
}

/* ------------------------------------------------------------------ */

const SECTIONS: { kind: Kind; label: string }[] = [
  { kind: "event_id", label: "Events" },
  { kind: "meeting_id", label: "Live sessions" },
  { kind: "resource_id", label: "Resources" },
  { kind: "post_id", label: "Posts" },
];

function ShareDialog({
  chapterId,
  guest,
  already,
  onClose,
  onSaved,
}: {
  chapterId: string;
  guest: ApiRequest;
  already: GrantItem[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [options, setOptions] = useState<Record<Kind, Option[]> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { busy, error, run } = useSubmit();
  const shared = new Set(already.flatMap((i) => [i.event_id, i.meeting_id, i.resource_id, i.post_id]).filter(Boolean) as string[]);

  useEffect(() => {
    let cancelled = false;
    const page = <T,>(path: string) => api<{ items: T[] }>(path).then((p) => p.items ?? []).catch(() => [] as T[]);
    Promise.all([
      page<{ id: string; title: string; starts_at: string; status: string }>(`events?chapter_id=${chapterId}&limit=50`),
      page<{ id: string; title: string; status: string; scheduled_start_at: string | null }>(`meetings?chapter_id=${chapterId}&limit=50`),
      page<{ id: string; title: string; kind: string; status: string }>(`resources?chapter_id=${chapterId}&limit=50`),
      page<{ id: string; body: string; created_at: string }>(`chapters/${chapterId}/posts?limit=50`),
    ]).then(([events, meetings, resources, posts]) => {
      if (cancelled) return;
      setOptions({
        event_id: events
          .filter((e) => e.status !== "cancelled")
          .map((e) => ({ id: e.id, title: e.title, detail: formatDate(e.starts_at) })),
        meeting_id: meetings
          .filter((m) => m.status !== "cancelled")
          .map((m) => ({ id: m.id, title: m.title, detail: m.status === "live" ? "Live now" : m.status })),
        resource_id: resources
          .filter((r) => r.status === "published")
          .map((r) => ({ id: r.id, title: r.title, detail: r.kind })),
        post_id: posts.map((p) => ({ id: p.id, title: p.body.slice(0, 90), detail: timeAgo(p.created_at) })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () =>
    run(async () => {
      if (!options) return;
      const items = SECTIONS.flatMap(({ kind }) => options[kind].filter((o) => picked.has(o.id)).map((o) => ({ [kind]: o.id })));
      if (items.length === 0) throw new Error("Pick at least one item to share.");
      await api(`chapters/${chapterId}/access-grants`, {
        method: "POST",
        body: JSON.stringify({ user_id: guest.user_id, items }),
      });
      onSaved(items.length);
    });

  return (
    <Modal
      open
      wide
      title={`Share content with ${nameOf(guest)}`}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">{picked.size} selected</span>
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
          <PrimaryButton icon="check" disabled={busy || picked.size === 0} onClick={save}>
            {busy ? "Sharing…" : "Share"}
          </PrimaryButton>
        </>
      }
    >
      <p className="-mt-1 mb-4 text-sm text-muted">Guests only see what you share with them. Already shared items are ticked.</p>
      {options === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading chapter content…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map(({ kind, label }) => (
            <section key={kind} className="rounded-xl border border-line p-3">
              <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {options[kind].map((o) => {
                  const done = shared.has(o.id);
                  return (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-canvas">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-brand"
                          checked={done || picked.has(o.id)}
                          disabled={done}
                          onChange={() => toggle(o.id)}
                        />
                        <span className="min-w-0 text-sm">
                          <span className="line-clamp-1 text-ink">{o.title}</span>
                          <span className="block text-xs capitalize text-muted">{done ? "Shared" : o.detail}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {options[kind].length === 0 ? <li className="px-1.5 text-xs text-muted">Nothing to share yet.</li> : null}
              </ul>
            </section>
          ))}
        </div>
      )}
      <FormError message={error} />
    </Modal>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api, useAdmin, useDirectory } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { FormError, TextArea, TextInput, useSubmit } from "../forms";
import type { ApiAudit } from "../mappers";
import { Card, CardHeader, PageHeader, PrimaryButton, formatDateTime } from "../ui";

const TITLE_MAX = 120;
const BODY_MAX = 1000;

/** Send a push and in-app notice to every member of the chapter. */
export default function Announcements() {
  const { scope } = useAdmin();
  const directory = useDirectory(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState<ApiAudit[] | null>(null);
  const { busy, error, run } = useSubmit();
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const loadHistory = useCallback(() => {
    if (!scope) return;
    api<{ items: ApiAudit[] }>(`moderation/audit-logs?chapter_id=${scope.id}&action=chapter.announcement_sent&limit=50`)
      .then((p) => setHistory(p.items ?? []))
      .catch(() => setHistory([]));
  }, [scope]);
  useEffect(loadHistory, [loadHistory]);

  if (!scope) return null;

  const send = () =>
    run(async () => {
      if (title.trim().length < 3) throw new Error("Give the announcement a title of at least 3 characters.");
      if (body.trim().length < 3) throw new Error("Write the message to send.");
      ask({
        title: "Send announcement",
        message: `Every member of ${scope.name} will get “${title.trim()}” as a notification. This can't be undone.`,
        confirmLabel: "Send now",
        onConfirm: async () => {
          try {
            const result = await api<{ recipients: number }>(`chapters/${scope.id}/announcements`, {
              method: "POST",
              body: JSON.stringify({ title: title.trim(), body: body.trim() }),
            });
            toast.success(`Sent to ${result.recipients} member${result.recipients === 1 ? "" : "s"}.`);
            setTitle("");
            setBody("");
            loadHistory();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not send the announcement.");
          }
        },
      });
    });

  return (
    <>
      <PageHeader title="Announcements" subtitle={`Notify every member of ${scope.name} in the CYC app.`} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-5">
          <CardHeader title="New announcement" />
          <div className="mt-4 space-y-4">
            <TextInput
              label="Title"
              required
              value={title}
              onChange={(v) => setTitle(v.slice(0, TITLE_MAX))}
              placeholder="Prayer meeting moved to Friday"
              hint={`${title.length}/${TITLE_MAX}`}
            />
            <TextArea
              label="Message"
              required
              rows={6}
              value={body}
              onChange={(v) => setBody(v.slice(0, BODY_MAX))}
              placeholder="Write what members need to know."
              hint={`${body.length}/${BODY_MAX}`}
            />
          </div>
          <FormError message={error} />
          <div className="mt-4 flex justify-end">
            <PrimaryButton icon="megaphone" disabled={busy} onClick={send}>
              Send to all members
            </PrimaryButton>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title="Sent" />
          <ul className="mt-3 divide-y divide-line">
            {(history ?? []).map((a) => (
              <li key={a.id} className="py-3">
                <p className="font-medium text-ink">{String(a.data?.title ?? "Announcement")}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(a.created_at)} · {a.actor_id ? (directory.get(a.actor_id)?.name ?? "Chapter staff") : "System"} ·{" "}
                  {Number(a.data?.recipients ?? 0)} recipients
                </p>
              </li>
            ))}
            {history === null ? <li className="py-3 text-sm text-muted">Loading…</li> : null}
            {history !== null && history.length === 0 ? <li className="py-3 text-sm text-muted">No announcements sent yet.</li> : null}
          </ul>
        </Card>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

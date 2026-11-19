"use client";

import { useEffect, useState } from "react";
import { api } from "../data";
import { Modal } from "../dialogs";
import {
  COMMON_TIMEZONES,
  ChapterSelect,
  FormError,
  Select,
  TextArea,
  TextInput,
  browserTimezone,
  orNull,
  toLocalInput,
  useSubmit,
} from "../forms";
import { PrimaryButton, SecondaryButton } from "../ui";

type ApiEventFull = {
  id: string;
  chapter_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  online_url: string | null;
  starts_at_local: string;
  ends_at_local: string;
  timezone: string;
  capacity: number | null;
};

type FormState = {
  chapter_id: string;
  title: string;
  description: string;
  location: string;
  online_url: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: string;
};

function blank(): FormState {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600_000);
  return {
    chapter_id: "",
    title: "",
    description: "",
    location: "",
    online_url: "",
    starts_at: toLocalInput(start),
    ends_at: toLocalInput(end),
    timezone: browserTimezone(),
    capacity: "",
  };
}

function fromApi(e: ApiEventFull, copy: boolean): FormState {
  return {
    chapter_id: e.chapter_id ?? "",
    title: copy ? `${e.title} (copy)` : e.title,
    description: e.description ?? "",
    location: e.location ?? "",
    online_url: e.online_url ?? "",
    // "2026-11-20T18:00:00+01:00" -> "2026-11-20T18:00" (already in the event's zone)
    starts_at: e.starts_at_local.slice(0, 16),
    ends_at: e.ends_at_local.slice(0, 16),
    timezone: e.timezone,
    capacity: e.capacity ? String(e.capacity) : "",
  };
}

/**
 * Create, edit or duplicate an event.
 * `eventId` + `mode="edit"` edits; `mode="duplicate"` prefills a new one.
 */
export default function EventForm({
  open,
  mode,
  eventId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit" | "duplicate";
  eventId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const needsLoad = mode !== "create" && !!eventId;
  const [form, setForm] = useState<FormState>(blank);
  const [loading, setLoading] = useState(needsLoad);
  const { busy, error, setError, run } = useSubmit();
  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Mounted fresh each time the dialog opens (see the parent's `key`).
  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    api<ApiEventFull>(`events/${eventId}`)
      .then((e) => !cancelled && setForm(fromApi(e, mode === "duplicate")))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the event."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [needsLoad, mode, eventId, setError]);

  const tzOptions = [...new Set([form.timezone, ...COMMON_TIMEZONES])].map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));

  const submit = () =>
    run(async () => {
      if (form.title.trim().length < 3) throw new Error("Give the event a title of at least 3 characters.");
      if (!form.starts_at || !form.ends_at) throw new Error("Set when the event starts and ends.");
      if (form.ends_at <= form.starts_at) throw new Error("The event must end after it starts.");
      if (!form.location.trim() && !form.online_url.trim()) throw new Error("Add a location, an online link, or both.");

      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: orNull(form.description),
        location: orNull(form.location),
        online_url: orNull(form.online_url),
        starts_at: `${form.starts_at}:00`,
        ends_at: `${form.ends_at}:00`,
        timezone: form.timezone,
        capacity: form.capacity ? Number(form.capacity) : null,
      };

      if (mode === "edit" && eventId) {
        await api(`events/${eventId}`, { method: "PATCH", body: JSON.stringify(body) });
        onSaved("Event updated.");
      } else {
        body.chapter_id = form.chapter_id || null;
        await api("events", { method: "POST", body: JSON.stringify(body) });
        onSaved("Event created.");
      }
      onClose();
    });

  const title = mode === "edit" ? "Edit event" : mode === "duplicate" ? "Duplicate event" : "Create event";

  return (
    <Modal
      open={open}
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon={mode === "edit" ? "check" : "plus"} disabled={busy || loading} onClick={submit}>
            {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create event"}
          </PrimaryButton>
        </>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading event…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} placeholder="Youth Prayer Night" />
          {mode === "edit" ? null : <ChapterSelect className="sm:col-span-2" value={form.chapter_id} onChange={set("chapter_id")} />}
          <TextInput label="Starts" required type="datetime-local" value={form.starts_at} onChange={set("starts_at")} />
          <TextInput label="Ends" required type="datetime-local" value={form.ends_at} onChange={set("ends_at")} />
          <Select label="Time zone" required value={form.timezone} onChange={set("timezone")} options={tzOptions} hint="Start and end times are in this time zone." />
          <TextInput label="Capacity" type="number" min={1} value={form.capacity} onChange={set("capacity")} placeholder="No limit" hint="Leave empty for unlimited spots." />
          <TextInput label="Location" value={form.location} onChange={set("location")} placeholder="CYC Hall, Ikeja" />
          <TextInput label="Online link" type="url" value={form.online_url} onChange={set("online_url")} placeholder="https://…" />
          <TextArea label="Description" className="sm:col-span-2" value={form.description} onChange={set("description")} placeholder="What should people know about this event?" />
        </div>
      )}
      <FormError message={error} />
    </Modal>
  );
}

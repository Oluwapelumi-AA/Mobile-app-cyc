"use client";

import { useState } from "react";
import { api } from "../data";
import { Modal } from "../dialogs";
import {
  ChapterSelect,
  CheckRow,
  FormError,
  Select,
  TextArea,
  TextInput,
  orNull,
  toLocalInput,
  useSubmit,
} from "../forms";
import { PrimaryButton, SecondaryButton } from "../ui";

type FormState = {
  kind: "livestream" | "meeting";
  title: string;
  description: string;
  chapter_id: string;
  when: "now" | "later";
  scheduled_start_at: string;
  recording_enabled: boolean;
};

function blank(when: "now" | "later"): FormState {
  const later = new Date(Date.now() + 24 * 3600_000);
  later.setMinutes(0, 0, 0);
  return {
    kind: "livestream",
    title: "",
    description: "",
    chapter_id: "",
    when,
    scheduled_start_at: toLocalInput(later),
    recording_enabled: true,
  };
}

/**
 * Create a livestream or meeting, and open it straight away ("Go live now")
 * or schedule it. Hosts broadcast from the CYC app; the dashboard opens and
 * closes the room.
 */
export default function LiveForm({
  open,
  startNow,
  onClose,
  onSaved,
}: {
  open: boolean;
  startNow: boolean;
  onClose: () => void;
  onSaved: (message: string, failed?: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(() => blank(startNow ? "now" : "later"));
  const { busy, error, run } = useSubmit();
  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () =>
    run(async () => {
      if (form.title.trim().length < 3) throw new Error("Give the session a title of at least 3 characters.");
      const later = form.when === "later";
      if (later && !form.scheduled_start_at) throw new Error("Pick when the session starts.");

      const meeting = await api<{ id: string }>("meetings", {
        method: "POST",
        body: JSON.stringify({
          kind: form.kind,
          title: form.title.trim(),
          description: orNull(form.description),
          chapter_id: form.chapter_id || null,
          // The input is in the browser's time zone; send it as UTC.
          scheduled_start_at: later ? new Date(form.scheduled_start_at).toISOString() : null,
          recording_enabled: form.recording_enabled,
        }),
      });

      if (later) {
        onSaved("Session scheduled.");
        onClose();
        return;
      }

      try {
        await api(`meetings/${meeting.id}/start`, { method: "POST" });
      } catch (err) {
        // Saved but not started: close so a retry doesn't create a duplicate.
        onSaved(
          `Saved as scheduled, but it couldn't go live: ${err instanceof Error ? err.message : "unknown error"} Start it from the list.`,
          true,
        );
        onClose();
        return;
      }
      onSaved("You're live. Join from the CYC app to broadcast.");
      onClose();
    });

  return (
    <Modal
      open={open}
      wide
      title={form.when === "now" ? "Go live" : "Schedule a live session"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon={form.when === "now" ? "broadcast" : "calendar"} disabled={busy} onClick={submit}>
            {busy ? "Working…" : form.when === "now" ? "Go live now" : "Schedule"}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} placeholder="Sunday Worship Livestream" />
        <Select
          label="Type"
          value={form.kind}
          onChange={(v) => set("kind")(v as FormState["kind"])}
          options={[
            { value: "livestream", label: "Livestream (host broadcasts, others watch)" },
            { value: "meeting", label: "Meeting (everyone can talk)" },
          ]}
        />
        <ChapterSelect value={form.chapter_id} onChange={set("chapter_id")} />
        <Select
          label="When"
          value={form.when}
          onChange={(v) => set("when")(v as FormState["when"])}
          options={[
            { value: "now", label: "Start now" },
            { value: "later", label: "Schedule for later" },
          ]}
        />
        {form.when === "later" ? (
          <TextInput label="Starts" required type="datetime-local" value={form.scheduled_start_at} onChange={set("scheduled_start_at")} hint="Your computer's time zone." />
        ) : (
          <div />
        )}
        <TextArea label="Description" rows={3} className="sm:col-span-2" value={form.description} onChange={set("description")} placeholder="What's this session about?" />
        <CheckRow className="sm:col-span-2" label="Record this session" hint="The replay appears under Recorded once it's processed." checked={form.recording_enabled} onChange={set("recording_enabled")} />
      </div>
      <p className="mt-4 rounded-xl bg-canvas px-3.5 py-2.5 text-xs leading-5 text-ink/75">
        Going live opens the room and notifies members. The host then joins from the CYC app to broadcast camera and audio.
      </p>
      <FormError message={error} />
    </Modal>
  );
}

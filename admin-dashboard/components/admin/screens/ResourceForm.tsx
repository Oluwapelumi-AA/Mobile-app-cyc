"use client";

import { useEffect, useState } from "react";
import { ApiError, api, useAdmin } from "../data";
import { Modal } from "../dialogs";
import {
  ChapterSelect,
  CheckRow,
  FormError,
  Select,
  TextArea,
  TextInput,
  orNull,
  useSubmit,
} from "../forms";
import { PrimaryButton, SecondaryButton } from "../ui";

export type ResourceCategory = { id: string; name: string; slug: string };

type Kind = "article" | "audio" | "video" | "document" | "link";

type ApiResourceFull = {
  id: string;
  kind: Kind;
  status: "draft" | "published";
  chapter_id: string | null;
  category_id: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  author_name: string | null;
  scripture_reference: string | null;
  external_url: string | null;
  has_file: boolean;
};

type FormState = {
  kind: Kind;
  title: string;
  chapter_id: string;
  category_id: string;
  new_category: string;
  summary: string;
  body: string;
  author_name: string;
  scripture_reference: string;
  external_url: string;
  publish: boolean;
};

const NEW_CATEGORY = "__new__";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "article", label: "Article (written in the app)" },
  { value: "audio", label: "Audio (sermon, podcast)" },
  { value: "video", label: "Video" },
  { value: "document", label: "Document (PDF or EPUB)" },
  { value: "link", label: "Link to another website" },
];

const FILE_ACCEPT: Partial<Record<Kind, string>> = {
  audio: "audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav",
  video: "video/mp4,video/webm,video/quicktime",
  document: "application/pdf,application/epub+zip",
};

function blank(): FormState {
  return {
    kind: "article",
    title: "",
    chapter_id: "",
    category_id: "",
    new_category: "",
    summary: "",
    body: "",
    author_name: "",
    scripture_reference: "",
    external_url: "",
    publish: true,
  };
}

async function uploadFile(resourceId: string, file: File) {
  const intent = await api<{ upload_url: string; method: "PUT" | "POST"; headers: Record<string, string>; object_key: string }>(
    `resources/${resourceId}/file/upload-intent`,
    { method: "POST", body: JSON.stringify({ content_type: file.type, size_bytes: file.size }) },
  );
  const put = await fetch(intent.upload_url, { method: intent.method, headers: intent.headers, body: file });
  if (!put.ok) throw new Error(`The file upload failed (${put.status}).`);
  await api(`resources/${resourceId}/file/confirm`, {
    method: "POST",
    body: JSON.stringify({ object_key: intent.object_key }),
  });
}

/** Add or edit a resource. */
export default function ResourceForm({
  open,
  resourceId,
  categories,
  onCategoriesChanged,
  onClose,
  onSaved,
}: {
  open: boolean;
  resourceId: string | null;
  categories: ResourceCategory[];
  onCategoriesChanged: () => void;
  onClose: () => void;
  onSaved: (message: string, warning?: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<ApiResourceFull | null>(null);
  const [loading, setLoading] = useState(resourceId !== null);
  const { busy, error, setError, run } = useSubmit();
  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const editing = resourceId !== null;
  // Only app moderators and admins add categories.
  const { scope } = useAdmin();

  // Mounted fresh each time the dialog opens (see the parent's `key`).
  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    api<ApiResourceFull>(`resources/${resourceId}`)
      .then((r) => {
        if (cancelled) return;
        setExisting(r);
        setForm({
          kind: r.kind,
          title: r.title,
          chapter_id: r.chapter_id ?? "",
          category_id: r.category_id ?? "",
          new_category: "",
          summary: r.summary ?? "",
          body: r.body ?? "",
          author_name: r.author_name ?? "",
          scripture_reference: r.scripture_reference ?? "",
          external_url: r.external_url ?? "",
          publish: r.status === "published",
        });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the resource."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [resourceId, setError]);

  const canUpload = form.kind in FILE_ACCEPT;

  const submit = () =>
    run(async () => {
      if (form.title.trim().length < 3) throw new Error("Give the resource a title of at least 3 characters.");
      if (form.kind === "article" && form.publish && !form.body.trim()) throw new Error("An article needs its text before it can be published.");
      if (form.kind === "link" && !form.external_url.trim()) throw new Error("Add the link this resource points to.");

      let categoryId = form.category_id === NEW_CATEGORY ? "" : form.category_id;
      if (form.category_id === NEW_CATEGORY) {
        if (form.new_category.trim().length < 2) throw new Error("Name the new category.");
        const created = await api<ResourceCategory>("resource-categories", {
          method: "POST",
          body: JSON.stringify({ name: form.new_category.trim() }),
        });
        categoryId = created.id;
        onCategoriesChanged();
      }

      const fields = {
        kind: form.kind,
        category_id: categoryId || null,
        title: form.title.trim(),
        summary: orNull(form.summary),
        body: form.kind === "article" ? orNull(form.body) : null,
        author_name: orNull(form.author_name),
        scripture_reference: orNull(form.scripture_reference),
        external_url: form.kind === "article" ? null : orNull(form.external_url),
      };

      let id = resourceId;
      if (editing && id) {
        // kind can't change once a file is attached.
        const body = existing?.has_file ? { ...fields, kind: undefined } : fields;
        await api(`resources/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const created = await api<{ id: string }>("resources", {
          method: "POST",
          body: JSON.stringify({ ...fields, chapter_id: form.chapter_id || null }),
        });
        id = created.id;
      }
      if (!id) return;

      const warnings: string[] = [];
      if (file && canUpload) {
        try {
          await uploadFile(id, file);
        } catch (err) {
          warnings.push(
            err instanceof ApiError && err.status === 503
              ? "the file wasn't uploaded because file storage isn't set up on the server yet"
              : `the file wasn't uploaded (${err instanceof Error ? err.message : "unknown error"})`,
          );
        }
      }

      const wasPublished = existing?.status === "published";
      if (form.publish !== wasPublished) {
        try {
          await api(`resources/${id}/${form.publish ? "publish" : "unpublish"}`, { method: "POST" });
        } catch (err) {
          warnings.push(`it was kept as a draft (${err instanceof Error ? err.message : "couldn't publish"})`);
        }
      }

      const done = editing ? "Resource updated" : "Resource added";
      if (warnings.length) onSaved(`${done}, but ${warnings.join(" and ")}.`, true);
      else onSaved(`${done}${form.publish ? " and published" : " as a draft"}.`);
      onClose();
    });

  return (
    <Modal
      open={open}
      wide
      title={editing ? "Edit resource" : "Add resource"}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton icon={editing ? "check" : "plus"} disabled={busy || loading} onClick={submit}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add resource"}
          </PrimaryButton>
        </>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading resource…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} placeholder="Walking in Faith — Week 1" />
          <Select label="Type" required value={form.kind} onChange={(v) => set("kind")(v as Kind)} options={KIND_OPTIONS} />
          <Select
            label="Category"
            value={form.category_id}
            onChange={set("category_id")}
            options={[
              { value: "", label: "No category" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
              ...(scope ? [] : [{ value: NEW_CATEGORY, label: "+ New category…" }]),
            ]}
          />
          {form.category_id === NEW_CATEGORY ? (
            <TextInput label="New category name" required className="sm:col-span-2" value={form.new_category} onChange={set("new_category")} placeholder="Sermons" hint="Only app moderators and admins can add categories." />
          ) : null}
          {editing ? null : <ChapterSelect className="sm:col-span-2" value={form.chapter_id} onChange={set("chapter_id")} />}
          <TextInput label="Author or speaker" value={form.author_name} onChange={set("author_name")} placeholder="Pastor Daniel" />
          <TextInput label="Scripture reference" value={form.scripture_reference} onChange={set("scripture_reference")} placeholder="Hebrews 11:1–6" />
          <TextArea label="Summary" rows={2} className="sm:col-span-2" value={form.summary} onChange={set("summary")} placeholder="One or two lines shown in the library." />

          {form.kind === "article" ? (
            <TextArea label="Article text" required={form.publish} rows={8} className="sm:col-span-2" value={form.body} onChange={set("body")} placeholder="Write the devotional, study or transcript here." />
          ) : (
            <TextInput
              label={form.kind === "link" ? "Link" : "Link (YouTube, Spotify, Drive…)"}
              required={form.kind === "link"}
              type="url"
              className="sm:col-span-2"
              value={form.external_url}
              onChange={set("external_url")}
              placeholder="https://…"
              hint={canUpload ? "Add a link, upload a file below, or both." : undefined}
            />
          )}

          {canUpload ? (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {existing?.has_file ? "Replace file" : "Upload file"}
              </span>
              <input
                type="file"
                accept={FILE_ACCEPT[form.kind]}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand-tint"
              />
              <span className="mt-1 block text-xs text-muted">Needs file storage (S3 or R2) set up on the server.</span>
            </label>
          ) : null}

          <CheckRow className="sm:col-span-2" label="Publish now" hint="Unticked keeps it as a draft only managers can see." checked={form.publish} onChange={set("publish")} />
        </div>
      )}
      <FormError message={error} />
    </Modal>
  );
}

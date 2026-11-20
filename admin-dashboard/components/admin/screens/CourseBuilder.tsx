"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../data";
import { Modal } from "../dialogs";
import {
  ChapterSelect,
  FormError,
  Select,
  TextArea,
  TextInput,
  orNull,
  useSubmit,
} from "../forms";
import { Icon } from "../icons";
import type { ApiCourseDetail, ApiLesson, ApiQuiz } from "../mappers";
import { Badge, PrimaryButton, SecondaryButton, StatusBadge, Tabs, cx } from "../ui";

type Tab = "details" | "lessons" | "quizzes";
type Notify = (message: string, failed?: boolean) => void;

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/**
 * Create a course, then add lessons and quizzes and publish it.
 * Open with `courseId=null` to start a new course.
 */
export default function CourseBuilder({
  open,
  courseId,
  initialTab = "details",
  onClose,
  onChanged,
}: {
  open: boolean;
  courseId: string | null;
  initialTab?: Tab;
  onClose: () => void;
  onChanged: Notify;
}) {
  const [id, setId] = useState<string | null>(courseId);
  const [course, setCourse] = useState<ApiCourseDetail | null>(null);
  const [tab, setTab] = useState<Tab>(courseId ? initialTab : "details");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(
    (target: string) =>
      api<ApiCourseDetail>(`courses/${target}`)
        .then((next) => {
          setLoadError("");
          setCourse(next);
        })
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load the course.")),
    [],
  );

  // Mounted fresh each time the dialog opens (see the parent's `key`).
  useEffect(() => {
    if (courseId) void load(courseId);
  }, [courseId, load]);

  const updated = (next: ApiCourseDetail, message?: string) => {
    setCourse(next);
    if (message) onChanged(message);
  };

  const publishToggle = async () => {
    if (!course) return;
    const publish = course.status !== "published";
    try {
      const next = await api<ApiCourseDetail>(`courses/${course.id}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      updated(next, publish ? "Course published." : "Course moved to drafts.");
    } catch (err) {
      onChanged(err instanceof Error ? err.message : "Could not change the course status.", true);
    }
  };

  const title = course ? course.title : id ? "Loading course…" : "Create course";

  return (
    <Modal
      open={open}
      wide
      title={title}
      onClose={onClose}
      footer={
        course ? (
          <>
            <span className="mr-auto flex items-center gap-2 text-sm text-muted">
              <StatusBadge status={course.status === "published" ? "Published" : "Draft"} />
              {course.lessons.length} lessons · {course.quizzes.length} quizzes
            </span>
            <SecondaryButton onClick={onClose}>Done</SecondaryButton>
            <PrimaryButton icon={course.status === "published" ? "x" : "check"} onClick={() => void publishToggle()}>
              {course.status === "published" ? "Unpublish" : "Publish course"}
            </PrimaryButton>
          </>
        ) : undefined
      }
    >
      {id ? (
        <div className="-mt-2 mb-4 border-b border-line">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "details", label: "Details" },
              { key: "lessons", label: "Lessons", count: course?.lessons.length ?? 0 },
              { key: "quizzes", label: "Quizzes", count: course?.quizzes.length ?? 0 },
            ]}
          />
        </div>
      ) : null}

      {loadError ? <FormError message={loadError} /> : null}

      {tab === "details" ? (
        <DetailsTab
          key={course?.id ?? "new"}
          course={course}
          creating={!id}
          onCreated={(next) => {
            setId(next.id);
            setCourse(next);
            setTab("lessons");
            onChanged("Course created. Now add its lessons.");
          }}
          onSaved={(next) => updated(next, "Course details saved.")}
        />
      ) : null}
      {tab === "lessons" && course ? <LessonsTab course={course} onUpdated={updated} /> : null}
      {tab === "quizzes" && course ? <QuizzesTab course={course} reload={() => load(course.id)} onChanged={onChanged} /> : null}
      {id && !course && !loadError ? <p className="py-8 text-center text-sm text-muted">Loading…</p> : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

function DetailsTab({
  course,
  creating,
  onCreated,
  onSaved,
}: {
  course: ApiCourseDetail | null;
  creating: boolean;
  onCreated: (course: ApiCourseDetail) => void;
  onSaved: (course: ApiCourseDetail) => void;
}) {
  const [form, setForm] = useState(() => ({
    title: course?.title ?? "",
    chapter_id: course?.chapter_id ?? "",
    category: course?.category ?? "",
    level: course?.level ?? "beginner",
    instructor_name: course?.instructor_name ?? "",
    summary: course?.summary ?? "",
    description: course?.description ?? "",
  }));
  const { busy, error, run } = useSubmit();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (!creating && !course) return null;

  const submit = () =>
    run(async () => {
      if (form.title.trim().length < 3) throw new Error("Give the course a title of at least 3 characters.");
      if (form.category.trim() && form.category.trim().length < 2) throw new Error("The category needs at least 2 characters.");
      const fields = {
        title: form.title.trim(),
        category: orNull(form.category),
        level: form.level,
        instructor_name: orNull(form.instructor_name),
        summary: orNull(form.summary),
        description: orNull(form.description),
      };
      if (creating) {
        const next = await api<ApiCourseDetail>("courses", {
          method: "POST",
          body: JSON.stringify({ ...fields, chapter_id: form.chapter_id || null }),
        });
        onCreated(next);
      } else if (course) {
        const next = await api<ApiCourseDetail>(`courses/${course.id}`, { method: "PATCH", body: JSON.stringify(fields) });
        onSaved(next);
      }
    });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} placeholder="Foundations of Faith" />
        {creating ? <ChapterSelect className="sm:col-span-2" value={form.chapter_id} onChange={set("chapter_id")} /> : null}
        <TextInput label="Category" value={form.category} onChange={set("category")} placeholder="Bible Study" />
        <Select label="Level" value={form.level} onChange={set("level")} options={LEVELS} />
        <TextInput label="Instructor" className="sm:col-span-2" value={form.instructor_name} onChange={set("instructor_name")} placeholder="Pastor Daniel" />
        <TextArea label="Summary" rows={2} className="sm:col-span-2" value={form.summary} onChange={set("summary")} placeholder="One or two lines shown in the course list." />
        <TextArea label="Description" rows={4} className="sm:col-span-2" value={form.description} onChange={set("description")} placeholder="What learners will get out of this course." />
      </div>
      <FormError message={error} />
      <div className="mt-4 flex justify-end">
        <PrimaryButton icon={creating ? "arrowRight" : "check"} disabled={busy} onClick={submit}>
          {busy ? "Saving…" : creating ? "Create and add lessons" : "Save details"}
        </PrimaryButton>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lessons                                                             */
/* ------------------------------------------------------------------ */

const emptyLesson = { title: "", body: "", video_url: "", duration_minutes: "", module_title: "", scripture_reference: "", scripture_text: "", notes_url: "" };

function LessonsTab({
  course,
  onUpdated,
}: {
  course: ApiCourseDetail;
  onUpdated: (course: ApiCourseDetail, message?: string) => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(course.lessons.length ? null : "new");
  const [form, setForm] = useState(emptyLesson);
  const { busy, error, setError, run } = useSubmit();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const startEdit = (lesson: ApiLesson | null) => {
    setError("");
    setEditing(lesson ? lesson.id : "new");
    setForm(
      lesson
        ? {
            title: lesson.title,
            body: lesson.body ?? "",
            // Uploaded files come back as short-lived signed links; only links typed here are edited.
            video_url: lesson.has_video_file ? "" : lesson.video_url ?? "",
            duration_minutes: lesson.duration_minutes ? String(lesson.duration_minutes) : "",
            module_title: lesson.module_title ?? "",
            scripture_reference: lesson.scripture_reference ?? "",
            scripture_text: lesson.scripture_text ?? "",
            notes_url: lesson.has_notes_file ? "" : lesson.notes_url ?? "",
          }
        : emptyLesson,
    );
  };

  const save = () =>
    run(async () => {
      if (form.title.trim().length < 3) throw new Error("Give the lesson a title of at least 3 characters.");
      const current = course.lessons.find((l) => l.id === editing);
      const body = JSON.stringify({
        title: form.title.trim(),
        body: orNull(form.body),
        ...(current?.has_video_file ? {} : { video_url: orNull(form.video_url) }),
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        module_title: orNull(form.module_title),
        scripture_reference: orNull(form.scripture_reference),
        scripture_text: orNull(form.scripture_text),
        ...(current?.has_notes_file ? {} : { notes_url: orNull(form.notes_url) }),
      });
      const next =
        editing === "new"
          ? await api<ApiCourseDetail>(`courses/${course.id}/lessons`, { method: "POST", body })
          : await api<ApiCourseDetail>(`course-lessons/${editing}`, { method: "PATCH", body });
      onUpdated(next, editing === "new" ? "Lesson added." : "Lesson saved.");
      setEditing(null);
      setForm(emptyLesson);
    });

  const remove = (lesson: ApiLesson) =>
    run(async () => {
      if (!window.confirm(`Delete the lesson “${lesson.title}”?`)) return;
      onUpdated(await api<ApiCourseDetail>(`course-lessons/${lesson.id}`, { method: "DELETE" }), "Lesson deleted.");
    });

  // Swap positions with the neighbour; renumber everything so positions stay unique.
  const move = (index: number, delta: -1 | 1) =>
    run(async () => {
      const order = [...course.lessons];
      const [item] = order.splice(index, 1);
      order.splice(index + delta, 0, item);
      let next = course;
      for (const [position, lesson] of order.entries()) {
        if (lesson.position !== position) {
          next = await api<ApiCourseDetail>(`course-lessons/${lesson.id}`, {
            method: "PATCH",
            body: JSON.stringify({ position }),
          });
        }
      }
      onUpdated(next);
    });

  return (
    <div>
      <ol className="space-y-2">
        {course.lessons.map((lesson, i) => (
          <li key={lesson.id} className="rounded-xl border border-line">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{lesson.title}</p>
                <p className="truncate text-xs text-muted">
                  {[lesson.has_video_file ? "Video file" : lesson.video_url ? "Video link" : null, lesson.has_notes_file ? "Notes PDF" : null, lesson.body ? "Reading" : null, lesson.duration_minutes ? `${lesson.duration_minutes} min` : null].filter(Boolean).join(" · ") || "No content yet"}
                </p>
              </div>
              <IconButton label="Move up" icon="arrowUp" disabled={busy || i === 0} onClick={() => move(i, -1)} />
              <IconButton label="Move down" icon="arrowDown" disabled={busy || i === course.lessons.length - 1} onClick={() => move(i, 1)} />
              <IconButton label="Edit lesson" icon="edit" disabled={busy} onClick={() => startEdit(lesson)} />
              <IconButton label="Delete lesson" icon="trash" disabled={busy} onClick={() => remove(lesson)} />
            </div>
            {editing === lesson.id ? (
              <>
                <LessonFiles lesson={lesson} onUpdated={onUpdated} />
                <LessonFields form={form} set={set} busy={busy} onSave={save} onCancel={() => setEditing(null)} />
              </>
            ) : null}
          </li>
        ))}
      </ol>

      {course.lessons.length === 0 && editing !== "new" ? <p className="py-4 text-center text-sm text-muted">No lessons yet.</p> : null}

      {editing === "new" ? (
        <div className="mt-3 rounded-xl border border-brand/30">
          <p className="px-3.5 pt-3 text-sm font-semibold text-ink">New lesson</p>
          <LessonFields form={form} set={set} busy={busy} onSave={save} onCancel={course.lessons.length ? () => setEditing(null) : undefined} />
        </div>
      ) : (
        <SecondaryButton icon="plus" tone="brand" className="mt-3" onClick={() => startEdit(null)}>
          Add lesson
        </SecondaryButton>
      )}
      <FormError message={error} />
    </div>
  );
}

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/** Upload a lesson video or notes PDF straight to storage (S3), with progress. */
function LessonFiles({ lesson, onUpdated }: { lesson: ApiLesson; onUpdated: (course: ApiCourseDetail, message?: string) => void }) {
  const [progress, setProgress] = useState<{ kind: string; pct: number } | null>(null);
  const [error, setError] = useState("");

  const upload = async (kind: "video" | "notes", file: File) => {
    setError("");
    const allowed = kind === "video" ? VIDEO_TYPES : ["application/pdf"];
    if (!allowed.includes(file.type)) {
      setError(kind === "video" ? "Choose an MP4, MOV or WebM video." : "Choose a PDF file.");
      return;
    }
    try {
      setProgress({ kind, pct: 0 });
      const intent = await api<{ upload_url: string; method: "PUT" | "POST"; headers: Record<string, string>; object_key: string }>(
        `course-lessons/${lesson.id}/files/upload-intent`,
        { method: "POST", body: JSON.stringify({ kind, content_type: file.type, size_bytes: file.size }) },
      );
      // XMLHttpRequest, so large videos show upload progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(intent.method, intent.upload_url);
        Object.entries(intent.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress({ kind, pct: Math.round((e.loaded / e.total) * 100) });
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed. Check the storage CORS settings."));
        xhr.send(file);
      });
      const next = await api<ApiCourseDetail>(`course-lessons/${lesson.id}/files/confirm`, {
        method: "POST",
        body: JSON.stringify({ kind, object_key: intent.object_key }),
      });
      onUpdated(next, kind === "video" ? "Video uploaded." : "Notes uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  const remove = async (kind: "video" | "notes") => {
    if (!window.confirm(kind === "video" ? "Remove the uploaded video?" : "Remove the uploaded notes?")) return;
    try {
      onUpdated(await api<ApiCourseDetail>(`course-lessons/${lesson.id}/files/${kind}`, { method: "DELETE" }), "File removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the file.");
    }
  };

  const slot = (kind: "video" | "notes", label: string, has: boolean | undefined, accept: string) => (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-xs text-muted">{has ? "Uploaded" : "None"}</span>
      <span className="flex-1" />
      {progress?.kind === kind ? (
        <span className="text-xs font-semibold text-brand">Uploading {progress.pct}%</span>
      ) : (
        <>
          <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas">
            {has ? "Replace" : "Upload"}
            <input type="file" accept={accept} className="hidden" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])} />
          </label>
          {has ? (
            <button type="button" className="rounded-lg px-2 py-1.5 text-xs text-brand hover:bg-brand-soft" onClick={() => remove(kind)}>
              Remove
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-2 border-t border-line px-3.5 pt-3">
      {slot("video", "Lesson video", lesson.has_video_file, VIDEO_TYPES.join(","))}
      {slot("notes", "Notes PDF", lesson.has_notes_file, "application/pdf")}
      <p className="text-[11.5px] text-muted">Uploaded files are stored privately (Amazon S3) and play through CloudFront. They replace the links below.</p>
      <FormError message={error} />
    </div>
  );
}

function LessonFields({
  form,
  set,
  busy,
  onSave,
  onCancel,
}: {
  form: typeof emptyLesson;
  set: (key: keyof typeof emptyLesson) => (value: string) => void;
  busy: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-line p-3.5 sm:grid-cols-[1fr_140px]">
      <TextInput label="Lesson title" required value={form.title} onChange={set("title")} placeholder="Who is Jesus?" />
      <TextInput label="Minutes" type="number" min={1} value={form.duration_minutes} onChange={set("duration_minutes")} placeholder="15" />
      <TextInput label="Module" className="sm:col-span-2" value={form.module_title} onChange={set("module_title")} placeholder="Module 1 · Knowing Jesus (lessons with the same module are grouped)" />
      <TextInput label="Video link" type="url" className="sm:col-span-2" value={form.video_url} onChange={set("video_url")} placeholder="https://youtube.com/…" />
      <TextArea label="Lesson content" rows={5} className="sm:col-span-2" value={form.body} onChange={set("body")} placeholder="Notes, scripture and reflection questions." />
      <TextInput label="Scripture reference" value={form.scripture_reference} onChange={set("scripture_reference")} placeholder="John 3:16" />
      <TextInput label="Lesson notes (PDF link)" type="url" value={form.notes_url} onChange={set("notes_url")} placeholder="https://…/notes.pdf" />
      <TextArea label="Scripture text" rows={2} className="sm:col-span-2" value={form.scripture_text} onChange={set("scripture_text")} placeholder="For God so loved the world…" />
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton> : null}
        <PrimaryButton icon="check" disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save lesson"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: "arrowUp" | "arrowDown" | "edit" | "trash" | "x"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-1.5 text-ink/70 hover:bg-canvas hover:text-ink disabled:opacity-30"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

type QuestionDraft = { prompt: string; options: string[]; correct_index: number; explanation: string };

const emptyQuestion = (): QuestionDraft => ({ prompt: "", options: ["", ""], correct_index: 0, explanation: "" });

function QuizzesTab({
  course,
  reload,
  onChanged,
}: {
  course: ApiCourseDetail;
  reload: () => Promise<void>;
  onChanged: Notify;
}) {
  const [editing, setEditing] = useState<ApiQuiz | "new" | null>(null);
  const { busy, error, run } = useSubmit();

  const remove = (quiz: ApiQuiz) =>
    run(async () => {
      if (!window.confirm(`Delete the quiz “${quiz.title}” and its results?`)) return;
      await api(`course-quizzes/${quiz.id}`, { method: "DELETE" });
      await reload();
      onChanged("Quiz deleted.");
    });

  if (editing) {
    return (
      <QuizEditor
        course={course}
        quiz={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async (message) => {
          await reload();
          onChanged(message);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div>
      <ul className="space-y-2">
        {course.quizzes.map((quiz) => {
          const lesson = course.lessons.find((l) => l.id === quiz.lesson_id);
          return (
            <li key={quiz.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
              <Icon name="fileText" size={18} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{quiz.title}</p>
                <p className="truncate text-xs text-muted">
                  {quiz.question_count} questions · pass mark {quiz.pass_mark}% · {lesson ? `after “${lesson.title}”` : "course assessment"}
                </p>
              </div>
              <Badge tone="gray">{quiz.attempt_count} attempts</Badge>
              <IconButton label="Edit quiz" icon="edit" disabled={busy} onClick={() => setEditing(quiz)} />
              <IconButton label="Delete quiz" icon="trash" disabled={busy} onClick={() => remove(quiz)} />
            </li>
          );
        })}
      </ul>
      {course.quizzes.length === 0 ? <p className="py-4 text-center text-sm text-muted">No quizzes yet.</p> : null}
      <SecondaryButton icon="plus" tone="brand" className="mt-3" onClick={() => setEditing("new")}>
        Add quiz
      </SecondaryButton>
      <FormError message={error} />
    </div>
  );
}

function QuizEditor({
  course,
  quiz,
  onCancel,
  onSaved,
}: {
  course: ApiCourseDetail;
  quiz: ApiQuiz | null;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [lessonId, setLessonId] = useState(quiz?.lesson_id ?? "");
  const [passMark, setPassMark] = useState(String(quiz?.pass_mark ?? 70));
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    quiz?.questions.length
      ? quiz.questions.map((q) => ({ prompt: q.prompt, options: [...q.options], correct_index: q.correct_index ?? 0, explanation: q.explanation ?? "" }))
      : [emptyQuestion()],
  );
  const { busy, error, run } = useSubmit();

  const patch = (index: number, change: Partial<QuestionDraft>) =>
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...change } : q)));

  const setOption = (qi: number, oi: number, value: string) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)));

  const removeOption = (qi: number, oi: number) =>
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qi) return q;
        const options = q.options.filter((_, j) => j !== oi);
        const correct = q.correct_index === oi ? 0 : q.correct_index > oi ? q.correct_index - 1 : q.correct_index;
        return { ...q, options, correct_index: correct };
      }),
    );

  const save = () =>
    run(async () => {
      if (title.trim().length < 3) throw new Error("Give the quiz a title of at least 3 characters.");
      const mark = Number(passMark);
      if (!mark || mark < 1 || mark > 100) throw new Error("The pass mark must be between 1 and 100.");
      const cleaned = questions.map((q, i) => {
        const options = q.options.map((o) => o.trim());
        if (q.prompt.trim().length < 3) throw new Error(`Question ${i + 1} needs a question of at least 3 characters.`);
        if (options.length < 2 || options.some((o) => !o)) throw new Error(`Question ${i + 1} needs at least two filled-in answers.`);
        return { prompt: q.prompt.trim(), options, correct_index: q.correct_index, explanation: q.explanation.trim() || null };
      });
      const body = JSON.stringify({ title: title.trim(), lesson_id: lessonId || null, pass_mark: mark, questions: cleaned });
      if (quiz) await api(`course-quizzes/${quiz.id}`, { method: "PATCH", body });
      else await api(`courses/${course.id}/quizzes`, { method: "POST", body });
      await onSaved(quiz ? "Quiz saved." : "Quiz added.");
    });

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_110px]">
        <TextInput label="Quiz title" required value={title} onChange={setTitle} placeholder="Lesson 1 check" />
        <Select
          label="Comes after"
          value={lessonId}
          onChange={setLessonId}
          options={[{ value: "", label: "Whole course (final assessment)" }, ...course.lessons.map((l, i) => ({ value: l.id, label: `Lesson ${i + 1}: ${l.title}` }))]}
        />
        <TextInput label="Pass mark %" type="number" min={1} max={100} value={passMark} onChange={setPassMark} />
      </div>

      <ol className="mt-5 space-y-4">
        {questions.map((q, qi) => (
          <li key={qi} className="rounded-xl border border-line p-3.5">
            <div className="flex items-start gap-2">
              <TextInput label={`Question ${qi + 1}`} required className="flex-1" value={q.prompt} onChange={(v) => patch(qi, { prompt: v })} placeholder="Who led the Israelites out of Egypt?" />
              {questions.length > 1 ? (
                <div className="pt-7">
                  <IconButton label="Remove question" icon="trash" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} />
                </div>
              ) : null}
            </div>
            <p className="mb-1.5 mt-3 text-xs text-muted">Answers — select the correct one</p>
            <div className="space-y-2">
              {q.options.map((option, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    aria-label={`Answer ${oi + 1} is correct`}
                    checked={q.correct_index === oi}
                    onChange={() => patch(qi, { correct_index: oi })}
                    className="h-4 w-4 accent-brand"
                  />
                  <input
                    value={option}
                    onChange={(e) => setOption(qi, oi, e.target.value)}
                    placeholder={`Answer ${oi + 1}`}
                    className={cx(
                      "h-9 flex-1 rounded-lg border px-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft",
                      q.correct_index === oi ? "border-emerald-300 bg-emerald-50/50" : "border-line",
                    )}
                  />
                  {q.options.length > 2 ? <IconButton label="Remove answer" icon="x" onClick={() => removeOption(qi, oi)} /> : null}
                </div>
              ))}
            </div>
            {q.options.length < 8 ? (
              <button type="button" onClick={() => patch(qi, { options: [...q.options, ""] })} className="mt-2 text-sm font-medium text-brand hover:underline">
                + Add answer
              </button>
            ) : null}
            <TextInput
              label="Why this is the right answer (shown after answering)"
              className="mt-3"
              value={q.explanation}
              onChange={(v) => patch(qi, { explanation: v })}
              placeholder="Matthew, Mark, Luke and John tell the story of Jesus' life."
            />
          </li>
        ))}
      </ol>

      <SecondaryButton icon="plus" className="mt-3" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}>
        Add question
      </SecondaryButton>
      <FormError message={error} />
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        <SecondaryButton onClick={onCancel}>Back to quizzes</SecondaryButton>
        <PrimaryButton icon="check" disabled={busy} onClick={save}>
          {busy ? "Saving…" : quiz ? "Save quiz" : "Add quiz"}
        </PrimaryButton>
      </div>
    </div>
  );
}

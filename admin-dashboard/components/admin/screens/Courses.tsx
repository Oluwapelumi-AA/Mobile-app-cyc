"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  downloadCsv,
  matches,
  useAdmin,
  useChapters,
  useLiveList,
} from "../data";
import { useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import {
  type ApiAttempt,
  type ApiCertificate,
  type ApiCourse,
  type ApiCourseDetail,
  type ApiCourseOverview,
  mapCourse,
} from "../mappers";
import { type CourseRow, sampleCourses } from "../sample";
import CourseBuilder from "./CourseBuilder";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Checkbox,
  EmptyRow,
  ExportButton,
  LoadingRows,
  MiniStat,
  PageHeader,
  Pagination,
  PrimaryButton,
  QuickTile,
  RowMenu,
  SampleTag,
  SearchField,
  SelectField,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  Thumb,
  type Tone,
  ViewAll,
  compactNumber,
  cx,
  formatDate,
  usePaged,
  useSelection,
} from "../ui";

const LEVEL_TONE: Record<CourseRow["level"], Tone> = {
  Beginner: "green",
  Intermediate: "blue",
  Advanced: "red",
};

type TabKey =
  "all" | "Published" | "Draft" | "quizzes" | "results" | "certificates";

type QuizRow = {
  id: string;
  title: string;
  courseId: string;
  course: string;
  questions: number;
  attempts: number;
  passMark: number;
};

function scoreClass(score: number, passMark = 70) {
  return score >= 85
    ? "bg-emerald-50 text-emerald-700"
    : score >= passMark
      ? "bg-amber-50 text-amber-700"
      : "bg-brand-soft text-brand";
}

export default function Courses() {
  const { globalSearch } = useAdmin();
  const data = useLiveList<ApiCourse, CourseRow>(
    "courses?limit=50",
    mapCourse,
    sampleCourses,
  );
  const { name: chapterName } = useChapters();
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState("newest");
  const [builder, setBuilder] = useState<{
    id: string | null;
    tab?: "details" | "lessons" | "quizzes";
  } | null>(null);
  const [overview, setOverview] = useState<ApiCourseOverview | null>(null);
  const [attempts, setAttempts] = useState<ApiAttempt[]>([]);
  const [certificates, setCertificates] = useState<ApiCertificate[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();
  const sample = data.mode === "sample";
  const live = !sample;

  const loadStats = useCallback(() => {
    api<ApiCourseOverview>("courses/overview")
      .then(setOverview)
      .catch(() => setOverview(null));
    api<{ items: ApiAttempt[] }>("courses/quiz-attempts?limit=50")
      .then((p) => setAttempts(p.items))
      .catch(() => setAttempts([]));
    api<{ items: ApiCertificate[] }>("courses/certificates?limit=50")
      .then((p) => setCertificates(p.items))
      .catch(() => setCertificates([]));
  }, []);
  useEffect(loadStats, [loadStats]);

  const items = data.items;

  // Quizzes live inside each course; load them when the tab is opened.
  useEffect(() => {
    if (tab !== "quizzes" || quizzes !== null || sample) return;
    const withQuizzes = items.filter((c) => (c.quizzes ?? 0) > 0);
    Promise.all(
      withQuizzes.map((c) =>
        api<ApiCourseDetail>(`courses/${c.id}`).catch(() => null),
      ),
    )
      .then((details) =>
        setQuizzes(
          details.flatMap((d) =>
            d
              ? d.quizzes.map((q) => ({
                  id: q.id,
                  title: q.title,
                  courseId: d.id,
                  course: d.title,
                  questions: q.question_count,
                  attempts: q.attempt_count,
                  passMark: q.pass_mark,
                }))
              : [],
          ),
        ),
      )
      .catch(() => setQuizzes([]));
  }, [tab, quizzes, sample, items]);

  const refresh = () => {
    data.reload();
    loadStats();
    setQuizzes(null);
  };

  const openBuilder = (
    id: string | null,
    which?: "details" | "lessons" | "quizzes",
  ) => {
    if (sample) {
      toast.error("Connect the backend to create courses.");
      return;
    }
    setBuilder({ id, tab: which });
  };

  const categories = [...new Set(items.map((c) => c.category))];
  const filtered = items
    .filter(
      (c) =>
        (tab === "all" || c.status === tab) &&
        (category === "all" || c.category === category) &&
        (status === "all" || c.status === status) &&
        (level === "all" || c.level === level) &&
        matches(
          search || globalSearch,
          c.title,
          c.summary,
          c.instructor,
          c.category,
        ),
    )
    .sort((a, b) => (sort === "students" ? b.students - a.students : 0));
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((c) => c.id));
  const popular = useMemo(
    () => [...items].sort((a, b) => b.students - a.students).slice(0, 4),
    [items],
  );

  const setCourseStatus = async (c: CourseRow, publish: boolean) => {
    try {
      if (live)
        await api(`courses/${c.id}/${publish ? "publish" : "unpublish"}`, {
          method: "POST",
        });
      data.setItems((rows) =>
        rows.map((r) =>
          r.id === c.id ? { ...r, status: publish ? "Published" : "Draft" } : r,
        ),
      );
      toast.success(publish ? "Course published." : "Course moved to drafts.");
      if (live) loadStats();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the course.",
      );
    }
  };

  const remove = (c: CourseRow) =>
    ask({
      title: "Delete course",
      message: `“${c.title}” will be deleted with its lessons, quizzes, enrolments and results.`,
      confirmLabel: "Delete course",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`courses/${c.id}`, { method: "DELETE" });
          toast.success("Course deleted.");
          refresh();
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not delete the course.",
          );
        }
      },
    });

  const showCourses = tab === "all" || tab === "Published" || tab === "Draft";
  const quizTotal =
    overview?.quizzes ?? items.reduce((s, c) => s + (c.quizzes ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Courses and quizzes"
        subtitle="Create and manage courses, lessons, quizzes and certificates."
        action={sample ? <SampleTag reason={data.error} /> : null}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => {
                setTab(k);
                paged.setPage(1);
              }}
              tabs={[
                { key: "all", label: "All courses", count: items.length },
                {
                  key: "Published",
                  label: "Published",
                  count: items.filter((c) => c.status === "Published").length,
                },
                {
                  key: "Draft",
                  label: "Drafts",
                  count: items.filter((c) => c.status === "Draft").length,
                },
                { key: "quizzes", label: "Quizzes", count: quizTotal },
                {
                  key: "results",
                  label: "Quiz results",
                  count: attempts.length,
                },
                {
                  key: "certificates",
                  label: "Certificates",
                  count: certificates.length,
                },
              ]}
            />
            <PrimaryButton
              className="mb-3 self-start md:self-auto"
              onClick={() => openBuilder(null)}
            >
              Create course
            </PrimaryButton>
          </div>

          {showCourses ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
                <SearchField
                  className="col-span-2 md:min-w-[150px] md:flex-1"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search courses..."
                />
                <SelectField
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  className="md:w-[132px]"
                  options={[
                    { value: "all", label: "All categories" },
                    ...categories.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <SelectField
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  className="md:w-[116px]"
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "Published", label: "Published" },
                    { value: "Draft", label: "Draft" },
                  ]}
                />
                <SelectField
                  label="Level"
                  value={level}
                  onChange={setLevel}
                  className="md:w-[106px]"
                  options={[
                    { value: "all", label: "All levels" },
                    ...["Beginner", "Intermediate", "Advanced"].map((l) => ({
                      value: l,
                      label: l,
                    })),
                  ]}
                />
                <SelectField
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  className="md:w-[132px]"
                  options={[
                    { value: "newest", label: "Newest first" },
                    { value: "students", label: "Most students" },
                  ]}
                />
              </div>

              <div className="mt-4">
                <Table minWidth={860}>
                  <thead>
                    <tr>
                      <Th className="w-10">
                        <Checkbox
                          label="Select all"
                          checked={sel.all}
                          onChange={sel.toggleAll}
                        />
                      </Th>
                      <Th>Course</Th>
                      <Th>Instructor</Th>
                      <Th>Category</Th>
                      <Th>Level</Th>
                      <Th>Lessons</Th>
                      <Th>Students</Th>
                      <Th>Status</Th>
                      <Th className="text-center">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mode === "loading" ? <LoadingRows cols={9} /> : null}
                    {paged.slice.map((c) => (
                      <tr
                        key={c.id}
                        className={cx(
                          "hover:bg-canvas/40",
                          live ? "cursor-pointer" : "",
                        )}
                        onClick={(ev) => {
                          if (
                            (ev.target as HTMLElement).closest("button,input")
                          )
                            return;
                          if (live) openBuilder(c.id, "lessons");
                        }}
                      >
                        <Td>
                          <Checkbox
                            label={`Select ${c.title}`}
                            checked={sel.selected.has(c.id)}
                            onChange={(v) => sel.toggle(c.id, v)}
                          />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Thumb seed={c.title} width={64} height={50} />
                            <div className="min-w-0">
                              <p className="max-w-[170px] truncate font-semibold text-ink">
                                {c.title}
                              </p>
                              <p className="line-clamp-2 max-w-[170px] text-[11px] leading-snug text-ink/70">
                                {c.summary ||
                                  (live ? chapterName(c.chapterId) : "")}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={c.instructor === "—" ? "?" : c.instructor}
                              size={28}
                            />
                            <span className="whitespace-nowrap">
                              {c.instructor}
                            </span>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">{c.category}</Td>
                        <Td>
                          <Badge tone={LEVEL_TONE[c.level] ?? "gray"}>
                            {c.level}
                          </Badge>
                        </Td>
                        <Td>{c.lessons}</Td>
                        <Td>{compactNumber(c.students)}</Td>
                        <Td>
                          <StatusBadge status={c.status} />
                        </Td>
                        <Td className="text-center">
                          <RowMenu
                            actions={[
                              ...(live
                                ? [
                                    {
                                      label: "Edit details",
                                      icon: "edit" as const,
                                      onSelect: () =>
                                        openBuilder(c.id, "details"),
                                    },
                                    {
                                      label: "Lessons",
                                      icon: "book" as const,
                                      onSelect: () =>
                                        openBuilder(c.id, "lessons"),
                                    },
                                    {
                                      label: "Quizzes",
                                      icon: "fileText" as const,
                                      onSelect: () =>
                                        openBuilder(c.id, "quizzes"),
                                    },
                                  ]
                                : []),
                              c.status === "Published"
                                ? {
                                    label: "Move to drafts",
                                    icon: "x" as const,
                                    onSelect: () =>
                                      void setCourseStatus(c, false),
                                  }
                                : {
                                    label: "Publish",
                                    icon: "check" as const,
                                    onSelect: () =>
                                      void setCourseStatus(c, true),
                                  },
                              ...(live
                                ? [
                                    {
                                      label: "Delete",
                                      icon: "trash" as const,
                                      danger: true,
                                      onSelect: () => remove(c),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </Td>
                      </tr>
                    ))}
                    {data.mode !== "loading" && filtered.length === 0 ? (
                      <EmptyRow
                        cols={9}
                        title="No courses found"
                        hint={
                          items.length === 0
                            ? "Create your first course to get started."
                            : undefined
                        }
                      />
                    ) : null}
                  </tbody>
                </Table>
              </div>
              <Pagination
                page={paged.page}
                pages={paged.pages}
                onPage={paged.setPage}
                summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`}
              />
            </>
          ) : tab === "quizzes" ? (
            <div className="mt-4">
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <Th>Quiz</Th>
                    <Th>Course</Th>
                    <Th>Questions</Th>
                    <Th>Pass mark</Th>
                    <Th>Attempts</Th>
                    <Th className="text-center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {quizzes === null && live ? (
                    <LoadingRows cols={6} rows={3} />
                  ) : null}
                  {(quizzes ?? []).map((q) => (
                    <tr key={q.id} className="hover:bg-canvas/40">
                      <Td>
                        <span className="flex items-center gap-2 font-medium text-ink">
                          <Icon
                            name="fileText"
                            size={17}
                            className="text-brand"
                          />
                          {q.title}
                        </span>
                      </Td>
                      <Td>{q.course}</Td>
                      <Td>{q.questions}</Td>
                      <Td>{q.passMark}%</Td>
                      <Td>{q.attempts}</Td>
                      <Td className="text-center">
                        <button
                          type="button"
                          onClick={() => openBuilder(q.courseId, "quizzes")}
                          className="rounded-lg border border-brand/20 px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft"
                        >
                          Manage
                        </button>
                      </Td>
                    </tr>
                  ))}
                  {quizzes !== null && quizzes.length === 0 ? (
                    <EmptyRow
                      cols={6}
                      title="No quizzes yet"
                      hint="Open a course and add a quiz from its Quizzes tab."
                    />
                  ) : null}
                </tbody>
              </Table>
            </div>
          ) : tab === "results" ? (
            <div className="mt-4">
              <div className="mb-3 flex justify-end">
                <ExportButton
                  onClick={() =>
                    downloadCsv(
                      "cyc-quiz-results.csv",
                      attempts.map((a) => ({
                        student: a.user_name ?? a.user_id,
                        quiz: a.quiz_title,
                        score: a.score,
                        passed: a.passed,
                        taken_at: a.created_at,
                      })),
                    )
                  }
                />
              </div>
              <Table minWidth={700}>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Quiz</Th>
                    <Th>Course</Th>
                    <Th>Score</Th>
                    <Th>Correct</Th>
                    <Th>Result</Th>
                    <Th>Date</Th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="hover:bg-canvas/40">
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={a.user_name ?? "?"} size={28} />
                          {a.user_name ?? "Unknown"}
                        </span>
                      </Td>
                      <Td>{a.quiz_title}</Td>
                      <Td>
                        {items.find((c) => c.id === a.course_id)?.title ?? "—"}
                      </Td>
                      <Td>
                        <span
                          className={cx(
                            "rounded-md px-1.5 py-0.5 text-xs font-semibold",
                            scoreClass(a.score),
                          )}
                        >
                          {a.score}%
                        </span>
                      </Td>
                      <Td>
                        {a.correct_count}/{a.question_count}
                      </Td>
                      <Td>
                        <StatusBadge status={a.passed ? "Passed" : "Failed"} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        {formatDate(a.created_at)}
                      </Td>
                    </tr>
                  ))}
                  {attempts.length === 0 ? (
                    <EmptyRow
                      cols={7}
                      title="No quiz results yet"
                      hint="Results appear when learners take quizzes in the CYC app."
                    />
                  ) : null}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-3 rounded-xl border border-line bg-canvas/50 p-3 text-xs text-muted">
                A learner earns a certificate when they complete every lesson of
                a course in the CYC app.
              </p>
              <Table minWidth={620}>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Course</Th>
                    <Th>Best quiz score</Th>
                    <Th>Completed</Th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((c) => (
                    <tr
                      key={`${c.course_id}-${c.user_id}`}
                      className="hover:bg-canvas/40"
                    >
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={c.user_name ?? "?"} size={28} />
                          {c.user_name ?? "Unknown"}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Icon name="award" size={16} className="text-brand" />
                          {c.course_title}
                        </span>
                      </Td>
                      <Td>
                        {c.best_score === null ? "—" : `${c.best_score}%`}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {formatDate(c.completed_at)}
                      </Td>
                    </tr>
                  ))}
                  {certificates.length === 0 ? (
                    <EmptyRow cols={4} title="No certificates yet" />
                  ) : null}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Learning overview" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat
                icon="users"
                value={compactNumber(
                  overview?.students ??
                    items.reduce((s, c) => s + c.students, 0),
                )}
                label="Total students"
              />
              <MiniStat
                icon="cap"
                value={String(overview?.courses ?? items.length)}
                label="Total courses"
              />
              <MiniStat
                icon="fileText"
                value={String(quizTotal)}
                label="Total quizzes"
              />
              <MiniStat
                icon="award"
                value={String(overview?.certificates ?? certificates.length)}
                label="Certificates"
              />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Popular courses"
              action={
                <ViewAll
                  onClick={() => {
                    setTab("all");
                    setSort("students");
                  }}
                />
              }
            />
            <ul className="mt-3 divide-y divide-line">
              {popular.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => live && openBuilder(c.id, "lessons")}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <Thumb seed={c.title} width={56} height={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {c.title}
                      </span>
                      <span className="block text-[11.5px] text-muted">
                        {compactNumber(c.students)} students
                      </span>
                    </span>
                    <Icon
                      name="chevronRight"
                      size={18}
                      className="text-ink/70"
                    />
                  </button>
                </li>
              ))}
              {popular.length === 0 ? (
                <li className="py-3 text-sm text-muted">No courses yet.</li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Recent quiz attempts"
              action={<ViewAll onClick={() => setTab("results")} />}
            />
            <table className="mt-3 w-full text-left text-[11.5px]">
              <thead>
                <tr className="text-ink/70">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium">Quiz</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.recent_attempts ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={a.user_name ?? "?"} size={24} />
                        <span className="truncate">
                          {a.user_name ?? "Unknown"}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-ink/80">{a.quiz_title}</td>
                    <td className="py-2">
                      <span
                        className={cx(
                          "rounded-md px-1.5 py-0.5 font-semibold",
                          scoreClass(a.score),
                        )}
                      >
                        {a.score}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 text-ink/70">
                      {formatDate(a.created_at).replace(/, \d{4}$/, "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(overview?.recent_attempts ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted">No attempts yet.</p>
            ) : null}
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile
                primary
                icon="plus"
                label="Create course"
                onClick={() => openBuilder(null)}
              />
              <QuickTile
                icon="fileText"
                label="Manage quizzes"
                onClick={() => setTab("quizzes")}
              />
              <QuickTile
                icon="award"
                label="Certificates"
                onClick={() => setTab("certificates")}
              />
              <QuickTile
                icon="barChart"
                label="Quiz results"
                onClick={() => setTab("results")}
              />
            </div>
          </Card>
        </div>
      </div>

      {builder ? (
        <CourseBuilder
          key={builder.id ?? "new"}
          open
          courseId={builder.id}
          initialTab={builder.tab}
          onClose={() => {
            setBuilder(null);
            refresh();
          }}
          onChanged={(message, failed) =>
            failed ? toast.error(message) : toast.success(message)
          }
        />
      ) : null}
      {dialog}
      {toast.element}
    </>
  );
}

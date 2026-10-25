"use client";

import { useState } from "react";
import { matches, useAdmin, useLiveList } from "../data";
import { Modal, useToast } from "../dialogs";
import { Icon } from "../icons";
import { type CourseRow, sampleCourses, sampleQuizAttempts } from "../sample";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Checkbox,
  EmptyRow,
  MiniStat,
  PageHeader,
  Pagination,
  PrimaryButton,
  QuickTile,
  RangeSelect,
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

const LEVEL_TONE: Record<CourseRow["level"], Tone> = { Beginner: "green", Intermediate: "blue", Advanced: "red" };

type TabKey = "all" | "Published" | "Draft" | "quizzes" | "results" | "certificates";

export default function Courses() {
  const { globalSearch } = useAdmin();
  // Courses, lessons and quizzes are not in the API yet.
  const data = useLiveList<never, CourseRow>(null, (x) => x, sampleCourses);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState("30");
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedAttemptKey, setSelectedAttemptKey] = useState(`${sampleQuizAttempts[0]?.student}|${sampleQuizAttempts[0]?.quiz}`);
  const [certificateStatuses, setCertificateStatuses] = useState<Record<string, "Not issued" | "Sent (preview)">>({});
  const toast = useToast();

  const attemptKey = (q: (typeof sampleQuizAttempts)[number]) => `${q.student}|${q.quiz}`;
  const eligibleAttempts = sampleQuizAttempts.filter((q) => q.score >= 70);
  const selectedAttempt = eligibleAttempts.find((q) => attemptKey(q) === selectedAttemptKey) ?? eligibleAttempts[0];
  const sendCertificatePreview = (q: (typeof sampleQuizAttempts)[number]) => {
    if (q.score < 70) {
      toast.error("This learner has not met the passing score for a certificate.");
      return;
    }
    setCertificateStatuses((current) => ({ ...current, [attemptKey(q)]: "Sent (preview)" }));
    toast.success("Certificate marked as sent in this preview. Connect the certificates API to deliver it to the learner.");
  };

  const items = data.items;
  const categories = [...new Set(items.map((c) => c.category))];
  const filtered = items
    .filter(
      (c) =>
        (tab === "all" || tab === "quizzes" || tab === "certificates" || c.status === tab) &&
        (category === "all" || c.category === category) &&
        (status === "all" || c.status === status) &&
        (level === "all" || c.level === level) &&
        matches(search || globalSearch, c.title, c.summary, c.instructor, c.category),
    )
    .sort((a, b) => (sort === "students" ? b.students - a.students : 0));
  const paged = usePaged(filtered, 10);
  const sel = useSelection(paged.slice.map((c) => c.id));
  const popular = [...items].sort((a, b) => b.students - a.students).slice(0, 4);

  const setCourseStatus = (c: CourseRow, s: CourseRow["status"]) => {
    data.setItems((rows) => rows.map((r) => (r.id === c.id ? { ...r, status: s } : r)));
    toast.success(s === "Published" ? "Course published." : "Course moved to drafts.");
  };

  const showCourses = tab !== "quizzes" && tab !== "results" && tab !== "certificates";

  return (
    <>
      <PageHeader
        title="Courses and quizzes"
        subtitle="Create and manage courses, lessons, quizzes and certificates."
        action={<SampleTag reason="Courses, lessons, quizzes and certificates don't have backend endpoints yet." />}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 border-b border-line md:flex-row md:items-end md:justify-between">
            <Tabs
              value={tab}
              onChange={(k) => { setTab(k); paged.setPage(1); }}
              tabs={[
                { key: "all", label: "All courses", count: items.length },
                { key: "Published", label: "Published", count: items.filter((c) => c.status === "Published").length },
                { key: "Draft", label: "Drafts", count: items.filter((c) => c.status === "Draft").length },
                { key: "quizzes", label: "Quizzes", count: 48 },
                { key: "results", label: "Quiz results", count: sampleQuizAttempts.length },
                { key: "certificates", label: "Certificates", count: 12 },
              ]}
            />
            <PrimaryButton className="mb-3 self-start md:self-auto" onClick={() => toast.success("Course creation UI is ready for the courses API integration.")}>Create course</PrimaryButton>
          </div>

          {showCourses ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
                <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search courses..." />
                <SelectField label="Category" value={category} onChange={setCategory} className="md:w-[132px]" options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
                <SelectField label="Status" value={status} onChange={setStatus} className="md:w-[116px]" options={[{ value: "all", label: "All statuses" }, { value: "Published", label: "Published" }, { value: "Draft", label: "Draft" }]} />
                <SelectField label="Level" value={level} onChange={setLevel} className="md:w-[106px]" options={[{ value: "all", label: "All levels" }, ...["Beginner", "Intermediate", "Advanced"].map((l) => ({ value: l, label: l }))]} />
                <SelectField label="Sort" value={sort} onChange={setSort} className="md:w-[132px]" options={[{ value: "newest", label: "Newest first" }, { value: "students", label: "Most students" }]} />
              </div>

              <div className="mt-4">
                <Table minWidth={820}>
                  <thead>
                    <tr>
                      <Th className="w-10"><Checkbox label="Select all" checked={sel.all} onChange={sel.toggleAll} /></Th>
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
                    {paged.slice.map((c) => (
                      <tr key={c.id} className="hover:bg-canvas/40">
                        <Td><Checkbox label={`Select ${c.title}`} checked={sel.selected.has(c.id)} onChange={(v) => sel.toggle(c.id, v)} /></Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Thumb seed={c.title} width={64} height={50} />
                            <div className="min-w-0">
                              <p className="max-w-[170px] truncate font-semibold text-ink">{c.title}</p>
                              <p className="line-clamp-2 max-w-[170px] text-[12.5px] leading-snug text-ink/70">{c.summary}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Avatar name={c.instructor} size={28} />
                            <span className="whitespace-nowrap">{c.instructor}</span>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">{c.category}</Td>
                        <Td><Badge tone={LEVEL_TONE[c.level]}>{c.level}</Badge></Td>
                        <Td>{c.lessons}</Td>
                        <Td>{compactNumber(c.students)}</Td>
                        <Td><StatusBadge status={c.status} /></Td>
                        <Td className="text-center">
                          <RowMenu
                            actions={[
                              c.status === "Published"
                                ? { label: "Move to drafts", icon: "x", onSelect: () => setCourseStatus(c, "Draft") }
                                : { label: "Publish", icon: "check", onSelect: () => setCourseStatus(c, "Published") },
                              { label: "Create quiz", icon: "fileText", onSelect: () => { setTab("quizzes"); toast.success("Quiz management preview opened. Saving quizzes requires the courses API."); } },
                            ]}
                          />
                        </Td>
                      </tr>
                    ))}
                    {filtered.length === 0 ? <EmptyRow cols={9} title="No courses found" /> : null}
                  </tbody>
                </Table>
              </div>
              <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} items`} />
            </>
          ) : tab === "quizzes" ? (
            <div className="mt-4">
              <Table minWidth={640}>
                <thead>
                  <tr><Th>Quiz</Th><Th>Course</Th><Th>Questions</Th><Th>Attempts</Th><Th>Avg. score</Th></tr>
                </thead>
                <tbody>
                  {items.slice(0, 8).map((c, i) => (
                    <tr key={c.id} className="hover:bg-canvas/40">
                      <Td><span className="flex items-center gap-2 font-medium text-ink"><Icon name="fileText" size={17} className="text-brand" />Lesson {(i % 4) + 1} Quiz</span></Td>
                      <Td>{c.title}</Td>
                      <Td>{8 + (i % 5) * 2}</Td>
                      <Td>{Math.round(c.students * 0.6)}</Td>
                      <Td>{70 + ((i * 7) % 25)}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : tab === "results" ? (
            <div className="mt-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Quiz results and certificate eligibility</p>
                  <p className="mt-1 text-xs text-muted">Passing score: 70%. Results shown here are sample records until the learning API is connected.</p>
                </div>
                <PrimaryButton onClick={() => { setSelectedAttemptKey(attemptKey(eligibleAttempts[0])); setIssueOpen(true); }}>Issue certificate</PrimaryButton>
              </div>
              <Table minWidth={700}>
                <thead>
                  <tr><Th>Student</Th><Th>Quiz</Th><Th>Course</Th><Th>Score</Th><Th>Result</Th><Th>Certificate</Th><Th>Action</Th></tr>
                </thead>
                <tbody>
                  {sampleQuizAttempts.map((q, i) => {
                    const key = attemptKey(q);
                    const passed = q.score >= 70;
                    const certificateStatus = certificateStatuses[key] ?? "Not issued";
                    return (
                      <tr key={key} className="hover:bg-canvas/40">
                        <Td><span className="flex items-center gap-2"><Avatar name={q.student} size={28} />{q.student}</span></Td>
                        <Td>{q.quiz}</Td>
                        <Td>{items[i]?.title ?? "Course assessment"}</Td>
                        <Td><Badge tone={q.score >= 85 ? "green" : passed ? "amber" : "red"}>{q.score}%</Badge></Td>
                        <Td><StatusBadge status={passed ? "Passed" : "Failed"} /></Td>
                        <Td><StatusBadge status={certificateStatus} /></Td>
                        <Td>{passed ? <button type="button" onClick={() => sendCertificatePreview(q)} className="whitespace-nowrap rounded-lg border border-brand/20 px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft">{certificateStatus === "Not issued" ? "Send certificate" : "Sent (preview)"}</button> : <span className="text-xs text-muted">Not eligible</span>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/50 p-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Certificate issuance</p>
                  <p className="mt-1 text-xs text-muted">Only learners who pass the assessment should receive a certificate.</p>
                </div>
                <PrimaryButton onClick={() => { setSelectedAttemptKey(attemptKey(eligibleAttempts[0])); setIssueOpen(true); }}>Issue certificate</PrimaryButton>
              </div>
              <Table minWidth={650}>
                <thead>
                  <tr><Th>Student</Th><Th>Course</Th><Th>Assessment</Th><Th>Score</Th><Th>Certificate ID</Th><Th>Status</Th><Th>Action</Th></tr>
                </thead>
                <tbody>
                  {sampleQuizAttempts.map((q, i) => {
                    const key = attemptKey(q);
                    const passed = q.score >= 70;
                    const certificateStatus = certificateStatuses[key] ?? "Not issued";
                    return (
                      <tr key={key} className="hover:bg-canvas/40">
                        <Td><span className="flex items-center gap-2"><Avatar name={q.student} size={28} />{q.student}</span></Td>
                        <Td>{items[i]?.title ?? "Course assessment"}</Td>
                        <Td>{q.quiz}</Td>
                        <Td>{q.score}%</Td>
                        <Td>{passed ? <Badge tone="green"><Icon name="award" size={13} />CERT-{2040 + i}</Badge> : <span className="text-muted">—</span>}</Td>
                        <Td><StatusBadge status={passed ? certificateStatus : "Not eligible"} /></Td>
                        <Td>{passed ? <button type="button" onClick={() => sendCertificatePreview(q)} className="whitespace-nowrap rounded-lg border border-brand/20 px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft">{certificateStatus === "Not issued" ? "Send" : "Sent (preview)"}</button> : <span className="text-xs text-muted">Requires pass</span>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Learning overview" action={<RangeSelect value={range} onChange={setRange} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="users" value="6,420" label="Total students" delta={18} />
              <MiniStat icon="cap" value={String(items.length)} label="Total courses" delta={14} />
              <MiniStat icon="fileText" value="48" label="Total quizzes" delta={26} />
              <MiniStat icon="award" value="12" label="Certificates issued" delta={32} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Popular courses" action={<ViewAll onClick={() => setSort("students")} />} />
            <ul className="mt-3 divide-y divide-line">
              {popular.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left">
                    <Thumb seed={c.title} width={56} height={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{c.title}</span>
                      <span className="block text-[13px] text-muted">{compactNumber(c.students)} students</span>
                    </span>
                    <Icon name="chevronRight" size={18} className="text-ink/70" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <CardHeader title="Recent quiz attempts" action={<ViewAll onClick={() => setTab("quizzes")} />} />
            <table className="mt-3 w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink/70"><th className="pb-2 font-medium">Student</th><th className="pb-2 font-medium">Quiz</th><th className="pb-2 font-medium">Score</th><th className="pb-2 font-medium">Date</th></tr>
              </thead>
              <tbody>
                {sampleQuizAttempts.map((q) => (
                  <tr key={q.student} className="border-t border-line">
                    <td className="py-2"><span className="flex items-center gap-2"><Avatar name={q.student} size={24} /><span className="truncate">{q.student}</span></span></td>
                    <td className="py-2 text-ink/80">{q.quiz}</td>
                    <td className="py-2">
                      <span className={cx("rounded-md px-1.5 py-0.5 font-semibold", q.score >= 85 ? "bg-emerald-50 text-emerald-700" : q.score >= 70 ? "bg-amber-50 text-amber-700" : "bg-brand-soft text-brand")}>{q.score}%</span>
                    </td>
                    <td className="whitespace-nowrap py-2 text-ink/70">{formatDate(q.at).replace(/, \d{4}$/, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <CardHeader title="Quick actions" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <QuickTile primary icon="plus" label="Create course" />
              <QuickTile icon="fileText" label="Create quiz" />
              <QuickTile icon="award" label="Manage certificates" onClick={() => setTab("certificates")} />
              <QuickTile icon="settings" label="Course settings" />
            </div>
          </Card>
        </div>
      </div>
      <Modal
        open={issueOpen}
        title="Issue a course certificate"
        onClose={() => setIssueOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setIssueOpen(false)} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">Cancel</button>
            <button
              type="button"
              disabled={!selectedAttempt}
              onClick={() => {
                if (selectedAttempt) sendCertificatePreview(selectedAttempt);
                setIssueOpen(false);
              }}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >Send certificate</button>
          </>
        }
      >
        <p className="mb-4 text-sm leading-6 text-muted">Choose a learner who has passed an assessment. This preview updates the local screen only; real issuance and email/in-app delivery require the certificates API.</p>
        <label className="block text-sm font-medium text-ink">
          Eligible learner and assessment
          <select
            value={selectedAttemptKey}
            onChange={(e) => setSelectedAttemptKey(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft"
          >
            {eligibleAttempts.map((q) => <option key={attemptKey(q)} value={attemptKey(q)}>{q.student} — {q.quiz} ({q.score}%)</option>)}
          </select>
        </label>
        {selectedAttempt ? <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800"><span className="font-semibold">Eligible for certificate</span><p className="mt-1">Score {selectedAttempt.score}% meets the 70% passing threshold.</p></div> : null}
      </Modal>
      {toast.element}
    </>
  );
}

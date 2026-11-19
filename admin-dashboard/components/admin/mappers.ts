/**
 * Backend (FastAPI) response shapes → view rows used by the screens.
 * Field names follow backend/app/schemas/*.py.
 */
import type {
  AuditRow,
  ChapterRow,
  CourseRow,
  DepartmentRow,
  EventRow,
  ReportRow,
  ResourceRow,
  UserRow,
  VideoRow,
} from "./sample";
import { titleCase } from "./ui";

const shortId = (id: string | null | undefined) => (id ? id.replace(/-/g, "").slice(-4).toUpperCase() : "—");

/* ---------- Reports ---------- */

export type ApiReport = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reporter_id: string | null;
  chapter_id: string | null;
  snapshot: Record<string, unknown>;
  open_reports_on_target?: number;
};

export const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate speech",
  violence: "Violence",
  sexual_content: "Explicit content",
  self_harm: "Sensitive",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  other: "Other",
};

function snapshotTitle(snapshot: Record<string, unknown>, fallback: string) {
  const pick = ["title", "name", "display_name", "body", "summary"]
    .map((k) => snapshot?.[k])
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!pick) return fallback;
  return pick.length > 48 ? `${pick.slice(0, 46)}…` : pick;
}

export function mapReport(r: ApiReport): ReportRow {
  const reason = REASON_LABEL[r.reason] ?? titleCase(r.reason);
  return {
    id: r.id,
    title: snapshotTitle(r.snapshot, `${reason} report`),
    targetType: r.target_type === "user" ? "User profile" : titleCase(r.target_type),
    chapter: r.chapter_id ? `Chapter ${shortId(r.chapter_id)}` : "App-wide",
    chapterId: r.chapter_id,
    reason,
    reporter: r.reporter_id ? `User #${shortId(r.reporter_id)}` : "Anonymous",
    status: r.status === "actioned" ? "Resolved" : r.status === "dismissed" ? "Dismissed" : r.reviewed_at ? "Under review" : "New",
    createdAt: r.created_at,
    details: r.details ?? undefined,
    snippet: typeof r.snapshot?.body === "string" ? (r.snapshot.body as string) : undefined,
    reporterId: r.reporter_id,
  };
}

/* ---------- Users ---------- */

export type ApiUser = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;

  // Platform permissions are independent of CYC membership.
  account_role: "admin" | "moderator" | "user";
  membership_status: "guest" | "member";

  is_active: boolean;
  is_verified: boolean;

  // Official Chapter and Department assignments (only while a member).
  chapter_id: string | null;
  department_id: string | null;

  // A preference does not grant Chapter membership.
  preferred_chapter_id: string | null;

  open_reports: number;
  created_at: string;
  last_login_at: string | null;
};

export function mapUser(u: ApiUser): UserRow {
  const role: UserRow["role"] =
    u.account_role === "admin"
      ? "Admin"
      : u.account_role === "moderator"
        ? "Moderator"
        : "User";

  return {
    id: u.id,
    name: u.display_name?.trim() || u.email.split("@")[0],
    email: u.email,
    avatar: u.avatar_url,
    role,
    apiRole: u.account_role,
    membershipStatus: u.membership_status === "member" ? "Member" : "Guest",
    chapterId: u.chapter_id,
    departmentId: u.department_id,
    preferredChapterId: u.preferred_chapter_id,
    status: !u.is_active ? "Suspended" : !u.is_verified ? "Pending" : "Active",
    emailVerified: u.is_verified,
    joined: u.created_at,
    lastActive: u.last_login_at,
    openReports: u.open_reports,
    live: true,
  };
}

/* ---------- Departments (platform-wide) ---------- */

export type ApiDepartment = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
};

export function mapDepartment(d: ApiDepartment): DepartmentRow {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    members: d.member_count ?? 0,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

/* ---------- Posts and comments ---------- */

export type ApiPost = {
  id: string;
  chapter_id: string;
  author_id: string;
  body: string;
  comment_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

export type ApiComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

/* ---------- Events ---------- */

export type ApiEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  online_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: "scheduled" | "cancelled";
  registered_count: number;
  chapter_id: string | null;
};

export function mapEvent(e: ApiEvent): EventRow {
  const now = Date.now();
  const start = new Date(e.starts_at).getTime();
  const end = new Date(e.ends_at).getTime();
  const tz = e.timezone === "Africa/Lagos" ? "WAT" : e.timezone.split("/").pop()?.replace(/_/g, " ") ?? e.timezone;
  return {
    id: e.id,
    title: e.title,
    tagline: e.description?.split(/[.\n]/)[0] ?? "",
    description: e.description ?? "",
    category: "Event",
    startsAt: e.starts_at,
    timezoneLabel: tz,
    location: e.location || (e.online_url ? "Online" : "—"),
    status: e.status === "cancelled" ? "Cancelled" : end < now ? "Completed" : "Published",
    attendees: e.registered_count,
    chapterId: e.chapter_id,
    shares: 0,
    ongoing: e.status !== "cancelled" && start <= now && end >= now,
  };
}

/* ---------- Meetings / live ---------- */

export type ApiMeeting = {
  id: string;
  kind: "meeting" | "livestream";
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduled_start_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  chapter_id: string | null;
};

function duration(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function mapMeeting(m: ApiMeeting): VideoRow {
  return {
    id: m.id,
    title: m.title,
    subtitle: m.description ?? (m.kind === "livestream" ? "Livestream" : "Meeting"),
    kind: m.status === "ended" && m.kind === "meeting" ? "Video" : "Live",
    host: "—",
    chapter: m.chapter_id ? `Chapter ${shortId(m.chapter_id)}` : "CYC Global",
    chapterId: m.chapter_id,
    status: m.status === "live" ? "Live now" : m.status === "ended" ? "Ended" : m.status === "scheduled" ? "Scheduled" : "Cancelled",
    date: m.started_at ?? m.scheduled_start_at ?? m.created_at,
    views: null,
    duration: duration(m.started_at, m.ended_at),
  };
}

/* ---------- Resources ---------- */

export type ApiResource = {
  id: string;
  kind: string;
  status: "draft" | "published";
  title: string;
  summary: string | null;
  author_name: string | null;
  scripture_reference: string | null;
  published_at: string | null;
  created_at: string;
  chapter_id: string | null;
  category_id: string | null;
};

const KIND_TYPE: Record<string, ResourceRow["type"]> = {
  article: "Article",
  audio: "Sermon",
  video: "Sermon",
  document: "Bible Study",
  link: "Other",
};

export function mapResource(r: ApiResource): ResourceRow {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? r.scripture_reference ?? "",
    type: KIND_TYPE[r.kind] ?? "Other",
    author: r.author_name ?? "—",
    category: titleCase(r.kind),
    status: r.status === "published" ? "Published" : "Draft",
    views: null,
    date: r.published_at ?? r.created_at,
    chapterId: r.chapter_id,
    categoryId: r.category_id,
  };
}

/* ---------- Courses ---------- */

export type ApiCourse = {
  id: string;
  chapter_id: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  level: "beginner" | "intermediate" | "advanced";
  instructor_name: string | null;
  status: "draft" | "published";
  lesson_count: number;
  quiz_count: number;
  student_count: number;
  created_at: string;
};

export type ApiLesson = {
  id: string;
  position: number;
  title: string;
  body: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  module_title?: string | null;
  scripture_reference?: string | null;
  scripture_text?: string | null;
  notes_url?: string | null;
};

export type ApiQuiz = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  pass_mark: number;
  question_count: number;
  questions: { prompt: string; options: string[]; correct_index: number | null; explanation?: string | null }[];
  attempt_count: number;
};

export type ApiCourseDetail = ApiCourse & {
  description: string | null;
  lessons: ApiLesson[];
  quizzes: ApiQuiz[];
};

export type ApiAttempt = {
  id: string;
  quiz_id: string;
  quiz_title: string;
  course_id: string;
  user_id: string;
  user_name: string | null;
  score: number;
  passed: boolean;
  correct_count: number;
  question_count: number;
  created_at: string;
};

export type ApiCertificate = {
  course_id: string;
  course_title: string;
  user_id: string;
  user_name: string | null;
  best_score: number | null;
  completed_at: string;
};

export type ApiCourseOverview = {
  courses: number;
  published: number;
  students: number;
  quizzes: number;
  certificates: number;
  recent_attempts: ApiAttempt[];
};

export function mapCourse(c: ApiCourse): CourseRow {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary ?? "",
    instructor: c.instructor_name ?? "—",
    category: c.category ?? "Uncategorized",
    level: titleCase(c.level) as CourseRow["level"],
    lessons: c.lesson_count,
    students: c.student_count,
    status: c.status === "published" ? "Published" : "Draft",
    quizzes: c.quiz_count,
    chapterId: c.chapter_id,
  };
}

/* ---------- Chapters ---------- */

export type ApiChapter = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  country_code: string;
  timezone: string;
  language_code: string | null;
  member_count: number;
  contact_email: string | null;
  contact_phone?: string | null;
  state?: string | null;
  venue?: string | null;
  address?: string | null;
  meeting_schedule?: string | null;
  meeting_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
  my_role?: string | null;
  created_at: string;
};

export function mapChapter(c: ApiChapter): ChapterRow {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    city: c.city ?? "—",
    country: c.country_code,
    timezone: c.timezone,
    language: c.language_code,
    members: c.member_count,
    contact: c.contact_email ?? "—",
    active: c.is_active,
    createdAt: c.created_at,
    details: {
      contact_phone: c.contact_phone ?? null,
      state: c.state ?? null,
      venue: c.venue ?? null,
      address: c.address ?? null,
      meeting_schedule: c.meeting_schedule ?? null,
      meeting_time: c.meeting_time ?? null,
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
    },
  };
}

export type ApiStaff = {
  id: string;
  chapter_id: string;
  user_id: string;
  role: "coordinator";
  email: string | null;
  display_name: string | null;
  created_at: string;
};

export type ApiChapterMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  department_id: string | null;
  department_name: string | null;
  staff_role: "coordinator" | null;
  is_banned: boolean;
  joined_at: string;
};

export type ApiChapterDashboard = {
  chapter_id: string;
  chapter_name: string;
  is_active: boolean;
  member_count: number;
  coordinator_count: number;
  post_count: number;
  upcoming_event_count: number;
  published_resource_count: number;
  open_report_count: number;
  pending_access_request_count: number;
  ban_count: number;
};

/** Swap "Admin #1A2B" / "User #1A2B" placeholders for real names when known. */
export function withNames<T extends { actorId?: string | null; actor?: string; actorRole?: string; reporterId?: string | null; reporter?: string }>(
  rows: T[],
  dir: Map<string, { name: string; role: string }>,
): T[] {
  if (!dir.size) return rows;
  return rows.map((r) => {
    const actor = r.actorId ? dir.get(r.actorId) : undefined;
    const reporter = r.reporterId ? dir.get(r.reporterId) : undefined;
    if (!actor && !reporter) return r;
    return {
      ...r,
      ...(actor ? { actor: actor.name, actorRole: actor.role } : {}),
      ...(reporter ? { reporter: reporter.name } : {}),
    };
  });
}

/* ---------- Audit ---------- */

export type ApiAudit = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  chapter_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

const VERB: Record<string, AuditRow["action"]> = {
  created: "Created",
  updated: "Updated",
  archived: "Archived",
  restored: "Restored",
  removed: "Deleted",
  deleted: "Deleted",
  banned: "Banned",
  unbanned: "Unbanned",
  suspended: "Suspended",
  reinstated: "Reinstated",
  role_changed: "Updated",
  assigned: "Assigned",
  announcement_sent: "Sent",
};

// Audit nouns as shown in the dashboard.
const nounLabel = (noun: string) => (noun === "chapter_staff" ? "chapter staff" : noun);

export function auditSentence(a: ApiAudit) {
  const [noun, verb = ""] = a.action.split(".");
  const target = `${titleCase(nounLabel(noun))} #${shortId(a.target_id)}`;
  const extra =
    typeof a.data?.reason === "string"
      ? ` — ${a.data.reason}`
      : typeof a.data?.account_role === "string"
        ? ` to ${titleCase(a.data.account_role as string)}`
        : typeof a.data?.role === "string"
          ? ` to ${titleCase(a.data.role as string)}`
          : "";
  return `${titleCase(verb.replace(/_/g, " "))} ${target.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}${extra}`;
}

export function mapAudit(a: ApiAudit): AuditRow {
  const [noun, verb = ""] = a.action.split(".");
  const action = VERB[verb] ?? titleCase(verb || a.action);
  const moduleName = titleCase(noun === "member" || noun === "chapter_staff" ? "chapter" : nounLabel(noun));
  return {
    id: a.id,
    at: a.created_at,
    actor: a.actor_id ? `Admin #${shortId(a.actor_id)}` : "System",
    actorRole: a.actor_id ? "Staff" : "System",
    action,
    module: moduleName,
    details: auditSentence(a),
    ip: "—",
    status: "Success",
    category: noun === "post" || noun === "comment" ? "content" : a.actor_id ? "admin" : "system",
    actorId: a.actor_id,
  };
}

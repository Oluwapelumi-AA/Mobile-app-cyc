/**
 * Backend (FastAPI) response shapes → view rows used by the screens.
 * Field names follow backend/app/schemas/*.py.
 */
import type {
  AuditRow,
  BranchRow,
  CommunityRow,
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
  community_id: string | null;
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
    community: r.community_id ? `Department ${shortId(r.community_id)}` : "App-wide",
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
  account_role: "admin" | "moderator" | "user";
  is_active: boolean;
  is_verified: boolean;
  branch_id: string | null;
  open_reports: number;
  created_at: string;
  last_login_at: string | null;
};

export function mapUser(u: ApiUser): UserRow {
  const role = u.account_role === "user" ? "Member" : u.account_role === "admin" ? "Admin" : "Moderator";
  return {
    id: u.id,
    name: u.display_name?.trim() || u.email.split("@")[0],
    email: u.email,
    avatar: u.avatar_url,
    role,
    apiRole: u.account_role,
    communities: null,
    status: !u.is_active ? "Suspended" : !u.is_verified ? "Pending" : "Active",
    emailVerified: u.is_verified,
    joined: u.created_at,
    lastActive: u.last_login_at,
    openReports: u.open_reports,
    live: true,
  };
}

/* ---------- Communities ---------- */

export type ApiCommunity = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  member_count: number;
  created_at: string;
};

export function mapCommunity(c: ApiCommunity): CommunityRow {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    type: c.visibility === "private" ? "Private group" : "Department",
    category: "Other",
    members: c.member_count,
    posts: null,
    status: "Active",
    createdAt: c.created_at,
  };
}

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
  community_id: string | null;
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
    community: m.community_id ? `Department ${shortId(m.community_id)}` : "CYC Global",
    status: m.status === "live" ? "Live now" : m.status === "ended" ? "Ended" : m.status === "scheduled" ? "Scheduled" : "Draft",
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
  };
}

/* ---------- Branches ---------- */

export type ApiBranch = {
  id: string;
  name: string;
  city: string | null;
  country_code: string;
  timezone: string;
  member_count: number;
  community_count: number;
  contact_email: string | null;
  is_active: boolean;
  created_at: string;
};

export function mapBranch(b: ApiBranch): BranchRow {
  return {
    id: b.id,
    name: b.name,
    city: b.city ?? "—",
    country: b.country_code,
    timezone: b.timezone,
    members: b.member_count,
    communities: b.community_count,
    contact: b.contact_email ?? "—",
    active: b.is_active,
    createdAt: b.created_at,
  };
}

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
  community_id: string | null;
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
};

// Communities are called "departments" in the CYC UI.
const nounLabel = (noun: string) => (noun === "community" ? "department" : noun);

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
  const moduleName = titleCase(noun === "member" ? "department" : nounLabel(noun));
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

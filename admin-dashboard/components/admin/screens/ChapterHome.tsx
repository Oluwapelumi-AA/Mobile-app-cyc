"use client";

import { useEffect, useState } from "react";
import { api, useAdmin, useDirectory } from "../data";
import type { ApiEvent, ApiPost } from "../mappers";
import {
  Card,
  CardHeader,
  LinkRow,
  MiniStat,
  Notice,
  PageHeader,
  QuickTile,
  ViewAll,
  formatDateTime,
  timeAgo,
} from "../ui";

type Dashboard = {
  chapter_name: string;
  is_active: boolean;
  member_count: number;
  coordinator_count: number;
  moderator_count: number;
  post_count: number;
  upcoming_event_count: number;
  published_resource_count: number;
  open_report_count: number;
  pending_access_request_count: number;
  ban_count: number;
};

/** The chapter staff landing page: the chapter's numbers and what needs attention. */
export default function ChapterHome() {
  const { scope, navigate } = useAdmin();
  const directory = useDirectory(true);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const coordinator = scope?.role === "coordinator";

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    api<Dashboard>(`chapters/${scope.id}/dashboard`)
      .then((d) => !cancelled && setDash(d))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the chapter."));
    api<{ items: ApiPost[] }>(`chapters/${scope.id}/posts?limit=5`)
      .then((p) => !cancelled && setPosts(p.items ?? []))
      .catch(() => undefined);
    if (coordinator) {
      api<{ items: ApiEvent[] }>(`events?chapter_id=${scope.id}&limit=50`)
        .then((p) => {
          if (cancelled) return;
          const now = Date.now();
          setEvents(
            (p.items ?? [])
              .filter((e) => e.status === "scheduled" && new Date(e.ends_at).getTime() >= now)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .slice(0, 4),
          );
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [scope, coordinator]);

  if (!scope) return null;
  const n = (v: number | undefined) => (dash ? String(v ?? 0) : "—");
  const author = (id: string) => directory.get(id)?.name ?? "A member";

  return (
    <>
      <PageHeader
        title={scope.name}
        subtitle={coordinator ? "Run your chapter: members, content, events and announcements." : "Keep your chapter safe: review reports and moderate posts."}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {dash && !dash.is_active ? (
        <Notice tone="info">This chapter is archived. Members can&apos;t see it until a platform admin restores it.</Notice>
      ) : null}

      <div className="mt-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat icon="users" value={n(dash?.member_count)} label="Members" />
        <MiniStat icon="message" value={n(dash?.post_count)} label="Posts" />
        <MiniStat icon="calendar" value={n(dash?.upcoming_event_count)} label="Upcoming events" />
        <MiniStat icon="book" value={n(dash?.published_resource_count)} label="Published resources" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Recent posts" action={<ViewAll onClick={() => navigate("posts")} />} />
            <ul className="mt-3 divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id} className="py-3">
                  <p className="line-clamp-2 text-sm text-ink">{p.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {author(p.author_id)} · {timeAgo(p.created_at)} · {p.comment_count} comments
                  </p>
                </li>
              ))}
              {posts.length === 0 ? <li className="py-3 text-sm text-muted">No posts yet.</li> : null}
            </ul>
          </Card>

          {coordinator ? (
            <Card className="p-5">
              <CardHeader title="Upcoming events" action={<ViewAll onClick={() => navigate("events")} />} />
              <ul className="mt-3 divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{e.title}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(e.starts_at)}
                        {e.location ? ` · ${e.location}` : e.online_url ? " · Online" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{e.registered_count} registered</span>
                  </li>
                ))}
                {events.length === 0 ? <li className="py-3 text-sm text-muted">Nothing scheduled.</li> : null}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title="Needs attention" />
            <div className="mt-4 space-y-2.5">
              <LinkRow
                icon="flag"
                title="Open reports"
                subtitle={dash ? `${dash.open_report_count} waiting for review` : "Loading…"}
                onClick={() => navigate("reports")}
              />
              {coordinator ? (
                <LinkRow
                  icon="userPlus"
                  title="Access requests"
                  subtitle={dash ? `${dash.pending_access_request_count} guests asking to join` : "Loading…"}
                  onClick={() => navigate("requests")}
                />
              ) : null}
              <LinkRow
                icon="users"
                title="Banned members"
                subtitle={dash ? `${dash.ban_count} currently banned` : "Loading…"}
                onClick={() => navigate("members")}
              />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Chapter team" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="star" value={n(dash?.coordinator_count)} label="Coordinators" />
              <MiniStat icon="shield" value={n(dash?.moderator_count)} label="Moderators" />
            </div>
          </Card>

          {coordinator ? (
            <Card className="p-5">
              <CardHeader title="Quick actions" />
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <QuickTile primary icon="megaphone" label="Send announcement" onClick={() => navigate("announcements")} />
                <QuickTile icon="calendar" label="Create event" onClick={() => navigate("events")} />
                <QuickTile icon="broadcast" label="Go live" onClick={() => navigate("live")} />
                <QuickTile icon="book" label="Add resource" onClick={() => navigate("resources")} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

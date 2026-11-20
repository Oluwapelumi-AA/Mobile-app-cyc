import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { kindIcon } from "@/components/cards";
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  ErrorView,
  Icon,
  IconButton,
  IconName,
  IconTile,
  Loading,
  Row,
  Screen,
  SearchBox,
  T,
  TextButton,
} from "@/components/ui";
import { api, apiAll, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dayDateTime, duration, plural, shortDate } from "@/lib/format";
import { INTEREST_GROUPS } from "@/lib/groups";
import { local } from "@/lib/storage";
import { Tint, useTheme } from "@/lib/theme";
import type { Course, Department, Page, Resource, SearchOverview } from "@/lib/types";

type Filter = "all" | "sermons" | "courses" | "chapters" | "departments" | "groups" | "events" | "news" | "resources" | "people";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sermons", label: "Sermons" },
  { key: "courses", label: "Courses" },
  { key: "chapters", label: "Chapters" },
  { key: "departments", label: "Departments" },
  { key: "groups", label: "Groups" },
  { key: "events", label: "Events" },
  { key: "news", label: "News" },
  { key: "resources", label: "Resources" },
  { key: "people", label: "People" },
];

const BROWSE: { key: Filter; label: string; icon: IconName; tint: Tint }[] = [
  { key: "sermons", label: "Sermons", icon: "headphones", tint: "pink" },
  { key: "courses", label: "Courses", icon: "book", tint: "green" },
  { key: "chapters", label: "Chapters", icon: "church", tint: "yellow" },
  { key: "departments", label: "Departments", icon: "users", tint: "pink" },
  { key: "groups", label: "Interest groups", icon: "heart", tint: "yellow" },
  { key: "people", label: "People", icon: "user", tint: "green" },
  { key: "events", label: "Events", icon: "calendar", tint: "yellow" },
  { key: "news", label: "News", icon: "megaphone", tint: "pink" },
  { key: "resources", label: "Resources", icon: "file-text", tint: "green" },
];

const RECENT_KEY = "cyc.recentSearches";

type Hit = { id: string; title: string; sub: string; icon: IconName; tint: Tint | "red"; href: string; badge?: string };
type Results = Record<Exclude<Filter, "all">, Hit[]>;

/** Title with the search term in bold red. */
function Highlight({ text, term }: { text: string; term: string }) {
  const t = useTheme();
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <T variant="title" numberOfLines={1}>{text}</T>;
  return (
    <T variant="title" numberOfLines={1}>
      {text.slice(0, i)}
      <T variant="title" color={t.primary}>
        {text.slice(i, i + term.length)}
      </T>
      {text.slice(i + term.length)}
    </T>
  );
}

function HitRow({ hit, term, onOpen }: { hit: Hit; term: string; onOpen: (h: Hit) => void }) {
  const t = useTheme();
  return (
    <Card onPress={() => onOpen(hit)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <IconTile icon={hit.icon} tint={hit.tint} size={42} />
      <View style={{ flex: 1 }}>
        <Highlight text={hit.title} term={term} />
        <T variant="caption" muted numberOfLines={1}>
          {hit.sub}
        </T>
      </View>
      {hit.badge ? <Badge label={hit.badge} icon="check" /> : <Icon name="chevron-right" size={17} color={t.textMuted} />}
    </Card>
  );
}

export default function Search() {
  const t = useTheme();
  const { membership } = useAuth();
  const params = useLocalSearchParams<{ type?: Filter }>();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>(params.type ?? "all");
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const lists = useRef<{ courses: Course[]; departments: Department[] } | null>(null);
  const term = text.trim();

  useEffect(() => {
    local.getJSON<string[]>(RECENT_KEY, []).then(setRecent);
  }, []);

  const remember = (s: string) => {
    const v = s.trim();
    if (v.length < 2) return;
    const next = [v, ...recent.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 8);
    setRecent(next);
    void local.setJSON(RECENT_KEY, next);
  };

  useEffect(() => {
    if (term.length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (!lists.current) {
          const [courses, departments] = await Promise.all([
            apiAll<Course>("/courses").catch(() => [] as Course[]),
            api<Department[]>("/departments").catch(() => []),
          ]);
          lists.current = { courses, departments };
        }
        const [overview, resources] = await Promise.all([
          api<SearchOverview>("/search", { query: { q: term, limit: 10 } }),
          api<Page<Resource>>("/resources", { query: { q: term, limit: 30 } }),
        ]);
        if (!alive) return;
        const low = term.toLowerCase();
        const media = resources.items.filter((r) => r.kind === "audio" || r.kind === "video");
        const docs = resources.items.filter((r) => r.kind !== "audio" && r.kind !== "video");
        setResults({
          sermons: media.map((r) => ({
            id: r.id,
            title: r.title,
            sub: [r.author_name, r.kind === "video" ? "Video" : "Audio", duration(r.duration_seconds)].filter(Boolean).join(" · "),
            icon: kindIcon(r.kind),
            tint: "red",
            href: `/sermon/${r.id}`,
          })),
          resources: docs.map((r) => ({ id: r.id, title: r.title, sub: [r.kind, r.author_name].filter(Boolean).join(" · "), icon: kindIcon(r.kind), tint: "green", href: `/resource/${r.id}` })),
          courses: lists.current.courses
            .filter((c) => `${c.title} ${c.summary ?? ""} ${c.category ?? ""}`.toLowerCase().includes(low))
            .map((c) => ({ id: c.id, title: c.title, sub: `Course · ${c.lesson_count} lessons`, icon: "book", tint: "green", href: `/course/${c.id}` })),
          departments: lists.current.departments
            .filter((d) => `${d.name} ${d.description ?? ""}`.toLowerCase().includes(low))
            .map((d) => ({
              id: d.id,
              title: d.name,
              sub: `Department · ${plural(d.member_count, "member")}`,
              icon: "users",
              tint: "yellow",
              href: `/department/${d.id}`,
              badge: d.id === membership?.department_id ? "Member" : undefined,
            })),
          groups: INTEREST_GROUPS.filter((g) => `${g.name} ${g.description}`.toLowerCase().includes(low)).map((g) => ({
            id: g.id,
            title: g.name,
            sub: `Interest group · ${g.description}`,
            icon: g.icon,
            tint: g.tint,
            href: `/group/${g.id}`,
          })),
          chapters: overview.chapters.map((h) => ({ id: h.id, title: h.title, sub: h.snippet ?? "Chapter", icon: "church", tint: "yellow", href: `/chapter/${h.id}`, badge: h.id === membership?.chapter_id ? "Member" : undefined })),
          events: overview.events.map((h) => ({ id: h.id, title: h.title, sub: h.starts_at ? dayDateTime(h.starts_at) : h.snippet ?? "Event", icon: "calendar", tint: "green", href: `/event/${h.id}` })),
          news: overview.posts.map((h) => ({ id: h.id, title: h.title, sub: h.snippet ?? shortDate(h.created_at), icon: "megaphone", tint: "pink", href: `/post/${h.id}` })),
          people: overview.people.map((h) => ({ id: h.id, title: h.title, sub: h.snippet ?? "Member", icon: "user", tint: "pink", href: `/person/${h.id}` })),
        });
        setError("");
      } catch (err) {
        if (alive) setError(errorText(err));
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, membership?.chapter_id, membership?.department_id]);

  const sections = useMemo(() => {
    if (!results) return [];
    const order: Exclude<Filter, "all">[] = ["departments", "groups", "chapters", "events", "sermons", "courses", "news", "resources", "people"];
    return order
      .filter((k) => filter === "all" || filter === k)
      .map((k) => ({ key: k, label: FILTERS.find((f) => f.key === k)!.label, hits: results[k] }))
      .filter((s) => s.hits.length);
  }, [results, filter]);
  const total = sections.reduce((n, s) => n + s.hits.length, 0);

  const open = (h: Hit) => {
    remember(term);
    router.push(h.href);
  };

  const suggestions = [...recent.slice(0, 3), ...(membership?.chapter_name ? [membership.chapter_name] : []), "Bible study", "Prayer"].filter(
    (v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i && v.toLowerCase() !== term.toLowerCase(),
  );

  return (
    <Screen edges={["top", "bottom"]}>
      <Row gap={6} style={{ paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ marginLeft: -8 }}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        </View>
        <SearchBox value={text} onChangeText={(v) => (setText(v), setShowAll(false))} placeholder="Search sermons, events, groups…" autoFocus onSubmit={() => remember(text)} />
      </Row>
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>

      {term.length < 2 ? (
        <>
          {recent.length ? (
            <>
              <Row style={{ justifyContent: "space-between", marginTop: 22, marginBottom: 6 }}>
                <T variant="h3">Recent</T>
                <TextButton label="Clear" onPress={() => (setRecent([]), local.remove(RECENT_KEY))} />
              </Row>
              {recent.map((r) => (
                <Row key={r} gap={12} style={{ paddingVertical: 10 }}>
                  <Icon name="clock" size={17} color={t.textMuted} />
                  <Pressable style={{ flex: 1 }} onPress={() => setText(r)}>
                    <T variant="body">{r}</T>
                  </Pressable>
                  <IconButton
                    icon="x"
                    label={`Remove ${r}`}
                    size={30}
                    color={t.textMuted}
                    onPress={() => {
                      const next = recent.filter((x) => x !== r);
                      setRecent(next);
                      void local.setJSON(RECENT_KEY, next);
                    }}
                  />
                </Row>
              ))}
            </>
          ) : null}
          <T variant="h3" style={{ marginTop: 22, marginBottom: 12 }}>
            Browse by type
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {BROWSE.map((b) => (
              <Card
                key={b.key}
                onPress={() =>
                  b.key === "sermons" ? router.push("/learn/sermons")
                  : b.key === "courses" ? router.push("/learn/courses")
                  : b.key === "departments" ? router.push("/departments")
                  : b.key === "events" ? router.push("/events")
                  : b.key === "chapters" ? router.push(membership?.chapter_id ? `/chapter/${membership.chapter_id}` : "/find-chapter")
                  : b.key === "news" ? router.push("/community")
                  : b.key === "resources" ? router.push("/learn")
                  : setFilter(b.key)
                }
                style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10 }}
              >
                <IconTile icon={b.icon} tint={b.tint} size={34} rounded={17} />
                <T variant="small" weight="medium">
                  {b.label}
                </T>
              </Card>
            ))}
          </View>
        </>
      ) : loading && !results ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} />
      ) : total ? (
        <>
          <T variant="small" muted style={{ marginTop: 14 }}>
            {total} {total === 1 ? "result" : "results"} for “{term}”
          </T>
          {(showAll ? sections : sections.slice(0, 4)).map((s) => (
            <View key={s.key}>
              <T variant="overline" muted style={{ marginTop: 18, marginBottom: 8 }}>
                {s.label.toUpperCase()} · {s.hits.length}
              </T>
              <View style={{ gap: 8 }}>
                {(filter === "all" && !showAll ? s.hits.slice(0, 3) : s.hits).map((h) => (
                  <HitRow key={h.id} hit={h} term={term} onOpen={open} />
                ))}
              </View>
            </View>
          ))}
          {filter === "all" && !showAll && (sections.length > 4 || sections.some((s) => s.hits.length > 3)) ? (
            <Button label="See all results" variant="outline" style={{ marginTop: 18 }} onPress={() => setShowAll(true)} />
          ) : null}
        </>
      ) : (
        <>
          <View style={{ alignItems: "center", paddingTop: 34, gap: 10 }}>
            <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: t.tints.yellow.bg, alignItems: "center", justifyContent: "center" }}>
              <Icon name="search" size={36} />
              <View style={{ position: "absolute", top: 2, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: t.primary }} />
            </View>
            <T variant="h2" center>
              No results for “{term}”
            </T>
            <T variant="small" muted center style={{ maxWidth: 300 }}>
              Check the spelling, or try a broader word like a speaker, topic or chapter name.
            </T>
            <Button label="Clear search" variant="soft" small full={false} onPress={() => setText("")} style={{ alignSelf: "center" }} />
          </View>
          <T variant="h3" style={{ marginTop: 28, marginBottom: 10 }}>
            Try one of these
          </T>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <Chip key={s} label={s} onPress={() => setText(s)} />
            ))}
          </Row>
          <Card onPress={() => router.push("/find-chapter")} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
            <IconTile icon="map-pin" tint="green" size={40} rounded={20} />
            <View style={{ flex: 1 }}>
              <T variant="title">Looking for a chapter?</T>
              <T variant="caption" muted>
                Search by name or city instead.
              </T>
            </View>
            <Icon name="chevron-right" size={17} color={t.textMuted} />
          </Card>
        </>
      )}
    </Screen>
  );
}

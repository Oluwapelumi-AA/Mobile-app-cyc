import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { notify, openResource, SermonRow, Tile, toggleBookmark } from "@/components/cards";
import { Alert, Button, Card, ErrorView, Header, Icon, IconButton, ProgressBar, Row, Screen, SectionHeader, Skeleton, T } from "@/components/ui";
import { api, ApiError, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Download, listDownloads } from "@/lib/downloads";
import { plural } from "@/lib/format";
import { radius, useTheme } from "@/lib/theme";
import type { Course, CourseDetail, Page, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type LearnData = { offline: boolean; sermons: Resource[]; courses: Course[]; current: CourseDetail | null; downloads: Download[] };

/** Learn hub (Figma: Learn – Light). Shows what's saved when offline. */
export default function Learn() {
  const t = useTheme();
  const { isGuest } = useAuth();
  const gate = useAccountGate();
  const q = useApi<LearnData>(async () => {
    try {
      const [sermons, courses] = await Promise.all([
        api<Page<Resource>>("/resources", { query: { limit: 20 } }),
        api<Page<Course>>("/courses", { query: { limit: 10 } }),
      ]);
      const current = courses.items.find((c) => c.enrolled && !c.completed_at);
      const detail = current ? await api<CourseDetail>(`/courses/${current.id}`).catch(() => null) : null;
      return { offline: false, sermons: sermons.items, courses: courses.items, current: detail, downloads: [] as Download[] };
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        return { offline: true, sermons: [], courses: [], current: null, downloads: await listDownloads() };
      }
      throw err;
    }
  });

  const d = q.data;
  const latest = (d?.sermons ?? []).filter((r) => r.kind === "audio" || r.kind === "video").slice(0, 3);
  const cur = d?.current;
  const done = cur?.lessons.filter((l) => l.completed).length ?? 0;

  const bookmark = async (r: Resource) => {
    if (!gate({ title: "Create an account to save sermons", text: "Saved sermons are kept in your account, so they're there on any phone." })) return;
    try {
      const u = await toggleBookmark(r);
      q.setData((x) => ({ ...x!, sermons: x!.sermons.map((s) => (s.id === r.id ? u : s)) }));
    } catch (err) {
      notify("Couldn't save", errorText(err));
    }
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Learn" subtitle="Sermons, courses and resources in one place." right={<IconButton icon="search" label="Search" tonal onPress={() => router.push("/search")} />} />

      {d?.offline ? (
        <>
          <Card bg={t.c.surfaceContainerHigh} bordered={false} style={{ gap: 10 }}>
            <Row gap={12}>
              <Icon name="wifi-off" size={22} />
              <View style={{ flex: 1 }}>
                <T variant="titleMedium">You&apos;re offline</T>
                <T variant="bodySmall" muted>
                  Showing what&apos;s saved on this phone.
                </T>
              </View>
              <Button label="Retry" small full={false} variant="outline" onPress={q.reload} />
            </Row>
          </Card>
          <SectionHeader title="Available offline" />
          <View style={{ gap: 10 }}>
            {d.downloads.map((x) => (
              <Card key={x.resource_id} onPress={() => router.push(`/sermon/${x.resource_id}`)} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12 }}>
                <Icon name={x.kind === "video" ? "video" : "headphones"} />
                <View style={{ flex: 1 }}>
                  <T variant="titleMedium" numberOfLines={1}>
                    {x.title}
                  </T>
                  <T variant="bodySmall" muted>
                    Sermon · {x.kind === "video" ? "Video" : "Audio"}
                  </T>
                </View>
                <Icon name="check-circle" size={18} color={t.c.tertiary} />
              </Card>
            ))}
            {!d.downloads.length ? <Alert text="Nothing saved yet. When you're online, tap Download on a sermon to keep it on this phone." /> : null}
          </View>
        </>
      ) : null}

      {q.loading ? (
        <View style={{ gap: 12 }}>
          <Skeleton h={116} r={28} />
          <Row gap={12}>
            <Skeleton h={140} r={20} style={{ flex: 1 }} />
            <Skeleton h={140} r={20} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}
      {q.error && !d ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load Learn" /> : null}

      {cur ? (
        <Pressable onPress={() => router.push(`/course/${cur.id}`)} accessibilityRole="button">
          <View style={{ backgroundColor: t.learnCard, borderRadius: radius.xxl, padding: 20, gap: 8 }}>
            <T variant="labelMedium" color={t.learnCardFg}>
              CONTINUE · LESSON {Math.min(done + 1, cur.lesson_count)} OF {cur.lesson_count}
            </T>
            <Row gap={14}>
              <View style={{ flex: 1, gap: 8 }}>
                <T variant="titleLarge" color={t.learnCardFg} numberOfLines={1} style={{ fontFamily: "PlusJakartaSans_700Bold" }}>
                  {cur.title}
                </T>
                <ProgressBar value={(done / Math.max(1, cur.lesson_count)) * 100} color={t.scheme === "dark" ? t.c.secondary : "#1D1B19"} track="rgba(0,0,0,0.12)" />
                <T variant="bodySmall" color={t.learnCardFg}>
                  {cur.lessons.find((l) => !l.completed)?.duration_minutes ? `About ${cur.lessons.find((l) => !l.completed)!.duration_minutes} min left` : `${done} of ${cur.lesson_count} done`}
                </T>
              </View>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.scheme === "dark" ? t.c.secondary : "#7B5800", alignItems: "center", justifyContent: "center" }}>
                <Icon name="play" size={22} color={t.scheme === "dark" ? t.c.onSecondary : "#FFFFFF"} />
              </View>
            </Row>
          </View>
        </Pressable>
      ) : null}

      {!d?.offline ? (
        <>
          <SectionHeader title="Browse" />
          <View style={{ gap: 12 }}>
            <Row gap={12} style={{ alignItems: "stretch" }}>
              <Tile solid tint="pink" icon="headphones" title="Sermons" text="Listen or watch, by speaker or topic." onPress={() => router.push("/learn/sermons")} />
              <Tile solid tint="green" icon="book" title="Courses" text="Learn step by step, at your own pace." onPress={() => router.push("/learn/courses")} />
            </Row>
            <Row gap={12} style={{ alignItems: "stretch" }}>
              <Tile solid tint="gray" icon="file-text" title="Resources" text="Notes, guides and downloads." onPress={() => router.push("/resources")} />
              <Tile
                solid
                tint="gray"
                icon="certificate"
                title="Certificates"
                text="Earned when you finish a course."
                onPress={() => gate({ title: "Create an account to earn certificates", text: "Finish a course to earn a certificate you can share and anyone can verify." }) && router.push("/certificates")}
              />
            </Row>
          </View>
        </>
      ) : null}

      {latest.length ? (
        <>
          <SectionHeader title="Latest sermons" action="See all" onAction={() => router.push("/learn/sermons")} />
          <View style={{ gap: 10 }}>
            {latest.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={bookmark} />
            ))}
          </View>
        </>
      ) : null}

      {d?.courses.length ? (
        <>
          <SectionHeader title={isGuest ? "Courses" : "Courses for you"} action="See all" onAction={() => router.push("/learn/courses")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginRight: -20 }}>
            {d.courses.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/course/${c.id}`)}
                style={{ width: 250, borderRadius: radius.xl, borderWidth: 1, borderColor: t.c.outlineVariant, overflow: "hidden", backgroundColor: t.c.surfaceContainerLow }}
              >
                <View style={{ height: 96, backgroundColor: i % 2 ? t.c.secondaryContainer : t.c.tertiaryContainer, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="book" size={32} color={i % 2 ? t.c.onSecondaryContainer : t.c.onTertiaryContainer} />
                </View>
                <View style={{ padding: 16, gap: 6 }}>
                  <T variant="labelMedium" muted>
                    COURSE · {plural(c.lesson_count, "LESSON")}
                  </T>
                  <T variant="titleMedium" numberOfLines={1}>
                    {c.title}
                  </T>
                  <T variant="bodySmall" muted>
                    {c.completed_at ? "Completed" : c.enrolled ? "In progress" : "Not started"}
                  </T>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {(d?.sermons ?? []).filter((r) => r.kind !== "audio" && r.kind !== "video").length ? (
        <>
          <SectionHeader title="Resources" action="See all" onAction={() => router.push("/resources")} />
          <View style={{ gap: 10 }}>
            {d!.sermons
              .filter((r) => r.kind !== "audio" && r.kind !== "video")
              .slice(0, 3)
              .map((r) => (
                <Card key={r.id} onPress={() => openResource(r)} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12 }}>
                  <Icon name={r.kind === "document" ? "file-pdf" : r.kind === "link" ? "link" : "file-text"} />
                  <View style={{ flex: 1 }}>
                    <T variant="titleMedium" numberOfLines={1}>
                      {r.title}
                    </T>
                    <T variant="bodySmall" muted>
                      {[r.kind[0].toUpperCase() + r.kind.slice(1), r.author_name].filter(Boolean).join(" · ")}
                    </T>
                  </View>
                  <Icon name="chevron-right" size={18} color={t.textMuted} />
                </Card>
              ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

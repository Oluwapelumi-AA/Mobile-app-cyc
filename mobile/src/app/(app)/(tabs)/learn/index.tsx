import { router } from "expo-router";
import { View } from "react-native";

import { notify, SermonRow, toggleBookmark } from "@/components/cards";
import { CourseRow } from "@/components/CourseRow";
import { Blob, Card, ErrorView, Header, Icon, IconButton, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { brand, useTheme } from "@/lib/theme";
import type { Course, Page, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Learn hub: sermons, courses and other resources. */
export default function Learn() {
  const t = useTheme();
  const q = useApi(async () => {
    const [resources, inProgress, saved, courses] = await Promise.all([
      api<Page<Resource>>("/resources", { query: { limit: 20 } }),
      api<Page<Resource>>("/resources/in-progress", { query: { limit: 5 } }).catch(() => ({ items: [] as Resource[], next_cursor: null })),
      api<Page<Resource>>("/resources/bookmarks", { query: { limit: 5 } }).catch(() => ({ items: [] as Resource[], next_cursor: null })),
      api<Page<Course>>("/courses", { query: { limit: 5 } }).catch(() => ({ items: [] as Course[], next_cursor: null })),
    ]);
    return { resources: resources.items, inProgress: inProgress.items, saved: saved.items, courses: courses.items };
  });

  const reading = (q.data?.resources ?? []).filter((r) => !["audio", "video"].includes(r.kind)).slice(0, 5);
  const fresh = (q.data?.resources ?? []).filter((r) => ["audio", "video"].includes(r.kind)).slice(0, 3);

  const bookmark = async (r: Resource) => {
    try {
      const u = await toggleBookmark(r);
      const swap = (list: Resource[]) => list.map((x) => (x.id === r.id ? u : x));
      q.setData((d) => ({ ...d!, resources: swap(d!.resources), inProgress: swap(d!.inProgress), saved: u.bookmarked ? [u, ...d!.saved] : d!.saved.filter((x) => x.id !== r.id) }));
    } catch (err) {
      notify("Couldn't save", errorText(err));
    }
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Learn" subtitle="Sermons, courses and resources to grow your faith." right={<IconButton icon="search" label="Search" bordered onPress={() => router.push("/search")} />} />

      <Row gap={12} style={{ alignItems: "stretch" }}>
        <Card bg={brand.red} bordered={false} style={{ flex: 1, minHeight: 150, justifyContent: "space-between" }} onPress={() => router.push("/learn/sermons")}>
          <Blob size={110} color={brand.gold} right={-40} bottom={-40} />
          <Icon name="headphones" size={26} color="#FFFFFF" />
          <View>
            <T variant="h2" color="#FFFFFF">
              Sermons
            </T>
            <T variant="caption" color="rgba(255,255,255,0.85)">
              Listen and watch
            </T>
          </View>
        </Card>
        <Card bg={t.tints.green.bg} bordered={false} style={{ flex: 1, minHeight: 150, justifyContent: "space-between" }} onPress={() => router.push("/learn/courses")}>
          <Blob size={110} color={t.tints.yellow.bg} right={-40} bottom={-40} />
          <Icon name="book" size={26} color={t.tints.green.fg} />
          <View>
            <T variant="h2" color={t.tints.green.fg}>
              Courses
            </T>
            <T variant="caption" color={t.tints.green.fg}>
              Lessons and quizzes
            </T>
          </View>
        </Card>
      </Row>

      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {q.data?.inProgress.length ? (
        <>
          <SectionHeader title="Pick up where you left off" />
          <View style={{ gap: 10 }}>
            {q.data.inProgress.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={bookmark} />
            ))}
          </View>
        </>
      ) : null}

      {fresh.length ? (
        <>
          <SectionHeader title="New sermons" action="See all" onAction={() => router.push("/learn/sermons")} />
          <View style={{ gap: 10 }}>
            {fresh.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={bookmark} />
            ))}
          </View>
        </>
      ) : null}

      {q.data?.courses.length ? (
        <>
          <SectionHeader title="Courses" action="See all" onAction={() => router.push("/learn/courses")} />
          <View style={{ gap: 10 }}>
            {q.data.courses.slice(0, 3).map((c, i) => (
              <CourseRow key={c.id} c={c} index={i} />
            ))}
          </View>
        </>
      ) : null}

      {reading.length ? (
        <>
          <SectionHeader title="Resources" />
          <View style={{ gap: 10 }}>
            {reading.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={bookmark} />
            ))}
          </View>
        </>
      ) : null}

      {q.data?.saved.length ? (
        <>
          <SectionHeader title="Saved" action="See all" onAction={() => router.push("/saved")} />
          <View style={{ gap: 10 }}>
            {q.data.saved.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={bookmark} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

import { router } from "expo-router";
import { View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { Tile } from "@/components/cards";
import { AnnouncementCard } from "@/components/PostCard";
import { Badge, Blob, Button, ErrorView, Header, HeroTag, Icon, IconButton, IconTile, ListGroup, Row, Screen, SectionHeader, Skeleton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInterestGroups } from "@/lib/groups";
import { brand, radius, useTheme } from "@/lib/theme";
import type { Chapter, Page, Post } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Community (Figma: Community – Light). */
export default function Community() {
  const t = useTheme();
  const { membership, isGuest } = useAuth();
  const gate = useAccountGate();
  const groups = useInterestGroups();
  const chapterId = membership?.chapter_id;
  const q = useApi(async () => {
    if (!chapterId) return null;
    const [chapter, posts] = await Promise.all([
      api<Chapter>(`/chapters/${chapterId}`),
      api<Page<Post>>(`/chapters/${chapterId}/posts`, { query: { limit: 5 } }).catch(() => ({ items: [] as Post[], next_cursor: null })),
    ]);
    return { chapter, posts: posts.items };
  }, [chapterId]);

  const c = q.data?.chapter;
  const meets = c ? [c.meeting_schedule, c.meeting_time].filter(Boolean).join(" · ") : "";

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Community" subtitle="Your chapter, departments and groups." right={<IconButton icon="search" label="Search" tonal onPress={() => router.push("/search")} />} />

      {q.loading && chapterId ? <Skeleton h={260} r={28} /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load your chapter" /> : null}

      {c ? (
        <View style={{ backgroundColor: brand.forest, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10 }}>
          <Blob size={190} color={t.scheme === "dark" ? "#5D4200" : "#FFDEA4"} right={-60} top={-90} />
          <Blob size={26} color="#FFDAD4" right={130} top={96} />
          <HeroTag label="MY CHAPTER" />
          <T variant="displaySmall" color="#FFFFFF" style={{ maxWidth: "70%" }}>
            {c.name}
          </T>
          {c.venue || c.city ? (
            <Row gap={8}>
              <Icon name="map-pin" size={16} color="#FFFFFF" />
              <T variant="bodyMedium" color="#FFFFFF">
                {[c.venue, c.city].filter(Boolean).join(", ")}
              </T>
            </Row>
          ) : null}
          {meets ? (
            <Row gap={8}>
              <Icon name="clock" size={16} color="#FFFFFF" />
              <T variant="bodyMedium" color="#FFFFFF">
                {meets}
              </T>
            </Row>
          ) : null}
          <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
            <T variant="labelLarge" color="#FFFFFF">
              {c.member_count} {c.member_count === 1 ? "member" : "members"}
            </T>
            <Button label="View chapter" variant="light" full={false} onPress={() => router.push(`/chapter/${c.id}`)} />
          </Row>
        </View>
      ) : !chapterId ? (
        <View style={{ backgroundColor: brand.forest, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10 }}>
          <Blob size={170} color={t.scheme === "dark" ? "#5D4200" : "#FFDEA4"} right={-60} top={-70} />
          <HeroTag label={isGuest ? "CYC CHAPTERS" : "FIRST STEP"} />
          <T variant="headlineSmall" color="#FFFFFF" style={{ paddingRight: 60 }}>
            Find your chapter
          </T>
          <T variant="bodyMedium" color="#FFFFFF">
            Chapters are where CYC meets in your city. Find one near you.
          </T>
          <Button label="Find a chapter" icon="map-pin" variant="light" full={false} onPress={() => router.push("/find-chapter")} />
        </View>
      ) : null}

      <SectionHeader title="Explore" />
      <View style={{ gap: 12 }}>
        <Row gap={12} style={{ alignItems: "stretch" }}>
          <Tile tint="pink" icon="map" title="Find a chapter" text="Search by country, state or city." onPress={() => router.push("/find-chapter")} />
          <Tile tint="yellow" icon="users" title="Departments" text="Serve with a team in your chapter." onPress={() => router.push("/departments")} />
        </Row>
        <Row gap={12} style={{ alignItems: "stretch" }}>
          <Tile tint="green" icon="users" title="Interest groups" text="Meet people who share your interests." onPress={() => router.push("/interest-groups")} />
          <Tile
            tint="pink"
            icon="megaphone"
            title="Announcements"
            text="News from CYC and your chapter."
            onPress={() => (gate({ title: "Create an account to see announcements", text: "Join a chapter to get news from its leaders." }) ? (chapterId ? router.push("/announcements") : router.push("/find-chapter")) : undefined)}
          />
        </Row>
      </View>

      {!isGuest && (membership?.department_name || groups.mine.length) ? (
        <>
          <SectionHeader title="Your groups & departments" action="See all" onAction={() => router.push("/interest-groups")} />
          <ListGroup>
            {groups.mine.map((g) => (
              <Row key={g.id} gap={12} style={{ padding: 16 }}>
                <IconTile icon={g.icon} tint={g.tint} size={44} />
                <View style={{ flex: 1 }}>
                  <T variant="titleMedium">{g.name}</T>
                  <T variant="bodySmall" muted>
                    Interest group
                  </T>
                </View>
                {groups.statuses[g.id] === "member" ? <Badge label="Member" icon="check" /> : <Badge label="Awaiting approval" icon="pending" tint="yellow" />}
              </Row>
            ))}
            {membership?.department_name ? (
              <Row gap={12} style={{ padding: 16 }}>
                <IconTile icon="users" tint="pink" size={44} />
                <View style={{ flex: 1 }}>
                  <T variant="titleMedium">{membership.department_name}</T>
                  <T variant="bodySmall" muted>
                    Department
                  </T>
                </View>
                <Badge label="Member" icon="check" />
              </Row>
            ) : null}
          </ListGroup>
        </>
      ) : null}

      {q.data?.posts.length ? (
        <>
          <SectionHeader title="Announcements" action="See all" onAction={() => router.push("/announcements")} />
          <View style={{ gap: 10 }}>
            {q.data.posts.slice(0, 3).map((p) => (
              <AnnouncementCard key={p.id} post={p} source={c?.name ?? "Your chapter"} onPress={() => router.push(`/post/${p.id}`)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

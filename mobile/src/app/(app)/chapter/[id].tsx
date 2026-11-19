import { router, useLocalSearchParams } from "expo-router";
import { Linking, Pressable, ScrollView, Share, View } from "react-native";

import { EventRow, openMap, tintFor } from "@/components/cards";
import { Avatar, Blob, Card, ErrorView, Icon, IconButton, ListGroup, ListRow, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api } from "@/lib/api";
import { time } from "@/lib/format";
import { brand, useTheme } from "@/lib/theme";
import type { Chapter, Department, EventItem, Page, Staff } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function ChapterScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(async () => {
    const [chapter, leaders, events, departments] = await Promise.all([
      api<Chapter>(`/chapters/${id}`),
      api<Staff[]>(`/chapters/${id}/coordinators`).catch(() => [] as Staff[]),
      api<Page<EventItem>>("/events", { query: { chapter_id: id, limit: 5 } }).catch(() => ({ items: [] as EventItem[], next_cursor: null })),
      api<Department[]>("/departments").catch(() => [] as Department[]),
    ]);
    return { chapter, leaders, events: events.items, departments };
  }, [id]);

  const c = q.data?.chapter;
  const next = q.data?.events.find((e) => e.status === "scheduled");
  const place = c ? [next?.location, c.city].filter(Boolean).join(", ") : "";

  return (
    <Screen padded={false} edges={["bottom"]} bg={t.bg}>
      <View style={{ backgroundColor: brand.forest, paddingHorizontal: 18, paddingBottom: 22, paddingTop: 54, overflow: "hidden" }}>
        <Blob size={230} color="#FFE2A3" right={-90} top={90} />
        <Blob size={22} color="#FFC9C2" right={110} top={96} />
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1C1A17" size={38} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          {c ? <IconButton icon="share-2" label="Share" bg="#FFFFFF" color="#1C1A17" size={38} onPress={() => Share.share({ message: `Join ${c.name} on the CYC app.` })} /> : null}
        </Row>
        {c ? (
          <View style={{ marginTop: 30, gap: 10 }}>
            {c.is_mine ? (
              <View style={{ backgroundColor: "rgba(0,0,0,0.25)", alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <T variant="overline" color="#FFFFFF">
                  YOUR CHAPTER
                </T>
              </View>
            ) : null}
            <T variant="display" color="#FFFFFF" style={{ fontSize: 38, lineHeight: 40, maxWidth: "75%" }}>
              {c.name}
            </T>
            {place ? (
              <Row gap={6}>
                <Icon name="map-pin" size={14} color="#FFFFFF" />
                <T variant="small" color="#FFFFFF">
                  {place}
                </T>
              </Row>
            ) : null}
            <Row gap={10} style={{ marginTop: 4 }}>
              {c.is_mine ? (
                <Row gap={6} style={{ backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Icon name="check" size={14} color={brand.forest} />
                  <T variant="small" weight="semibold" color={brand.forest}>
                    You’re a member
                  </T>
                </Row>
              ) : null}
              <T variant="small" color="#FFFFFF">
                {c.member_count} {c.member_count === 1 ? "member" : "members"}
              </T>
            </Row>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 18 }}>
        {q.loading ? <Loading /> : null}
        {q.error && !c ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

        {c ? (
          <>
            <SectionHeader title="When we meet" />
            <ListGroup>
              <ListRow
                icon="clock"
                label={next ? new Date(next.starts_at).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" }) : "No meeting scheduled"}
                sublabel={next ? `${time(new Date(next.starts_at))} – ${time(new Date(next.ends_at))} · ${next.title}` : "Your leaders will post the next one soon."}
                onPress={next ? () => router.push(`/event/${next.id}`) : undefined}
              />
              <ListRow
                icon="map-pin"
                label={next?.location ?? c.city ?? "Venue to be announced"}
                sublabel={next?.location && c.city ? c.city : undefined}
                onPress={next?.location || c.city ? () => openMap(place) : undefined}
                right={next?.location || c.city ? <T variant="small" weight="semibold" color={t.primary}>Directions</T> : undefined}
              />
            </ListGroup>

            {c.description ? (
              <>
                <SectionHeader title="About" />
                <T variant="body" muted>
                  {c.description}
                </T>
              </>
            ) : null}

            {q.data!.leaders.length ? (
              <>
                <SectionHeader title="Leaders" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {q.data!.leaders.map((l, i) => {
                    const name = l.display_name || l.email.split("@")[0];
                    return (
                      <Card key={l.id} onPress={() => router.push(`/person/${l.user_id}`)} style={{ width: 112, alignItems: "center", gap: 8 }}>
                        <Avatar name={name} tint={tintFor(i + 2)} size={44} />
                        <T variant="small" weight="semibold" center numberOfLines={1}>
                          {name}
                        </T>
                        <T variant="caption" muted>
                          Coordinator
                        </T>
                      </Card>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {q.data!.events.length ? (
              <>
                <SectionHeader title="Upcoming events" action="See all" onAction={() => router.push("/events")} />
                <View style={{ gap: 10 }}>
                  {q.data!.events.slice(0, 3).map((e, i) => (
                    <EventRow key={e.id} event={e} index={i} />
                  ))}
                </View>
              </>
            ) : null}

            {q.data!.departments.length ? (
              <>
                <SectionHeader title="Departments" action="See all" onAction={() => router.push("/groups")} />
                <Row gap={8} style={{ flexWrap: "wrap" }}>
                  {q.data!.departments.slice(0, 8).map((d) => (
                    <Pressable key={d.id} onPress={() => router.push("/groups")}>
                      <Row gap={6} style={{ backgroundColor: t.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Icon name="users" size={13} color={t.textMuted} />
                        <T variant="small">{d.name}</T>
                      </Row>
                    </Pressable>
                  ))}
                </Row>
              </>
            ) : null}

            {c.contact_email ? (
              <>
                <SectionHeader title="Contact" />
                <ListGroup>
                  <ListRow icon="mail" label={c.contact_email} onPress={() => Linking.openURL(`mailto:${c.contact_email}`)} />
                </ListGroup>
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

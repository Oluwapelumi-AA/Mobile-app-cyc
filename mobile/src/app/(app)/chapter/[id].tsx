import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Share, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { EventRow, notify, openMap, tintFor } from "@/components/cards";
import { Avatar, Blob, Button, Card, Dialog, ErrorView, HeroTag, Icon, IconButton, ListGroup, ListRow, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { distanceKm, savedPlace } from "@/lib/location";
import { brand, radius, useTheme } from "@/lib/theme";
import type { Chapter, Department, EventItem, Leader, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Chapter page (Figma: Chapter, and "Chapter profile – Join" for people without one). */
export default function ChapterScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership, reload } = useAuth();
  const gate = useAccountGate();
  const [km, setKm] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [joining, setJoining] = useState(false);
  const q = useApi(async () => {
    const [chapter, leaders, events, departments] = await Promise.all([
      api<Chapter>(`/chapters/${id}`),
      api<Leader[]>(`/chapters/${id}/leaders`).catch(() => [] as Leader[]),
      api<Page<EventItem>>("/events", { query: { chapter_id: id, limit: 5 } }).catch(() => ({ items: [] as EventItem[], next_cursor: null })),
      api<Department[]>("/departments").catch(() => [] as Department[]),
    ]);
    return { chapter, leaders, events: events.items, departments };
  }, [id]);

  const c = q.data?.chapter;
  useEffect(() => {
    if (!c) return;
    savedPlace().then((p) => p && setKm(distanceKm(p, c)));
  }, [c]);

  const canJoin = c && !membership?.chapter_id;
  const next = q.data?.events.find((e) => e.status === "scheduled");
  const place = c ? [c.venue, c.city].filter(Boolean).join(", ") : "";
  const fullAddress = c ? [c.venue, c.address, c.city].filter(Boolean).join(", ") : "";

  const join = async () => {
    if (!c) return;
    setJoining(true);
    try {
      await api("/me/chapter", { method: "PUT", body: { chapter_id: c.id } });
      await reload();
      setConfirm(false);
      q.reload();
    } catch (err) {
      notify("Couldn't join", errorText(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen
      padded={false}
      edges={["bottom"]}
      onRefresh={q.refresh}
      refreshing={q.refreshing}
      footer={
        canJoin ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 6, backgroundColor: t.c.surfaceContainer }}>
            <Button label="Join this chapter" onPress={() => gate({ title: "Create an account to join", text: "Members get news, events and departments from their chapter." }) && setConfirm(true)} />
            <T variant="bodySmall" muted center>
              You can only belong to one chapter. Join the one you attend.
            </T>
          </View>
        ) : null
      }
    >
      <View style={{ backgroundColor: brand.forest, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 56, overflow: "hidden" }}>
        <Blob size={220} color={t.scheme === "dark" ? "#5D4200" : "#FFDEA4"} right={-70} top={120} />
        <Blob size={28} color="#FFDAD4" right={150} top={118} />
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1D1B19" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          {c ? <IconButton icon="share" label="Share" bg="#FFFFFF" color="#1D1B19" onPress={() => Share.share({ message: `${c.name} – CYC chapter${place ? ` at ${place}` : ""}. Join on the CYC app.` })} /> : null}
        </Row>
        {c ? (
          <View style={{ marginTop: 36, gap: 12 }}>
            <HeroTag label={c.is_mine ? "YOUR CHAPTER" : km != null ? `CHAPTER · ${Math.round(km)} KM AWAY` : "CHAPTER"} />
            <T variant="displaySmall" color="#FFFFFF" style={{ maxWidth: "75%" }} accessibilityRole="header">
              {c.name}
            </T>
            {place ? (
              <Row gap={8}>
                <Icon name="map-pin" size={18} color="#FFFFFF" />
                <T variant="bodyMedium" color="#FFFFFF">
                  {place}
                </T>
              </Row>
            ) : null}
            <Row gap={12}>
              {c.is_mine ? (
                <Row gap={6} style={{ backgroundColor: "#FFFFFF", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Icon name="check" size={16} color={brand.forest} />
                  <T variant="labelLarge" color={brand.forest}>
                    You&apos;re a member
                  </T>
                </Row>
              ) : null}
              <T variant="labelLarge" color="#FFFFFF">
                {c.member_count} {c.member_count === 1 ? "member" : "members"}
              </T>
            </Row>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {q.loading ? <Loading /> : null}
        {q.error && !c ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load this chapter" /> : null}

        {c ? (
          <>
            <SectionHeader title="When we meet" />
            <ListGroup>
              <ListRow
                icon="clock"
                iconCircle
                label={c.meeting_schedule ?? (next ? new Date(next.starts_at).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }) : "To be announced")}
                sublabel={c.meeting_time ?? (next ? `Next: ${next.title}` : "Leaders will share the time soon.")}
                chevron={false}
              />
              <ListRow
                icon="map-pin"
                iconCircle
                label={c.venue ?? c.city ?? "Venue to be announced"}
                sublabel={[c.address, c.city].filter(Boolean).join(", ") || undefined}
                onPress={fullAddress ? () => openMap(fullAddress) : undefined}
                right={
                  fullAddress ? (
                    <T variant="labelLarge" color={t.primary} underline>
                      Directions
                    </T>
                  ) : undefined
                }
              />
            </ListGroup>

            {c.description ? (
              <>
                <SectionHeader title="About" />
                <T variant="bodyLarge" muted>
                  {c.description}
                </T>
              </>
            ) : null}

            {q.data!.leaders.length ? (
              <>
                <SectionHeader title="Leaders" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ marginRight: -20 }}>
                  {q.data!.leaders.map((l, i) => (
                    <Card key={l.user_id} onPress={() => gate() && router.push(`/person/${l.user_id}`)} style={{ width: 128, alignItems: "center", gap: 8, paddingVertical: 18 }}>
                      <Avatar name={l.display_name} tint={tintFor(i + 2)} size={56} />
                      <T variant="titleSmall" center numberOfLines={1}>
                        {l.display_name}
                      </T>
                      <T variant="bodySmall" muted center numberOfLines={2}>
                        {l.role}
                      </T>
                    </Card>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {q.data!.events.length ? (
              <>
                <SectionHeader title="Upcoming events" action="See all" onAction={() => router.push("/events")} />
                <View style={{ gap: 10 }}>
                  {q.data!.events.slice(0, 3).map((e, i) => (
                    <EventRow key={e.id} event={e} index={i} chevron />
                  ))}
                </View>
              </>
            ) : null}

            {q.data!.departments.length ? (
              <>
                <SectionHeader title="Departments" action="See all" onAction={() => router.push("/departments")} />
                <Row gap={8} style={{ flexWrap: "wrap" }}>
                  {q.data!.departments.slice(0, 8).map((d) => (
                    <Pressable key={d.id} onPress={() => router.push({ pathname: "/department/[id]", params: { id: d.id } })}>
                      <Row gap={8} style={{ backgroundColor: t.c.surfaceContainerHigh, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10 }}>
                        <Icon name="users" size={16} color={t.textMuted} />
                        <T variant="labelLarge">{d.name}</T>
                      </Row>
                    </Pressable>
                  ))}
                </Row>
              </>
            ) : null}

            {c.contact_email || c.contact_phone ? (
              <>
                <SectionHeader title="Contact" />
                <ListGroup>
                  {c.contact_email ? <ListRow icon="mail" iconCircle label={c.contact_email} onPress={() => Linking.openURL(`mailto:${c.contact_email}`)} /> : null}
                  {c.contact_phone ? <ListRow icon="phone" iconCircle label={c.contact_phone} onPress={() => Linking.openURL(`tel:${c.contact_phone!.replace(/\s/g, "")}`)} /> : null}
                </ListGroup>
              </>
            ) : null}
          </>
        ) : null}
      </View>

      <Dialog
        visible={confirm}
        icon="church"
        title={`Join ${c?.name ?? "this chapter"}?`}
        text="You'll become a member straight away. Members stay in one chapter, so make sure it's the one you attend."
        confirm="Join chapter"
        busy={joining}
        onCancel={() => setConfirm(false)}
        onConfirm={join}
      />
    </Screen>
  );
}

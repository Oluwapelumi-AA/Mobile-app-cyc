import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Share, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { notify, openMap, tintFor, toggleRegistration } from "@/components/cards";
import { Avatar, Blob, Button, Card, DateBadge, ErrorView, Icon, IconButton, IconTile, ListGroup, ListRow, Loading, Row, Screen, SectionHeader, T, Toggle } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { time } from "@/lib/format";
import { addToCalendar, reminderIds, setReminder } from "@/lib/reminders";
import { brand, radius, useTheme } from "@/lib/theme";
import type { Chapter, EventItem, Leader } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Event detail (Figma: Event detail – Light). */
export default function EventDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = useAccountGate();
  const q = useApi(async () => {
    const event = await api<EventItem>(`/events/${id}`);
    const [chapter, leaders] = event.chapter_id
      ? await Promise.all([api<Chapter>(`/chapters/${event.chapter_id}`).catch(() => null), api<Leader[]>(`/chapters/${event.chapter_id}/leaders`).catch(() => [])])
      : [null, []];
    return { event, chapter, leaders };
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(false);
  const e = q.data?.event;

  useEffect(() => {
    reminderIds().then((r) => setRemind(Boolean(r[id])));
  }, [id]);

  const toggle = async () => {
    if (!e || !gate({ title: "Create an account to register", text: "Your place at events is saved to your account, with a reminder before it starts." })) return;
    setBusy(true);
    try {
      const updated = await toggleRegistration(e);
      q.setData((d) => ({ ...d!, event: updated }));
      if (updated.my_registration === "waitlisted") notify("You're on the waitlist", "We'll let you know if a place opens up.");
      if (!updated.my_registration && remind) {
        await setReminder(updated, false).catch(() => undefined);
        setRemind(false);
      }
    } catch (err) {
      notify("Couldn't update", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!e) {
    return (
      <Screen>
        <View style={{ paddingTop: 12 }}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        </View>
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load this event" /> : <Loading />}
      </Screen>
    );
  }

  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const past = end < new Date();
  const cancelled = e.status === "cancelled";
  const going = e.my_registration === "registered";
  const host = q.data?.chapter?.name ?? "CYC national";
  const overline = [e.chapter_id ? "CHAPTER EVENT" : "CYC EVENT", q.data?.chapter?.name?.toUpperCase()].filter(Boolean).join(" · ");
  const hero = t.scheme === "dark" ? t.c.secondaryContainer : "#FFDEA4";
  const heroFg = t.c.onSecondaryContainer;

  return (
    <Screen
      padded={false}
      edges={["bottom"]}
      onRefresh={q.refresh}
      refreshing={q.refreshing}
      footer={
        !past && !cancelled ? (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: t.c.surfaceContainer }}>
            {e.my_registration ? (
              <Button label={going ? "Can't go" : "Leave waitlist"} variant="outline" full={false} style={{ flex: 1 }} onPress={toggle} loading={busy} />
            ) : (
              <Button label={e.capacity && !e.spots_left ? "Join waitlist" : "I'm going"} full={false} style={{ flex: 1 }} onPress={toggle} loading={busy} />
            )}
            <Button
              label="Add to calendar"
              icon="calendar-plus"
              variant={e.my_registration ? "primary" : "outline"}
              full={false}
              style={{ flex: 1.3 }}
              onPress={() => addToCalendar(e).catch((err) => notify("Couldn't open your calendar", errorText(err)))}
            />
          </View>
        ) : null
      }
    >
      <View style={{ backgroundColor: hero, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, overflow: "hidden" }}>
        <Blob size={200} color={t.c.tertiaryContainer} right={-60} top={110} />
        <Blob size={28} color={brand.maroon} right={130} top={104} />
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1D1B19" onPress={() => (router.canGoBack() ? router.back() : router.replace("/events"))} />
          <IconButton
            icon="share"
            label="Share"
            bg="#FFFFFF"
            color="#1D1B19"
            onPress={() => Share.share({ message: `${e.title} — ${start.toDateString()}, ${time(start)}${e.location ? ` at ${e.location}` : ""}. On the CYC app.` })}
          />
        </Row>
        <View style={{ marginTop: 28, gap: 12 }}>
          <DateBadge iso={e.starts_at} dark size={64} />
          <T variant="labelMedium" color={heroFg}>
            {cancelled ? "CANCELLED" : past ? "PAST EVENT" : overline}
          </T>
          <T variant="headlineLarge" color={heroFg} style={[{ maxWidth: "85%" }, cancelled ? { textDecorationLine: "line-through" } : null]} accessibilityRole="header">
            {e.title}
          </T>
          {e.my_registration ? (
            <Row gap={6} style={{ backgroundColor: "#2A1D00", alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Icon name={going ? "check" : "pending"} size={16} color="#FFDEA4" />
              <T variant="labelLarge" color="#FFDEA4">
                {going ? "You're going" : "You're on the waitlist"}
              </T>
            </Row>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <ListGroup>
          <ListRow icon="calendar" iconCircle label={start.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })} sublabel={`${time(start)} – ${time(end)}`} chevron={false} />
          {e.location ? (
            <ListRow
              icon="map-pin"
              iconCircle
              label={e.location}
              sublabel={q.data?.chapter?.city ?? undefined}
              onPress={() => openMap([e.location, q.data?.chapter?.city].filter(Boolean).join(", "))}
              right={
                <T variant="labelLarge" color={t.primary} underline>
                  Directions
                </T>
              }
            />
          ) : null}
          {e.online_url ? (
            <ListRow
              icon="video"
              iconCircle
              label="Online"
              sublabel="Join from your phone"
              onPress={() => WebBrowser.openBrowserAsync(e.online_url!)}
              right={
                <T variant="labelLarge" color={t.primary} underline>
                  Open link
                </T>
              }
            />
          ) : null}
          <ListRow
            icon="users"
            iconCircle
            label={`${e.registered_count} going`}
            sublabel={e.capacity ? (e.spots_left ? `${e.spots_left} places left` : `Full${e.waitlist_count ? ` · ${e.waitlist_count} on the waitlist` : ""}`) : "Open to everyone"}
            chevron={false}
          />
        </ListGroup>

        {!past && !cancelled ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 }}>
            <IconTile icon="bell" tint="pink" size={40} />
            <View style={{ flex: 1 }}>
              <T variant="titleMedium">Remind me</T>
              <T variant="bodySmall" muted>
                The day before
              </T>
            </View>
            <Toggle
              label="Remind me the day before"
              value={remind}
              onChange={async (v) => {
                if (!gate()) return;
                try {
                  setRemind(await setReminder(e, v));
                } catch (err) {
                  notify("Couldn't set a reminder", errorText(err));
                }
              }}
            />
          </Card>
        ) : null}

        {e.description ? (
          <>
            <SectionHeader title="About this event" />
            <T variant="bodyLarge" muted>
              {e.description}
            </T>
          </>
        ) : null}

        <SectionHeader title="Hosted by" />
        {q.data?.leaders.length ? (
          <View style={{ gap: 10 }}>
            {q.data.leaders.map((l, i) => (
              <Card key={l.user_id} onPress={() => gate() && router.push(`/person/${l.user_id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Avatar name={l.display_name} tint={tintFor(i + 1)} size={44} />
                <View style={{ flex: 1 }}>
                  <T variant="titleMedium">{l.display_name}</T>
                  <T variant="bodySmall" muted>
                    {l.role} · {host}
                  </T>
                </View>
                <Icon name="chevron-right" size={18} color={t.textMuted} />
              </Card>
            ))}
          </View>
        ) : (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }} onPress={e.chapter_id ? () => router.push(`/chapter/${e.chapter_id}`) : undefined}>
            <IconTile icon="church" tint="green" size={44} />
            <T variant="titleMedium" style={{ flex: 1 }}>
              {host}
            </T>
          </Card>
        )}
      </View>
    </Screen>
  );
}

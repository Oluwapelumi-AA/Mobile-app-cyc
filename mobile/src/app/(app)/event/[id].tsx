import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Share, View } from "react-native";

import { notify, openMap, toggleRegistration } from "@/components/cards";
import { Badge, Blob, Button, Card, DateBadge, ErrorView, Header, Icon, IconButton, ListGroup, ListRow, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { time } from "@/lib/format";
import { brand, useTheme } from "@/lib/theme";
import type { EventItem } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function EventDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(() => api<EventItem>(`/events/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const e = q.data;

  const toggle = async () => {
    if (!e) return;
    setBusy(true);
    try {
      const updated = await toggleRegistration(e);
      q.setData(updated);
      if (updated.my_registration === "waitlisted") notify("You're on the waitlist", "We'll let you know if a spot opens up.");
    } catch (err) {
      notify("Couldn't update", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!e) {
    return (
      <Screen>
        <Header />
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const past = end < new Date();
  const cancelled = e.status === "cancelled";

  return (
    <Screen padded={false} edges={["top", "bottom"]}>
      <View style={{ backgroundColor: brand.red, padding: 18, paddingTop: 8, overflow: "hidden" }}>
        <Blob size={180} color={brand.gold} top={-70} right={-60} />
        <Row style={{ justifyContent: "space-between", paddingTop: 8 }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color={brand.red} size={38} onPress={() => (router.canGoBack() ? router.back() : router.replace("/events"))} />
          <IconButton icon="share-2" label="Share" bg="#FFFFFF" color={brand.red} size={38} onPress={() => Share.share({ message: `${e.title} — ${start.toDateString()} ${time(start)}${e.location ? `, ${e.location}` : ""}` })} />
        </Row>
        <Row gap={14} style={{ marginTop: 18, alignItems: "flex-start" }}>
          <DateBadge iso={e.starts_at} tint="yellow" size={56} />
          <View style={{ flex: 1 }}>
            {cancelled ? <Badge label="Cancelled" tint="gray" /> : past ? <Badge label="Past event" tint="gray" /> : null}
            <T variant="h1" color="#FFFFFF" style={{ marginTop: 4 }}>
              {e.title}
            </T>
          </View>
        </Row>
      </View>

      <View style={{ padding: 18, gap: 16 }}>
        <ListGroup>
          <ListRow icon="clock" label={start.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })} sublabel={`${time(start)} – ${time(end)}`} chevron={false} />
          {e.location ? (
            <ListRow icon="map-pin" label={e.location} onPress={() => openMap(e.location!)} right={<T variant="small" weight="semibold" color={t.primary}>Directions</T>} />
          ) : null}
          {e.online_url ? (
            <ListRow icon="video" label="Online" sublabel={e.online_url} onPress={() => WebBrowser.openBrowserAsync(e.online_url!)} right={<T variant="small" weight="semibold" color={t.primary}>Open link</T>} />
          ) : null}
          <ListRow
            icon="users"
            label={`${e.registered_count} going`}
            sublabel={e.capacity ? (e.spots_left ? `${e.spots_left} spots left` : `Full${e.waitlist_count ? ` · ${e.waitlist_count} on the waitlist` : ""}`) : "Open to everyone"}
            chevron={false}
          />
        </ListGroup>

        {e.description ? (
          <View style={{ gap: 6 }}>
            <T variant="h3">About</T>
            <T variant="body" muted>
              {e.description}
            </T>
          </View>
        ) : null}

        {!cancelled && !past ? (
          e.my_registration ? (
            <Card bg={t.tints.green.bg} bordered={false} style={{ gap: 12 }}>
              <Row gap={8}>
                <Icon name="check-circle" size={18} color={t.tints.green.fg} />
                <T variant="title" color={t.tints.green.fg}>
                  {e.my_registration === "registered" ? "You're going" : "You're on the waitlist"}
                </T>
              </Row>
              <Button label={e.my_registration === "registered" ? "I can't make it" : "Leave the waitlist"} variant="outline" onPress={toggle} loading={busy} />
            </Card>
          ) : (
            <Button label={e.capacity && !e.spots_left ? "Join the waitlist" : "I'm going"} onPress={toggle} loading={busy} />
          )
        ) : null}
      </View>
    </Screen>
  );
}

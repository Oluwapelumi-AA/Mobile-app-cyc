import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";

import { Badge, Blob, Button, Card, DateBadge, Icon, IconButton, IconTile, Row, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { dayDateTime, duration, minutesAgo, shortDate, time } from "@/lib/format";
import { brand, Tint, useTheme } from "@/lib/theme";
import type { EventItem, Meeting, Resource } from "@/lib/types";

export const TINTS: Tint[] = ["yellow", "green", "pink"];
export const tintFor = (i: number) => TINTS[i % TINTS.length];

export const openMap = (place: string) => {
  const q = encodeURIComponent(place);
  const url = Platform.OS === "ios" ? `http://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(url).catch(() => undefined);
};

export function notify(title: string, message?: string) {
  if (Platform.OS === "web") globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Register for an event, or cancel. Returns the updated event. */
export async function toggleRegistration(e: EventItem): Promise<EventItem> {
  if (e.my_registration) {
    await api(`/events/${e.id}/registrations/me`, { method: "DELETE" });
    return { ...e, my_registration: null, registered_count: Math.max(0, e.registered_count - (e.my_registration === "registered" ? 1 : 0)) };
  }
  const reg = await api<{ status: "registered" | "waitlisted" }>(`/events/${e.id}/registrations`, { method: "POST" });
  return { ...e, my_registration: reg.status, registered_count: e.registered_count + (reg.status === "registered" ? 1 : 0) };
}

export const where = (e: Pick<EventItem, "location" | "online_url">) =>
  e.location ? e.location : e.online_url ? "Online" : "";

/** Small row card for an event, as in Events → This week. */
export function EventRow({ event, index = 0, onChange }: { event: EventItem; index?: number; onChange?: (e: EventItem) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const d = new Date(event.starts_at);
  const toggle = async () => {
    setBusy(true);
    try {
      onChange?.(await toggleRegistration(event));
    } catch (err) {
      notify("Couldn't update", errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const cancelled = event.status === "cancelled";
  return (
    <Card onPress={() => router.push(`/event/${event.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <DateBadge iso={event.starts_at} tint={cancelled ? "gray" : tintFor(index)} />
      <View style={{ flex: 1, gap: 3 }}>
        <T variant="title" numberOfLines={1} style={cancelled ? { textDecorationLine: "line-through" } : null}>
          {event.title}
        </T>
        <Row gap={5}>
          <Icon name="clock" size={13} color={t.textMuted} />
          <T variant="caption" muted>
            {d.toLocaleString("en", { weekday: "short" })} · {time(d)}
          </T>
        </Row>
        {where(event) ? (
          <Row gap={5}>
            <Icon name={event.location ? "map-pin" : "video"} size={13} color={t.textMuted} />
            <T variant="caption" muted numberOfLines={1}>
              {where(event)}
            </T>
          </Row>
        ) : null}
      </View>
      {cancelled ? (
        <Badge label="Cancelled" tint="gray" />
      ) : event.my_registration === "registered" ? (
        <Badge label="Going" icon="check" />
      ) : event.my_registration === "waitlisted" ? (
        <Badge label="Waitlist" tint="yellow" />
      ) : event.capacity ? (
        <Button label="Register" small full={false} variant="outline" onPress={toggle} loading={busy} style={{ borderColor: t.primary }} />
      ) : (
        <IconButton icon="bell" label="Remind me" onPress={toggle} bordered />
      )}
    </Card>
  );
}

/** Red "Live now" card. */
export function LiveCard({ meeting, watching }: { meeting: Meeting; watching?: number }) {
  return (
    <View style={{ backgroundColor: brand.red, borderRadius: 20, padding: 16, overflow: "hidden", gap: 10 }}>
      <Blob size={130} color={brand.gold} top={-50} right={-40} />
      <Row gap={6} style={{ backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: brand.red }} />
        <T variant="overline" color={brand.red}>
          LIVE NOW
        </T>
      </Row>
      <T variant="h2" color="#FFFFFF" numberOfLines={2} style={{ paddingRight: 60 }}>
        {meeting.title}
      </T>
      <Row gap={6}>
        <Icon name="video" size={14} color="#FFFFFF" />
        <T variant="small" color="#FFFFFF">
          Online · Started {meeting.started_at ? minutesAgo(meeting.started_at) : "now"}
        </T>
      </Row>
      <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
        <T variant="small" weight="semibold" color="#FFFFFF">
          {meeting.kind === "livestream" ? "Livestream" : "Meeting"}
          {watching ? ` · ${watching} watching` : ""}
        </T>
        <Button label="Join meeting" variant="light" small full={false} onPress={() => router.push(`/meeting/${meeting.id}`)} />
      </Row>
    </View>
  );
}

export const kindIcon = (kind: string) => (kind === "video" ? "video" : kind === "audio" ? "headphones" : kind === "link" ? "link" : "file-text");

export function sermonMeta(r: Resource) {
  const kind = r.kind === "video" ? "VIDEO" : r.kind === "audio" ? "AUDIO" : r.kind.toUpperCase();
  return [kind, duration(r.duration_seconds).toUpperCase()].filter(Boolean).join(" · ");
}

/** A sermon or other resource in a list. */
export function SermonRow({ item, onBookmark }: { item: Resource; onBookmark?: (r: Resource) => void }) {
  const t = useTheme();
  const open = () => router.push(item.kind === "audio" || item.kind === "video" ? `/sermon/${item.id}` : `/resource/${item.id}`);
  return (
    <Card onPress={open} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
      <IconTile icon={kindIcon(item.kind)} tint="red" size={52} rounded={12} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="overline" color={t.primary}>
          {sermonMeta(item)}
        </T>
        <T variant="title" numberOfLines={1}>
          {item.title}
        </T>
        <T variant="caption" muted numberOfLines={1}>
          {[item.author_name, item.scripture_reference, item.published_at ? shortDate(item.published_at) : null].filter(Boolean).join(" · ")}
        </T>
      </View>
      {onBookmark ? (
        <IconButton
          icon="bookmark"
          label={item.bookmarked ? "Remove from saved" : "Save"}
          color={item.bookmarked ? t.primary : t.text}
          onPress={() => onBookmark(item)}
        />
      ) : null}
    </Card>
  );
}

export async function toggleBookmark<T extends { id: string; bookmarked: boolean }>(r: T): Promise<T> {
  await api(`/resources/${r.id}/bookmark`, { method: r.bookmarked ? "DELETE" : "PUT" });
  return { ...r, bookmarked: !r.bookmarked };
}

export { dayDateTime };

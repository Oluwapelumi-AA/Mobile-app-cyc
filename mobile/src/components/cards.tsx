import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { Badge, Blob, Button, Card, DateBadge, HeroTag, Icon, IconButton, IconName, IconTile, Row, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { duration, minutesAgo, shortDate, time } from "@/lib/format";
import { brand, radius, Tint, useTheme } from "@/lib/theme";
import type { EventItem, Meeting, Resource } from "@/lib/types";

export const TINTS: Tint[] = ["yellow", "green", "pink"];
export const tintFor = (i: number) => TINTS[((i % 3) + 3) % 3];

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

export const where = (e: Pick<EventItem, "location" | "online_url">) => (e.location ? e.location : e.online_url ? "Online" : "");

/** Event row (Figma: Events → This week). */
export function EventRow({ event, index = 0, onChange, chevron }: { event: EventItem; index?: number; onChange?: (e: EventItem) => void; chevron?: boolean }) {
  const t = useTheme();
  const gate = useAccountGate();
  const [busy, setBusy] = useState(false);
  const d = new Date(event.starts_at);
  const toggle = async () => {
    if (!gate({ title: "Create an account to register", text: "Your place at events is saved to your account, with a reminder before it starts." })) return;
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
    <Card onPress={() => router.push(`/event/${event.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12 }}>
      <DateBadge iso={event.starts_at} tint={cancelled ? "gray" : tintFor(index)} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="titleMedium" numberOfLines={1} style={cancelled ? { textDecorationLine: "line-through" } : null}>
          {event.title}
        </T>
        <Row gap={6}>
          <Icon name="clock" size={14} color={t.textMuted} />
          <T variant="bodySmall" muted>
            {d.toLocaleString("en", { weekday: "short" })} · {time(d)}
          </T>
        </Row>
        {where(event) ? (
          <Row gap={6}>
            <Icon name={event.location ? "map-pin" : "video"} size={14} color={t.textMuted} />
            <T variant="bodySmall" muted numberOfLines={1} style={{ flex: 1 }}>
              {where(event)}
            </T>
          </Row>
        ) : null}
      </View>
      {chevron ? (
        <Icon name="chevron-right" size={18} color={t.textMuted} />
      ) : cancelled ? (
        <Badge label="Cancelled" tint="gray" />
      ) : event.my_registration === "registered" ? (
        <Badge label="Going" icon="check" />
      ) : event.my_registration === "waitlisted" ? (
        <Badge label="Waitlist" tint="yellow" icon="pending" />
      ) : event.capacity ? (
        <Button label="Register" small full={false} variant="outline" onPress={toggle} loading={busy} />
      ) : (
        <IconButton icon="bell" label="Remind me" onPress={toggle} />
      )}
    </Card>
  );
}

/** Maroon "Live now" card. */
export function LiveCard({ meeting }: { meeting: Meeting }) {
  return (
    <View style={{ backgroundColor: brand.maroon, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10 }}>
      <Blob size={140} color={brand.gold} top={-50} right={-40} />
      <HeroTag label="LIVE NOW" light dot={brand.maroon} />
      <T variant="headlineSmall" color="#FFFFFF" numberOfLines={2} style={{ paddingRight: 70 }}>
        {meeting.title}
      </T>
      <Row gap={6}>
        <Icon name="video" size={16} color="#FFFFFF" />
        <T variant="bodyMedium" color="#FFFFFF">
          Online · Started {meeting.started_at ? minutesAgo(meeting.started_at) : "now"}
        </T>
      </Row>
      <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
        <T variant="labelLarge" color="#FFFFFF">
          {meeting.kind === "livestream" ? "Livestream" : "Meeting"}
        </T>
        <Button label="Join meeting" variant="light" small full={false} onPress={() => router.push(`/meeting/${meeting.id}`)} />
      </Row>
    </View>
  );
}

export const kindIcon = (kind: string): IconName => (kind === "video" ? "video" : kind === "audio" ? "headphones" : kind === "link" ? "link" : kind === "document" ? "file-pdf" : "file-text");

export function sermonMeta(r: Resource) {
  const kind = r.kind === "video" ? "VIDEO" : r.kind === "audio" ? "AUDIO" : r.kind.toUpperCase();
  return [kind, duration(r.duration_seconds).toUpperCase()].filter(Boolean).join(" · ");
}

export const openResource = (r: Pick<Resource, "id" | "kind">) =>
  router.push(r.kind === "audio" || r.kind === "video" ? `/sermon/${r.id}` : `/resource/${r.id}`);

/** A sermon or other resource in a list (maroon tile, overline, title, meta, bookmark). */
export function SermonRow({ item, onBookmark, meta }: { item: Resource; onBookmark?: (r: Resource) => void; meta?: string }) {
  const t = useTheme();
  return (
    <Card onPress={() => openResource(item)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center" }}>
        <Icon name={kindIcon(item.kind)} size={26} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="labelMedium" color={t.primary}>
          {sermonMeta(item)}
        </T>
        <T variant="titleMedium" numberOfLines={1}>
          {item.title}
        </T>
        <T variant="bodySmall" muted numberOfLines={1}>
          {meta ?? [item.author_name, item.scripture_reference, item.published_at ? shortDate(item.published_at) : null].filter(Boolean).join(" · ")}
        </T>
      </View>
      {onBookmark ? (
        <IconButton icon="bookmark" weight={item.bookmarked ? "fill" : "regular"} label={item.bookmarked ? "Remove from saved" : "Save"} color={item.bookmarked ? t.primary : t.text} onPress={() => onBookmark(item)} />
      ) : null}
    </Card>
  );
}

export async function toggleBookmark<T extends { id: string; bookmarked: boolean }>(r: T): Promise<T> {
  await api(`/resources/${r.id}/bookmark`, { method: r.bookmarked ? "DELETE" : "PUT" });
  return { ...r, bookmarked: !r.bookmarked };
}

/** Coloured browse tile (Learn → Browse, Community → Explore). */
export function Tile({ icon, title, text, tint, onPress, solid }: { icon: IconName; title: string; text: string; tint: Tint; onPress: () => void; solid?: boolean }) {
  const t = useTheme();
  const c = t.tints[tint];
  const bg = solid ? c.bg : t.c.surfaceContainerLow;
  const fg = solid ? c.fg : t.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: bg,
        borderRadius: radius.xl,
        padding: 16,
        minHeight: 140,
        gap: 4,
        borderWidth: solid ? 0 : 1,
        borderColor: t.c.outlineVariant,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {solid ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tint === "gray" ? t.text : c.fg, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Icon name={icon} size={22} color={tint === "gray" ? t.bg : c.bg} />
        </View>
      ) : (
        <View style={{ marginBottom: 12 }}>
          <IconTile icon={icon} tint={tint} size={44} />
        </View>
      )}
      <T variant="titleMedium" color={fg}>
        {title}
      </T>
      <T variant="bodySmall" color={solid ? fg : t.textMuted}>
        {text}
      </T>
    </Pressable>
  );
}

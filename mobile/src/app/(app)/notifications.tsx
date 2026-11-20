import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { notify } from "@/components/cards";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorView, Header, IconButton, IconTile, Loading, Row, Screen, T, TextButton } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { categoryLook, hrefFor } from "@/lib/notificationLinks";
import { useTheme } from "@/lib/theme";
import type { AppNotification, NotificationCategory, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const FILTERS: { key: NotificationCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "chapter", label: "Chapter" },
  { key: "events", label: "Events" },
  { key: "meetings", label: "Live" },
  { key: "resources", label: "Learn" },
  { key: "social", label: "Community" },
];

function Item({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const t = useTheme();
  const look = categoryLook[n.category];
  const isLive = n.type === "meeting_live" && typeof n.data.meeting_id === "string";
  return (
    <Card onPress={() => onOpen(n)} bg={n.read ? t.bg : t.surface} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <IconTile icon={look.icon} tint={look.tint} size={40} rounded={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="overline" color={t.primary}>
            {look.label}
          </T>
          <Row gap={6}>
            <T variant="caption" muted>
              {timeAgo(n.created_at)}
            </T>
            {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} /> : null}
          </Row>
        </Row>
        <T variant="title">{n.title}</T>
        {n.body ? (
          <T variant="caption" muted numberOfLines={2}>
            {n.body}
          </T>
        ) : null}
        {isLive ? <Button label="Join meeting" small full={false} style={{ marginTop: 8 }} onPress={() => onOpen(n)} /> : null}
      </View>
    </Card>
  );
}

export default function Notifications() {
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");
  const q = useApi(() => api<Page<AppNotification>>("/notifications", { query: { limit: 50, category: filter === "all" ? undefined : filter } }), [filter]);
  const items = q.data?.items ?? [];
  const fresh = items.filter((n) => !n.read);
  const earlier = items.filter((n) => n.read);

  const open = (n: AppNotification) => {
    if (!n.read) {
      api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
      q.setData((d) => ({ ...d!, items: d!.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }));
    }
    const href = hrefFor(n.data);
    if (href) router.push(href);
  };

  const readAll = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      q.setData((d) => ({ ...d!, items: d!.items.map((x) => ({ ...x, read: true })) }));
    } catch (err) {
      notify("Couldn't update", errorText(err));
    }
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Notifications" right={<IconButton icon="settings" label="Notification settings" bordered onPress={() => router.push("/notification-settings")} />} />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {fresh.length ? (
        <>
          <Row style={{ justifyContent: "space-between", marginTop: 22, marginBottom: 10 }}>
            <T variant="h3">New</T>
            <TextButton label="Mark all as read" onPress={readAll} />
          </Row>
          <View style={{ gap: 10 }}>
            {fresh.map((n) => (
              <Item key={n.id} n={n} onOpen={open} />
            ))}
          </View>
        </>
      ) : null}
      {earlier.length ? (
        <>
          <T variant="h3" style={{ marginTop: 22, marginBottom: 10 }}>
            Earlier
          </T>
          <View style={{ gap: 10 }}>
            {earlier.map((n) => (
              <Item key={n.id} n={n} onOpen={open} />
            ))}
          </View>
        </>
      ) : null}

      {q.data && !items.length ? (
        <EmptyState
          icon="bell"
          tint="green"
          title="You're all caught up"
          text="We'll let you know about events, announcements and updates from CYC, your chapter and your department."
          action="Notification settings"
          onAction={() => router.push("/notification-settings")}
        />
      ) : null}
    </Screen>
  );
}

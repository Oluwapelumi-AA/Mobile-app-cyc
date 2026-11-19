import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Card, Chip, ChipRow, Dialog, EmptyState, Header, Icon, IconButton, ProgressBar, Row, Screen, T } from "@/components/ui";
import { formatBytes, listDownloads, removeDownload, type Download } from "@/lib/downloads";
import { shortDate } from "@/lib/format";
import { brand, radius, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

type Filter = "all" | "audio" | "video";

/** Downloads (Figma: Downloads). Everything saved on this phone to use offline. */
export default function Downloads() {
  const t = useTheme();
  const q = useApi(listDownloads);
  const [filter, setFilter] = useState<Filter>("all");
  const [removing, setRemoving] = useState<Download | "all" | null>(null);
  const items = q.data ?? [];
  const shown = items.filter((d) => filter === "all" || (filter === "video" ? d.kind === "video" : d.kind !== "video"));
  const total = items.reduce((n, d) => n + d.size, 0);
  const SPACE = 2e9; // Soft budget we show the total against.

  const confirmRemove = async () => {
    const list = removing === "all" ? items : removing ? [removing] : [];
    for (const d of list) await removeDownload(d.resource_id);
    setRemoving(null);
    q.reload();
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Downloads" right={items.length ? <IconButton icon="trash" label="Remove all downloads" onPress={() => setRemoving("all")} /> : undefined} />
      {items.length ? (
        <Card style={{ gap: 10, marginBottom: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="titleMedium">{formatBytes(total)} used</T>
            <T variant="bodySmall" muted>
              {items.length} {items.length === 1 ? "item" : "items"}
            </T>
          </Row>
          <ProgressBar value={Math.min(100, (total / SPACE) * 100)} color={brand.gold} />
          <T variant="bodySmall" muted>
            Downloads play without internet. They stay on this phone only.
          </T>
        </Card>
      ) : null}
      {items.length ? (
        <View style={{ marginBottom: 14 }}>
          <ChipRow>
            {(
              [
                ["all", "All"],
                ["audio", "Audio"],
                ["video", "Video"],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <Chip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} tone="yellow" />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        {shown.map((d) => (
          <Card key={d.resource_id} onPress={() => router.push(`/sermon/${d.resource_id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center" }}>
              <Icon name={d.kind === "video" ? "video" : "headphones"} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="titleSmall" numberOfLines={1}>
                {d.title}
              </T>
              <T variant="bodySmall" muted numberOfLines={1}>
                {[d.author_name, formatBytes(d.size), `Saved ${shortDate(d.saved_at)}`].filter(Boolean).join(" · ")}
              </T>
            </View>
            <IconButton icon="trash" label={`Remove ${d.title}`} color={t.textMuted} onPress={() => setRemoving(d)} />
          </Card>
        ))}
      </View>
      {q.data && !items.length ? (
        <EmptyState icon="download" tint="yellow" title="No downloads yet" text="Tap Download on any sermon to listen without internet." action="Browse sermons" onAction={() => router.push("/learn/sermons")} />
      ) : null}
      {q.data && items.length && !shown.length ? <EmptyState icon="funnel" tint="gray" title="Nothing here" text="No downloads match this filter." /> : null}
      <Dialog
        visible={removing !== null}
        icon="trash"
        danger
        title={removing === "all" ? "Remove all downloads?" : "Remove download?"}
        text={removing === "all" ? `This frees ${formatBytes(total)} on your phone. You can download them again later.` : "You can download it again later."}
        confirm="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

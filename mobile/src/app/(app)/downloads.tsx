import { router } from "expo-router";
import { View } from "react-native";

import { Card, EmptyState, Header, IconButton, IconTile, Screen, T } from "@/components/ui";
import { formatBytes, listDownloads, removeDownload } from "@/lib/downloads";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

export default function Downloads() {
  const t = useTheme();
  const q = useApi(listDownloads);
  const items = q.data ?? [];
  const total = items.reduce((n, d) => n + d.size, 0);
  return (
    <Screen>
      <Header title="Downloads" subtitle={items.length ? `${items.length} saved on this phone · ${formatBytes(total)}` : "Sermons you've saved to play offline."} />
      <View style={{ gap: 10 }}>
        {items.map((d) => (
          <Card key={d.resource_id} onPress={() => router.push(`/sermon/${d.resource_id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
            <IconTile icon={d.kind === "video" ? "video" : "headphones"} tint="red" size={48} />
            <View style={{ flex: 1 }}>
              <T variant="title" numberOfLines={1}>
                {d.title}
              </T>
              <T variant="caption" muted>
                {[d.author_name, formatBytes(d.size)].filter(Boolean).join(" · ")}
              </T>
            </View>
            <IconButton
              icon="trash-2"
              label={`Remove ${d.title}`}
              color={t.danger}
              onPress={async () => {
                await removeDownload(d.resource_id);
                q.reload();
              }}
            />
          </Card>
        ))}
      </View>
      {q.data && !items.length ? <EmptyState icon="download" tint="yellow" title="No downloads" text="Tap Download on any sermon to listen without internet." /> : null}
    </Screen>
  );
}

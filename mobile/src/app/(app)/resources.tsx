import { useState } from "react";
import { View } from "react-native";

import { openResource } from "@/components/cards";
import { Card, Chip, ChipRow, EmptyState, ErrorView, Header, Icon, Loading, Screen, T } from "@/components/ui";
import { apiAll } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Resource, ResourceKind } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const KINDS: { key: ResourceKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "article", label: "Articles" },
  { key: "document", label: "Documents" },
  { key: "link", label: "Links" },
];

/** Notes, guides and downloads (everything that isn't a sermon). */
export default function Resources() {
  const t = useTheme();
  const [kind, setKind] = useState<ResourceKind | "all">("all");
  const q = useApi(async () => (await apiAll<Resource>("/resources", {}, 200)).filter((r) => r.kind !== "audio" && r.kind !== "video"));
  const shown = (q.data ?? []).filter((r) => kind === "all" || r.kind === kind);
  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Resources" subtitle="Notes, guides and downloads." />
      <ChipRow>
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </ChipRow>
      <View style={{ height: 16 }} />
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {shown.map((r) => (
          <Card key={r.id} onPress={() => openResource(r)} style={{ flexDirection: "row", gap: 14, alignItems: "center", padding: 14 }}>
            <Icon name={r.kind === "document" ? "file-pdf" : r.kind === "link" ? "link" : "file-text"} />
            <View style={{ flex: 1 }}>
              <T variant="titleMedium" numberOfLines={1}>
                {r.title}
              </T>
              <T variant="bodySmall" muted numberOfLines={1}>
                {[r.kind[0].toUpperCase() + r.kind.slice(1), r.author_name, r.summary].filter(Boolean).join(" · ")}
              </T>
            </View>
            <Icon name="chevron-right" size={18} color={t.textMuted} />
          </Card>
        ))}
      </View>
      {q.data && !shown.length ? <EmptyState icon="file-text" tint="green" title="No resources yet" text="Guides and notes from CYC will appear here." /> : null}
    </Screen>
  );
}

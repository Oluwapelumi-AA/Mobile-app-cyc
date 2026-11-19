import { router } from "expo-router";
import { View } from "react-native";

import { Button, Card, EmptyState, ErrorView, Header, Icon, Loading, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { brand, radius, useTheme } from "@/lib/theme";
import type { Certificate } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** My certificates (Figma: Certificates). */
export default function Certificates() {
  const t = useTheme();
  const q = useApi(() => api<Certificate[]>("/certificates/mine"));
  const list = q.data ?? [];
  return (
    <Screen
      onRefresh={q.refresh}
      refreshing={q.refreshing}
      edges={["top", "bottom"]}
      footer={
        list.length ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Button label="Earn another certificate" variant="outline" icon="school" onPress={() => router.push("/learn/courses")} />
          </View>
        ) : null
      }
    >
      <Header title="Certificates" subtitle={list.length ? `${list.length} earned · tap one to view, download or share` : undefined} />
      {q.loading && !q.data ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 12 }}>
        {list.map((c) => (
          <Card key={c.course_id} onPress={() => router.push({ pathname: "/certificate/[course]", params: { course: c.course_id } })} style={{ padding: 0 }}>
            <View style={{ height: 8, backgroundColor: brand.gold }} />
            <Row gap={14} style={{ padding: 16 }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: t.c.secondaryContainer, alignItems: "center", justifyContent: "center" }}>
                <Icon name="certificate" size={26} color={t.c.onSecondaryContainer} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="titleMedium">{c.course_title}</T>
                <T variant="bodySmall" muted>
                  Completed {shortDate(c.completed_at)}
                  {c.best_score !== null ? ` · ${c.best_score}%` : ""}
                </T>
                {c.certificate_number ? (
                  <T variant="labelSmall" muted>
                    {c.certificate_number}
                  </T>
                ) : null}
              </View>
              <Icon name="chevron-right" color={t.textMuted} />
            </Row>
          </Card>
        ))}
      </View>
      {q.data && !list.length ? (
        <EmptyState icon="certificate" tint="yellow" title="No certificates yet" text="Finish every lesson in a course to earn your first one." action="Browse courses" onAction={() => router.push("/learn/courses")} />
      ) : null}
    </Screen>
  );
}

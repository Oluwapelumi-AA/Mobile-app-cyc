import { router } from "expo-router";
import { View } from "react-native";

import { Card, EmptyState, ErrorView, Header, IconTile, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { Certificate, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Certificates() {
  const q = useApi(() => api<Page<Certificate>>("/courses/certificates", { query: { limit: 50 } }));
  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Certificates" subtitle="Courses you've completed." />
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {(q.data?.items ?? []).map((c) => (
          <Card key={c.course_id} onPress={() => router.push(`/course/${c.course_id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconTile icon="award" tint="yellow" size={48} />
            <View style={{ flex: 1 }}>
              <T variant="title">{c.course_title}</T>
              <T variant="caption" muted>
                Completed {shortDate(c.completed_at)}
                {c.best_score !== null ? ` · best quiz score ${c.best_score}%` : ""}
              </T>
            </View>
          </Card>
        ))}
      </View>
      {q.data && !q.data.items.length ? <EmptyState icon="award" tint="yellow" title="No certificates yet" text="Finish a course to earn one." action="Browse courses" onAction={() => router.push("/learn/courses")} /> : null}
    </Screen>
  );
}

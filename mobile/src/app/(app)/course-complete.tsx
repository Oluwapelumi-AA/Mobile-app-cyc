import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Blob, Button, Card, ErrorView, Icon, Loading, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMinutes, totalMinutes } from "@/lib/course";
import { brand, radius, useTheme } from "@/lib/theme";
import type { CourseDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Course complete (Figma: Course – Complete). */
export default function CourseComplete() {
  const t = useTheme();
  const { profile } = useAuth();
  const { course } = useLocalSearchParams<{ course: string }>();
  const q = useApi(() => api<CourseDetail>(`/courses/${course}`), [course], { refetchOnFocus: false });
  const c = q.data;
  const best = (c?.quizzes ?? []).map((x) => x.my_best_score).filter((v): v is number => v !== null);
  const avg = best.length ? Math.round(best.reduce((a, b) => a + b, 0) / best.length) : null;

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        c ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label="View certificate" icon="certificate" onPress={() => router.replace({ pathname: "/certificate/[course]", params: { course: c.id } })} />
            <Button label="Back to courses" variant="outline" onPress={() => router.replace("/learn/courses")} />
          </View>
        ) : null
      }
    >
      {!c ? (
        q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />
      ) : (
        <>
          <View style={{ marginTop: 24, backgroundColor: brand.forest, borderRadius: radius.xxl, padding: 28, overflow: "hidden", alignItems: "center", gap: 10 }}>
            <Blob size={160} color={brand.gold} right={-60} top={-60} />
            <Blob size={90} color="rgba(255,255,255,0.12)" left={-30} bottom={-30} />
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: brand.gold, alignItems: "center", justifyContent: "center" }}>
              <Icon name="award" size={44} color="#2A1D00" weight="fill" />
            </View>
            <T variant="labelMedium" color="#FFFFFF">
              COURSE COMPLETE
            </T>
            <T variant="headlineMedium" color="#FFFFFF" center>
              {c.title}
            </T>
            <T variant="bodyLarge" color="rgba(255,255,255,0.88)" center>
              Well done, {profile?.display_name.split(" ")[0] ?? "friend"}! Your certificate is ready.
            </T>
          </View>
          <Row gap={10} style={{ marginTop: 16 }}>
            {[
              { v: String(c.lesson_count), l: "Lessons" },
              { v: formatMinutes(totalMinutes(c)), l: "Time spent" },
              { v: avg === null ? "—" : `${avg}%`, l: "Quiz average" },
            ].map((s) => (
              <Card key={s.l} style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 14 }}>
                <T variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit>
                  {s.v}
                </T>
                <T variant="bodySmall" muted center>
                  {s.l}
                </T>
              </Card>
            ))}
          </Row>
          <T variant="bodyMedium" muted center style={{ marginTop: 16, color: t.textMuted }}>
            You can find it any time under Profile → Certificates.
          </T>
        </>
      )}
    </Screen>
  );
}

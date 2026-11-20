import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { CourseRow } from "@/components/CourseRow";
import { Blob, Button, Card, EmptyState, ErrorView, Header, Icon, Loading, ProgressBar, Row, Screen, Segmented, T } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Course, CourseDetail, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "all" | "progress" | "done";

export default function Courses() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>("all");
  const q = useApi(async () => {
    const all = await api<Page<Course>>("/courses", { query: { limit: 50 } });
    const current = all.items.find((c) => c.enrolled && !c.completed_at);
    const detail = current ? await api<CourseDetail>(`/courses/${current.id}`).catch(() => null) : null;
    return { courses: all.items, current: detail };
  });

  const courses = q.data?.courses ?? [];
  const shown = courses.filter((c) => (tab === "all" ? true : tab === "progress" ? c.enrolled && !c.completed_at : Boolean(c.completed_at)));
  const cur = q.data?.current;
  const done = cur?.lessons.filter((l) => l.completed).length ?? 0;

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Courses" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { key: "all", label: "All" },
          { key: "progress", label: "In progress" },
          { key: "done", label: "Completed" },
        ]}
      />

      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {cur && tab !== "done" ? (
        <>
          <T variant="h3" style={{ marginTop: 22, marginBottom: 12 }}>
            Continue
          </T>
          <Card bg={t.tints.green.bg} bordered={false} style={{ padding: 18, gap: 10 }} onPress={() => router.push(`/course/${cur.id}`)}>
            <Blob size={110} color={t.tints.yellow.bg} top={-40} right={-30} />
            <Icon name="book" size={22} color={t.tints.green.fg} />
            <T variant="overline" color={t.tints.green.fg}>
              COURSE · LESSON {Math.min(done + 1, cur.lesson_count)} OF {cur.lesson_count}
            </T>
            <T variant="h2" color={t.tints.green.fg}>
              {cur.title}
            </T>
            <ProgressBar value={cur.lesson_count ? (done / cur.lesson_count) * 100 : 0} color="#10200F" track="rgba(255,255,255,0.7)" />
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="small" color={t.tints.green.fg}>
                {done} of {plural(cur.lesson_count, "lesson")} done
              </T>
              <Button
                label="Continue"
                icon="play"
                variant="dark"
                small
                full={false}
                onPress={() => {
                  const next = cur.lessons.find((l) => !l.completed) ?? cur.lessons[0];
                  if (next) router.push({ pathname: "/lesson/[id]", params: { id: next.id, course: cur.id } });
                }}
              />
            </Row>
          </Card>
        </>
      ) : null}

      {q.data ? (
        <T variant="h3" style={{ marginTop: 24, marginBottom: 12 }}>
          {tab === "all" ? "All courses" : tab === "progress" ? "In progress" : "Completed"}
        </T>
      ) : null}
      <View style={{ gap: 10 }}>
        {shown.map((c, i) => (
          <CourseRow key={c.id} c={c} index={i} />
        ))}
      </View>
      {q.data && !shown.length ? (
        <EmptyState
          icon="book"
          tint="green"
          title={tab === "done" ? "No finished courses yet" : tab === "progress" ? "Nothing in progress" : "No courses yet"}
          text={tab === "all" ? "Courses from CYC will appear here." : "Start a course and it will show up here."}
        />
      ) : null}
    </Screen>
  );
}

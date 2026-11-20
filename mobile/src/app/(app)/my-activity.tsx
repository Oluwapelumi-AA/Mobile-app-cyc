import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { EventRow, SermonRow } from "@/components/cards";
import { Card, ChipRow, Chip, EmptyState, ErrorView, Header, Icon, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, apiAll } from "@/lib/api";
import { quizPassed } from "@/lib/course";
import { shortDate } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Certificate, Course, CourseDetail, EventItem, Page, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "courses" | "quizzes" | "certificates" | "saved" | "events";
const TABS: [Tab, string][] = [
  ["courses", "Courses"],
  ["quizzes", "Quiz results"],
  ["certificates", "Certificates"],
  ["saved", "Saved"],
  ["events", "Events"],
];

/** My activity (Figma: Profile – My activity). */
export default function MyActivity() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>("courses");
  const q = useApi(async () => {
    const [enrolled, certs, saved, events] = await Promise.all([
      apiAll<Course>("/courses", { enrolled: true }).catch(() => [] as Course[]),
      api<Certificate[]>("/certificates/mine").catch(() => [] as Certificate[]),
      apiAll<Resource>("/resources/bookmarks").catch(() => [] as Resource[]),
      api<Page<EventItem>>("/events", { query: { mine: true, limit: 50 } })
        .then((p) => p.items)
        .catch(() => [] as EventItem[]),
    ]);
    // Course details carry lesson progress and quiz scores.
    const details = (await Promise.all(enrolled.slice(0, 20).map((c) => api<CourseDetail>(`/courses/${c.id}`).catch(() => null)))).filter(Boolean) as CourseDetail[];
    return { details, certs, saved, events };
  });
  const d = q.data;
  const quizzes = (d?.details ?? []).flatMap((c) => c.quizzes.filter((x) => x.attempt_count > 0).map((x) => ({ quiz: x, course: c })));

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="My activity" />
      <View style={{ marginBottom: 16 }}>
        <ChipRow>
          {TABS.map(([k, l]) => (
            <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} tone="yellow" />
          ))}
        </ChipRow>
      </View>
      {q.loading && !d ? <Loading /> : null}
      {q.error && !d ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {d && tab === "courses" ? (
        d.details.length ? (
          <View style={{ gap: 10 }}>
            {d.details.map((c) => {
              const done = c.lessons.filter((l) => l.completed).length;
              const pct = c.lessons.length ? (done / c.lessons.length) * 100 : 0;
              return (
                <Card key={c.id} onPress={() => router.push(`/course/${c.id}`)} style={{ gap: 8 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T variant="titleMedium" style={{ flex: 1 }} numberOfLines={2}>
                      {c.title}
                    </T>
                    {c.completed_at ? <Icon name="check-circle" color={t.c.tertiary} weight="fill" /> : null}
                  </Row>
                  <ProgressBar value={pct} />
                  <T variant="bodySmall" muted>
                    {c.completed_at ? `Completed ${shortDate(c.completed_at)}` : `${done} of ${c.lessons.length} lessons · ${Math.round(pct)}%`}
                  </T>
                </Card>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="school" title="No courses yet" text="Start a course and your progress shows up here." action="Browse courses" onAction={() => router.push("/learn/courses")} />
        )
      ) : null}

      {d && tab === "quizzes" ? (
        quizzes.length ? (
          <View style={{ gap: 10 }}>
            {quizzes.map(({ quiz, course }) => {
              const passed = quizPassed(quiz);
              return (
                <Card key={quiz.id} onPress={() => router.push({ pathname: "/quiz/[id]", params: { id: quiz.id, course: course.id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: passed ? t.c.tertiaryContainer : t.c.secondaryContainer, alignItems: "center", justifyContent: "center" }}>
                    <T variant="titleSmall" color={passed ? t.c.onTertiaryContainer : t.c.onSecondaryContainer}>
                      {quiz.my_best_score ?? 0}%
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="titleSmall">{quiz.title}</T>
                    <T variant="bodySmall" muted numberOfLines={1}>
                      {course.title}
                    </T>
                    <T variant="labelMedium" color={passed ? t.c.tertiary : t.textMuted}>
                      {passed ? "Passed" : `Needs ${quiz.pass_mark}%`} · {quiz.attempt_count} {quiz.attempt_count === 1 ? "attempt" : "attempts"}
                    </T>
                  </View>
                  <Icon name="chevron-right" color={t.textMuted} />
                </Card>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="list-checks" tint="yellow" title="No quiz results yet" text="Quizzes you take in your courses show up here." />
        )
      ) : null}

      {d && tab === "certificates" ? (
        d.certs.length ? (
          <View style={{ gap: 10 }}>
            {d.certs.map((c) => (
              <Card key={c.course_id} onPress={() => router.push({ pathname: "/certificate/[course]", params: { course: c.course_id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name="certificate" size={28} color={t.c.onSecondaryContainer} />
                <View style={{ flex: 1 }}>
                  <T variant="titleSmall">{c.course_title}</T>
                  <T variant="bodySmall" muted>
                    {shortDate(c.completed_at)}
                    {c.certificate_number ? ` · ${c.certificate_number}` : ""}
                  </T>
                </View>
                <Icon name="chevron-right" color={t.textMuted} />
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState icon="certificate" tint="yellow" title="No certificates yet" text="Finish a course to earn one." />
        )
      ) : null}

      {d && tab === "saved" ? (
        d.saved.length ? (
          <View style={{ gap: 10 }}>
            {d.saved.map((r) => (
              <SermonRow key={r.id} item={r} />
            ))}
          </View>
        ) : (
          <EmptyState icon="bookmark" tint="pink" title="Nothing saved yet" text="Tap the bookmark on any sermon to keep it here." />
        )
      ) : null}

      {d && tab === "events" ? (
        d.events.length ? (
          <View style={{ gap: 10 }}>
            {d.events.map((e, i) => (
              <EventRow key={e.id} event={e} index={i} chevron />
            ))}
          </View>
        ) : (
          <EmptyState icon="calendar" tint="yellow" title="No events yet" text="Events you register for show up here." action="See events" onAction={() => router.push("/events")} />
        )
      ) : null}
    </Screen>
  );
}

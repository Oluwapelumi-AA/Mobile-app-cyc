import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { notify } from "@/components/cards";
import { Alert, Blob, Button, ErrorView, Icon, IconButton, Loading, ProgressBar, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { formatMinutes, lessonKind, modulesOf, orderedLessons, quizPassed, totalMinutes } from "@/lib/course";
import { plural } from "@/lib/format";
import { brand, radius, useTheme } from "@/lib/theme";
import type { CourseDetail, Lesson } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Course detail (Figma: Course detail – Light): modules you can open and close. */
export default function CourseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = useAccountGate();
  const q = useApi(() => api<CourseDetail>(`/courses/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const c = q.data;

  if (!c) {
    return (
      <Screen>
        <View style={{ paddingTop: 12 }}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        </View>
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load this course" /> : <Loading />}
      </Screen>
    );
  }

  const lessons = orderedLessons(c);
  const done = lessons.filter((l) => l.completed).length;
  const minutes = totalMinutes(c);
  const next = lessons.find((l) => !l.completed);
  const nextIndex = next ? lessons.indexOf(next) + 1 : lessons.length;
  const modules = modulesOf(c);
  const hasModules = modules.some((m) => m.title);
  const hero = t.c.tertiaryContainer;
  const heroFg = t.c.onTertiaryContainer;

  const openLesson = (l: Lesson) => router.push({ pathname: "/lesson/[id]", params: { id: l.id, course: c.id } });

  const start = async () => {
    if (!gate({ title: "Create an account to take courses", text: "Your progress is saved as you go, and you'll earn a certificate when you finish." })) return;
    setBusy(true);
    try {
      if (!c.enrolled) {
        await api(`/courses/${c.id}/enrollment`, { method: "PUT" });
        q.setData({ ...c, enrolled: true });
      }
      const target = next ?? lessons[0];
      if (target) openLesson(target);
    } catch (err) {
      notify("Couldn't start the course", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false} edges={["bottom"]} onRefresh={q.refresh} refreshing={q.refreshing}>
      <View style={{ backgroundColor: hero, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, overflow: "hidden" }}>
        <Blob size={210} color={t.c.secondaryContainer} right={-80} top={90} />
        <Blob size={24} color={brand.maroon} right={140} top={72} />
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1D1B19" onPress={() => (router.canGoBack() ? router.back() : router.replace("/learn/courses"))} />
          <IconButton icon="share" label="Share" bg="#FFFFFF" color="#1D1B19" onPress={() => Share.share({ message: `Take “${c.title}” on the CYC app.` })} />
        </Row>
        <T variant="labelMedium" color={heroFg} style={{ marginTop: 28 }}>
          COURSE{c.category ? ` · ${c.category.toUpperCase()}` : ""}
        </T>
        <T variant="displaySmall" color={heroFg} style={{ marginTop: 6, maxWidth: "85%" }} accessibilityRole="header">
          {c.title}
        </T>
        <T variant="bodyMedium" color={heroFg} style={{ marginTop: 8 }}>
          {[hasModules ? plural(modules.length, "module") : null, plural(lessons.length, "lesson"), minutes ? formatMinutes(minutes) : null].filter(Boolean).join(" · ")}
        </T>
        {c.enrolled ? (
          <View style={{ marginTop: 14, gap: 8 }}>
            <ProgressBar value={lessons.length ? (done / lessons.length) * 100 : 0} color={t.scheme === "dark" ? heroFg : "#10200F"} track={t.scheme === "dark" ? "rgba(255,255,255,0.2)" : "#FFFFFF"} height={8} />
            <T variant="labelLarge" color={heroFg}>
              {c.completed_at ? "Course complete" : `${done} of ${plural(lessons.length, "lesson")} done · progress saved`}
            </T>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 20 }}>
        {lessons.length ? (
          <Button label={!c.enrolled ? "Start course" : c.completed_at || !next ? "Review course" : `Continue lesson ${nextIndex}`} icon="play" onPress={start} loading={busy} />
        ) : null}

        {c.description || c.summary ? (
          <>
            <SectionHeader title="About this course" />
            <T variant="bodyLarge" muted>
              {c.description || c.summary}
            </T>
            {c.instructor_name ? (
              <T variant="bodyMedium" style={{ marginTop: 8 }}>
                Taught by {c.instructor_name}
              </T>
            ) : null}
          </>
        ) : null}

        <SectionHeader title="What’s inside" />
        <View style={{ gap: 12 }}>
          {modules.map((m, mi) => {
            const isClosed = closed[mi] ?? (hasModules && m.lessons.every((x) => x.lesson.completed) && m.quizzes.every(quizPassed));
            const allDone = m.lessons.every((x) => x.lesson.completed);
            const summary = allDone && m.lessons.length ? `${plural(m.lessons.length, "lesson")} · Done` : `${plural(m.lessons.length, "lesson")}${m.quizzes.length ? ` and ${m.quizzes.length === 1 ? "a quiz" : plural(m.quizzes.length, "quiz", "quizzes")}` : ""}`;
            return (
              <View key={mi} style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: t.c.outlineVariant, overflow: "hidden", backgroundColor: t.c.surfaceContainerLow }}>
                {hasModules ? (
                  <Pressable
                    onPress={() => setClosed((s) => ({ ...s, [mi]: !isClosed }))}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isClosed }}
                    style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <T variant="titleMedium">
                        Module {mi + 1}
                        {m.title ? ` · ${m.title}` : ""}
                      </T>
                      <T variant="bodySmall" muted>
                        {summary}
                      </T>
                    </View>
                    <Icon name={isClosed ? "chevron-down" : "chevron-up"} size={20} color={t.textMuted} />
                  </Pressable>
                ) : null}
                {!isClosed
                  ? [
                      ...m.lessons.map(({ lesson: l, n }) => {
                        const current = next?.id === l.id && c.enrolled;
                        return (
                          <Pressable
                            key={l.id}
                            onPress={() => (c.enrolled ? openLesson(l) : start())}
                            accessibilityRole="button"
                            style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderTopWidth: hasModules || n > 1 ? 1 : 0, borderTopColor: t.c.outlineVariant, backgroundColor: current ? t.c.tertiaryContainer : "transparent" }}
                          >
                            {l.completed ? (
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: brand.forest, alignItems: "center", justifyContent: "center" }}>
                                <Icon name="check" size={16} color="#FFFFFF" weight="bold" />
                              </View>
                            ) : current ? (
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#10200F", alignItems: "center", justifyContent: "center" }}>
                                <Icon name="play" size={14} color="#FFFFFF" weight="fill" />
                              </View>
                            ) : (
                              <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: t.c.outline }} />
                            )}
                            <View style={{ flex: 1 }}>
                              <T variant="titleMedium" color={current ? t.c.onTertiaryContainer : undefined}>
                                {n}. {l.title}
                              </T>
                              <T variant="bodySmall" color={current ? t.c.onTertiaryContainer : t.textMuted}>
                                {current ? `In progress${l.duration_minutes ? ` · About ${l.duration_minutes} min left` : ""}` : `${lessonKind(l)}${l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}`}
                              </T>
                            </View>
                          </Pressable>
                        );
                      }),
                      ...m.quizzes.map((quiz) => (
                        <Pressable
                          key={quiz.id}
                          onPress={() => (c.enrolled ? router.push({ pathname: "/quiz/[id]", params: { id: quiz.id, course: c.id } }) : start())}
                          accessibilityRole="button"
                          style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderTopWidth: 1, borderTopColor: t.c.outlineVariant }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: quizPassed(quiz) ? t.c.tertiaryContainer : t.c.secondaryContainer, alignItems: "center", justifyContent: "center" }}>
                            <Icon name={quizPassed(quiz) ? "check" : "list-checks"} size={16} color={quizPassed(quiz) ? t.c.onTertiaryContainer : t.c.onSecondaryContainer} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <T variant="titleMedium">{quiz.title}</T>
                            <T variant="bodySmall" muted>
                              {plural(quiz.question_count, "question")} · pass mark {quiz.pass_mark}%{quiz.my_best_score !== null ? ` · best ${quiz.my_best_score}%` : ""}
                            </T>
                          </View>
                          <Icon name="chevron-right" size={18} color={t.textMuted} />
                        </Pressable>
                      )),
                    ]
                  : null}
              </View>
            );
          })}
          {!modules.length ? <Alert text="Lessons are coming soon." /> : null}
        </View>

        <View style={{ marginTop: 16 }}>
          <Alert
            tone={c.completed_at ? "success" : "warning"}
            icon="certificate"
            title={c.completed_at ? "Certificate earned" : "Certificate on completion"}
            text={c.completed_at ? "Well done! View, download or share it from Certificates." : "Finish every lesson to earn a certificate you can share and anyone can verify."}
          />
        </View>
        {c.completed_at ? <Button label="View certificate" variant="soft" icon="certificate" style={{ marginTop: 12 }} onPress={() => router.push({ pathname: "/certificate/[course]", params: { course: c.id } })} /> : null}
      </View>
    </Screen>
  );
}

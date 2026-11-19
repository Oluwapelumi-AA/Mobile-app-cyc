import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";

import { notify } from "@/components/cards";
import { Blob, Button, ErrorView, Icon, IconButton, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { plural } from "@/lib/format";
import { brand, useTheme } from "@/lib/theme";
import type { CourseDetail, Lesson, Quiz } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Item = { kind: "lesson"; lesson: Lesson; n: number } | { kind: "quiz"; quiz: Quiz };

export default function CourseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(() => api<CourseDetail>(`/courses/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const c = q.data;

  if (!c) {
    return (
      <Screen>
        <View style={{ paddingTop: 8 }}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        </View>
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const lessons = [...c.lessons].sort((a, b) => a.position - b.position);
  const done = lessons.filter((l) => l.completed).length;
  const minutes = lessons.reduce((n, l) => n + (l.duration_minutes ?? 0), 0);
  const next = lessons.find((l) => !l.completed);
  const nextIndex = next ? lessons.indexOf(next) + 1 : lessons.length;

  // Quizzes go after the lesson they belong to, or at the end.
  const items: Item[] = [];
  lessons.forEach((lesson, i) => {
    items.push({ kind: "lesson", lesson, n: i + 1 });
    for (const quiz of c.quizzes.filter((x) => x.lesson_id === lesson.id)) items.push({ kind: "quiz", quiz });
  });
  for (const quiz of c.quizzes.filter((x) => !x.lesson_id || !lessons.some((l) => l.id === x.lesson_id))) items.push({ kind: "quiz", quiz });

  const openLesson = (l: Lesson) => router.push({ pathname: "/lesson/[id]", params: { id: l.id, course: c.id } });

  const start = async () => {
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
      <View style={{ backgroundColor: t.tints.green.bg, paddingHorizontal: 18, paddingTop: 54, paddingBottom: 20, overflow: "hidden" }}>
        <Blob size={200} color={t.tints.yellow.bg} right={-70} top={80} />
        <Blob size={18} color={brand.red} right={120} top={64} />
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1C1A17" size={38} onPress={() => (router.canGoBack() ? router.back() : router.replace("/learn/courses"))} />
          <IconButton icon="share-2" label="Share" bg="#FFFFFF" color="#1C1A17" size={38} onPress={() => Share.share({ message: `Take "${c.title}" on the CYC app.` })} />
        </Row>
        <T variant="overline" color={t.tints.green.fg} style={{ marginTop: 26 }}>
          COURSE{c.category ? ` · ${c.category.toUpperCase()}` : ""}
        </T>
        <T variant="display" color={t.tints.green.fg} style={{ fontSize: 36, lineHeight: 38, marginTop: 4, maxWidth: "85%" }}>
          {c.title}
        </T>
        <T variant="small" color={t.tints.green.fg} style={{ marginTop: 8 }}>
          {plural(lessons.length, "lesson")}
          {c.quizzes.length ? ` · ${plural(c.quizzes.length, "quiz", "quizzes")}` : ""}
          {minutes ? ` · ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`}` : ""}
        </T>
        {c.enrolled ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <ProgressBar value={lessons.length ? (done / lessons.length) * 100 : 0} color="#10200F" track="#FFFFFF" />
            <T variant="small" weight="semibold" color={t.tints.green.fg}>
              {c.completed_at ? "Course complete" : `${done} of ${plural(lessons.length, "lesson")} done · progress saved`}
            </T>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 18 }}>
        {lessons.length ? (
          <Button
            label={!c.enrolled ? "Start course" : c.completed_at || !next ? "Review course" : `Continue lesson ${nextIndex}`}
            icon="play"
            onPress={start}
            loading={busy}
          />
        ) : null}

        {c.description || c.summary ? (
          <>
            <T variant="h3" style={{ marginTop: 22, marginBottom: 8 }}>
              About this course
            </T>
            <T variant="body" muted>
              {c.description || c.summary}
            </T>
            {c.instructor_name ? (
              <T variant="small" style={{ marginTop: 8 }}>
                Taught by {c.instructor_name}
              </T>
            ) : null}
          </>
        ) : null}

        <T variant="h3" style={{ marginTop: 22, marginBottom: 12 }}>
          What’s inside
        </T>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: "hidden", backgroundColor: t.surface }}>
          {items.map((item, i) => {
            const border = i ? { borderTopWidth: 1, borderTopColor: t.border } : null;
            if (item.kind === "quiz") {
              const passed = item.quiz.my_best_score !== null && item.quiz.my_best_score >= item.quiz.pass_mark;
              return (
                <Pressable
                  key={item.quiz.id}
                  onPress={() => (c.enrolled ? router.push({ pathname: "/quiz/[id]", params: { id: item.quiz.id, course: c.id } }) : notify("Start the course first"))}
                  style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }, border]}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: passed ? t.tints.green.bg : t.tints.yellow.bg, alignItems: "center", justifyContent: "center" }}>
                    <Icon name={passed ? "check" : "list"} size={15} color={passed ? t.tints.green.fg : t.tints.yellow.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="title">{item.quiz.title}</T>
                    <T variant="caption" muted>
                      {plural(item.quiz.question_count, "question")} · pass mark {item.quiz.pass_mark}%
                      {item.quiz.my_best_score !== null ? ` · best ${item.quiz.my_best_score}%` : ""}
                    </T>
                  </View>
                  <Icon name="chevron-right" size={17} color={t.textMuted} />
                </Pressable>
              );
            }
            const l = item.lesson;
            const current = next?.id === l.id && c.enrolled;
            return (
              <Pressable
                key={l.id}
                onPress={() => (c.enrolled ? openLesson(l) : start())}
                style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: current ? t.tints.green.bg : "transparent" }, border]}
              >
                {l.completed ? (
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: brand.forest, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" size={15} color="#FFFFFF" />
                  </View>
                ) : current ? (
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#10200F", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="play" size={13} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: t.textMuted }} />
                )}
                <View style={{ flex: 1 }}>
                  <T variant="title" color={current ? t.tints.green.fg : undefined}>
                    {item.n}. {l.title}
                  </T>
                  <T variant="caption" color={current ? t.tints.green.fg : undefined} muted={!current}>
                    {current ? "Up next" : l.completed ? "Done" : l.video_url ? "Video" : "Reading"}
                    {l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}
                  </T>
                </View>
              </Pressable>
            );
          })}
          {!items.length ? (
            <T variant="small" muted style={{ padding: 14 }}>
              Lessons are coming soon.
            </T>
          ) : null}
        </View>

        {c.completed_at ? (
          <View style={{ marginTop: 18 }}>
            <Button label="View my certificates" variant="soft" icon="award" onPress={() => router.push("/certificates")} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

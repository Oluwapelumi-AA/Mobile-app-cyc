import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { notify } from "@/components/cards";
import { Badge, Button, Card, ErrorView, Header, Icon, IconTile, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { modulesOf, orderedLessons } from "@/lib/course";
import { brand, radius, useTheme } from "@/lib/theme";
import type { CourseDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const isFileVideo = (url: string) => /\.(mp4|m3u8|mov|webm)(\?|$)/i.test(url);

function LessonVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: radius.xl, backgroundColor: "#000" }} />;
}

/** One lesson (Figma: Lesson – Light). */
export default function LessonScreen() {
  const t = useTheme();
  const { id, course } = useLocalSearchParams<{ id: string; course: string }>();
  const q = useApi(() => api<CourseDetail>(`/courses/${course}`), [course], { refetchOnFocus: false });
  const [busy, setBusy] = useState(false);

  const c = q.data;
  const lessons = c ? orderedLessons(c) : [];
  const index = lessons.findIndex((l) => l.id === id);
  const lesson = lessons[index];
  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  const moduleIndex = c ? modulesOf(c).findIndex((m) => m.lessons.some((x) => x.lesson.id === id)) : -1;
  const quizAfter = c?.quizzes.find((x) => x.lesson_id === id);

  const go = (lessonId: string) => router.replace({ pathname: "/lesson/[id]", params: { id: lessonId, course } });

  const complete = async () => {
    if (!lesson || !c) return;
    setBusy(true);
    try {
      if (!lesson.completed) await api(`/course-lessons/${lesson.id}/completion`, { method: "PUT" });
      const remaining = lessons.filter((l) => !l.completed && l.id !== lesson.id).length;
      if (quizAfter) router.replace({ pathname: "/quiz/[id]", params: { id: quizAfter.id, course } });
      else if (next) go(next.id);
      else if (!remaining) router.replace({ pathname: "/course-complete", params: { course } });
      else router.back();
    } catch (err) {
      notify("Couldn't save your progress", errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        lesson ? (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: t.c.surfaceContainer }}>
            <Button label="Previous" icon="arrow-left" variant="outline" full={false} style={{ flex: 1 }} disabled={!prev} onPress={() => prev && go(prev.id)} />
            <Button label={quizAfter ? "Complete & quiz" : next ? "Complete & next" : "Finish course"} full={false} style={{ flex: 1.4 }} loading={busy} onPress={complete} />
          </View>
        ) : null
      }
    >
      <Header small title={c ? `Lesson ${index + 1} of ${lessons.length}` : undefined} />
      {!c ? (q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />) : !lesson ? (
        <ErrorView title="Lesson not found" message="This lesson isn't available any more." />
      ) : (
        <>
          <ProgressBar value={((index + (lesson.completed ? 1 : 0)) / lessons.length) * 100} />
          {lesson.video_url ? (
            <View style={{ marginTop: 16 }}>
              {isFileVideo(lesson.video_url) ? (
                <LessonVideo uri={lesson.video_url} />
              ) : (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(lesson.video_url!)} accessibilityRole="button" accessibilityLabel="Play the lesson video">
                  <View style={{ aspectRatio: 16 / 9, borderRadius: radius.xl, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="play" size={28} color={brand.maroon} weight="fill" />
                    </View>
                    {lesson.duration_minutes ? (
                      <View style={{ position: "absolute", right: 12, bottom: 12, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <T variant="labelMedium" color="#FFFFFF">
                          {lesson.duration_minutes} min
                        </T>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              )}
            </View>
          ) : null}

          <T variant="labelMedium" color={t.primary} style={{ marginTop: 20 }}>
            {c.title.toUpperCase()}
            {moduleIndex >= 0 && modulesOf(c).some((m) => m.title) ? ` · MODULE ${moduleIndex + 1}` : ""}
          </T>
          <T variant="headlineMedium" style={{ marginTop: 4 }} accessibilityRole="header">
            {lesson.title}
          </T>
          <Row gap={8} style={{ marginTop: 8 }}>
            {lesson.duration_minutes ? <Badge label={`${lesson.duration_minutes} min`} tint="yellow" icon="clock" /> : null}
            {lesson.completed ? <Badge label="Done" icon="check" /> : null}
          </Row>

          {lesson.body
            ? lesson.body.split(/\n{2,}/).map((para, i) => (
                <T key={i} variant="bodyLarge" style={{ marginTop: 16 }}>
                  {para}
                </T>
              ))
            : null}

          {lesson.scripture_reference || lesson.scripture_text ? (
            <Card bg={t.c.secondaryContainer} bordered={false} style={{ marginTop: 20, gap: 8, borderLeftWidth: 4, borderLeftColor: brand.gold }}>
              <T variant="labelMedium" color={t.c.onSecondaryContainer}>
                SCRIPTURE{lesson.scripture_reference ? ` · ${lesson.scripture_reference.toUpperCase()}` : ""}
              </T>
              {lesson.scripture_text ? (
                <T variant="bodyLarge" color={t.c.onSecondaryContainer} style={{ fontStyle: "italic" }}>
                  {lesson.scripture_text}
                </T>
              ) : null}
            </Card>
          ) : null}

          {lesson.notes_url ? (
            <Card onPress={() => WebBrowser.openBrowserAsync(lesson.notes_url!)} style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 20 }}>
              <IconTile icon="file-pdf" tint="pink" size={44} />
              <View style={{ flex: 1 }}>
                <T variant="titleMedium">Lesson notes</T>
                <T variant="bodySmall" muted>
                  PDF · opens in your browser
                </T>
              </View>
              <Icon name="download" color={t.textMuted} />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

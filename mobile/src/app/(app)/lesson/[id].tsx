import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";

import { notify } from "@/components/cards";
import { Badge, Button, Card, ErrorView, Header, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { CourseDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const isFileVideo = (url: string) => /\.(mp4|m3u8|mov|webm)(\?|$)/i.test(url);

function LessonVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: "#000" }} />;
}

export default function LessonScreen() {
  const t = useTheme();
  const { id, course } = useLocalSearchParams<{ id: string; course: string }>();
  const q = useApi(() => api<CourseDetail>(`/courses/${course}`), [course], { refetchOnFocus: false });
  const [busy, setBusy] = useState(false);

  const c = q.data;
  const lessons = c ? [...c.lessons].sort((a, b) => a.position - b.position) : [];
  const index = lessons.findIndex((l) => l.id === id);
  const lesson = lessons[index];
  const next = lessons[index + 1];
  const quizAfter = c?.quizzes.find((x) => x.lesson_id === id);

  const goNext = () => {
    if (quizAfter) router.replace({ pathname: "/quiz/[id]", params: { id: quizAfter.id, course: course } });
    else if (next) router.replace({ pathname: "/lesson/[id]", params: { id: next.id, course: course } });
    else router.back();
  };

  const complete = async () => {
    if (!lesson) return;
    setBusy(true);
    try {
      if (!lesson.completed) await api(`/course-lessons/${lesson.id}/completion`, { method: "PUT" });
      goNext();
    } catch (err) {
      notify("Couldn't save your progress", errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title={c ? `Lesson ${index + 1} of ${lessons.length}` : undefined} />
      {!c ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : !lesson ? (
        <ErrorView message="This lesson isn't available any more." />
      ) : (
        <>
          <ProgressBar value={((index + (lesson.completed ? 1 : 0)) / lessons.length) * 100} />
          <T variant="overline" color={t.primary} style={{ marginTop: 18 }}>
            {c.title.toUpperCase()}
          </T>
          <T variant="h1" style={{ marginTop: 4 }}>
            {lesson.title}
          </T>
          <Row gap={8} style={{ marginTop: 8 }}>
            {lesson.duration_minutes ? <Badge label={`${lesson.duration_minutes} min`} tint="yellow" icon="clock" /> : null}
            {lesson.completed ? <Badge label="Done" icon="check" /> : null}
          </Row>

          {lesson.video_url ? (
            <View style={{ marginTop: 16 }}>
              {isFileVideo(lesson.video_url) ? (
                <LessonVideo uri={lesson.video_url} />
              ) : (
                <Button label="Watch the video" icon="play" variant="outline" onPress={() => WebBrowser.openBrowserAsync(lesson.video_url!)} />
              )}
            </View>
          ) : null}

          {lesson.body ? (
            <Card style={{ marginTop: 16 }}>
              <T variant="body" style={{ lineHeight: 25 }}>
                {lesson.body}
              </T>
            </Card>
          ) : null}

          <View style={{ marginTop: 24, gap: 12 }}>
            <Button
              label={lesson.completed ? (quizAfter ? "Take the quiz" : next ? "Next lesson" : "Back to course") : quizAfter ? "Mark done and take the quiz" : next ? "Mark done and continue" : "Finish course"}
              icon={lesson.completed ? "arrow-right" : "check"}
              onPress={complete}
              loading={busy}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

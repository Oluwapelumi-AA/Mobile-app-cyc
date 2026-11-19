import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { notify } from "@/components/cards";
import { Button, Card, EmptyState, ErrorView, Header, Icon, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Quiz, QuizAttempt } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function QuizScreen() {
  const t = useTheme();
  const { id, course } = useLocalSearchParams<{ id: string; course?: string }>();
  const q = useApi(() => api<Quiz>(`/course-quizzes/${id}`), [id], { refetchOnFocus: false });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [busy, setBusy] = useState(false);

  const quiz = q.data;
  const total = quiz?.questions.length ?? 0;
  const question = quiz?.questions[step];
  const chosen = answers[step] ?? null;

  const submit = async () => {
    if (!quiz) return;
    setBusy(true);
    try {
      setResult(await api<QuizAttempt>(`/course-quizzes/${quiz.id}/attempts`, { method: "POST", body: { answers: answers.map((a) => a ?? 0) } }));
    } catch (err) {
      notify("Couldn't submit", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setAnswers([]);
    setStep(0);
    setResult(null);
  };

  if (result && quiz) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title={quiz.title} />
        <EmptyState
          icon={result.passed ? "award" : "refresh-cw"}
          tint={result.passed ? "green" : "yellow"}
          title={result.passed ? "You passed!" : "Not quite"}
          text={`You got ${result.correct_count} of ${result.question_count} right (${result.score}%). The pass mark is ${quiz.pass_mark}%.`}
        />
        <View style={{ gap: 12 }}>
          {result.passed ? (
            <Button label="Back to the course" onPress={() => (course ? router.replace(`/course/${course}`) : router.back())} />
          ) : (
            <>
              <Button label="Try again" onPress={restart} />
              <Button label="Back to the course" variant="outline" onPress={() => (course ? router.replace(`/course/${course}`) : router.back())} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title={quiz?.title ?? "Quiz"} />
      {!quiz ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : !total ? (
        <EmptyState icon="list" tint="yellow" title="No questions yet" />
      ) : (
        <>
          <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <T variant="small" muted>
              Question {step + 1} of {total}
            </T>
            <T variant="small" muted>
              Pass mark {quiz.pass_mark}%
            </T>
          </Row>
          <ProgressBar value={((step + 1) / total) * 100} />
          <T variant="h2" style={{ marginTop: 22, marginBottom: 16 }}>
            {question!.prompt}
          </T>
          <View style={{ gap: 10 }}>
            {question!.options.map((opt, i) => {
              const on = chosen === i;
              return (
                <Pressable key={i} onPress={() => setAnswers((a) => Object.assign([...a], { [step]: i }))}>
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderColor: on ? t.primary : t.border, borderWidth: on ? 2 : 1 }} bg={on ? t.tints.pink.bg : undefined}>
                    <Icon name={on ? "check-circle" : "circle"} size={20} color={on ? t.primary : t.textMuted} />
                    <T variant="body" style={{ flex: 1 }}>
                      {opt}
                    </T>
                  </Card>
                </Pressable>
              );
            })}
          </View>
          <Row gap={10} style={{ marginTop: 24 }}>
            {step > 0 ? <Button label="Back" variant="outline" full={false} style={{ flex: 1 }} onPress={() => setStep((s) => s - 1)} /> : null}
            {step < total - 1 ? (
              <Button label="Next" full={false} style={{ flex: 2 }} disabled={chosen === null} onPress={() => setStep((s) => s + 1)} />
            ) : (
              <Button label="Submit answers" full={false} style={{ flex: 2 }} disabled={chosen === null} loading={busy} onPress={submit} />
            )}
          </Row>
        </>
      )}
    </Screen>
  );
}

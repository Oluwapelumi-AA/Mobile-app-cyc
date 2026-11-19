import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { notify } from "@/components/cards";
import { Blob, Button, Card, EmptyState, ErrorView, Header, Icon, IconButton, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { modulesOf, orderedLessons } from "@/lib/course";
import { shortDate } from "@/lib/format";
import { brand, radius, useTheme } from "@/lib/theme";
import type { AnswerResult, CourseDetail, Quiz, QuizAttempt } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const LETTERS = "ABCDEFGH";
const isTrueFalse = (options: string[]) => options.length === 2 && options.every((o) => /^(true|false)$/i.test(o.trim()));

/**
 * Quiz (Figma: Quiz – Question / Not quite / True or false – Correct / Result).
 * Each answer is checked straight away, with the reason, then all answers
 * are submitted together for the score.
 */
export default function QuizScreen() {
  const t = useTheme();
  const { profile } = useAuth();
  const { id, course } = useLocalSearchParams<{ id: string; course?: string }>();
  const q = useApi(async () => {
    const quiz = await api<Quiz>(`/course-quizzes/${id}`);
    const detail = course ? await api<CourseDetail>(`/courses/${course}`).catch(() => null) : null;
    return { quiz, course: detail };
  }, [id], { refetchOnFocus: false });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [checked, setChecked] = useState<Record<number, AnswerResult>>({});
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);

  const quiz = q.data?.quiz;
  const total = quiz?.questions.length ?? 0;
  const question = quiz?.questions[step];
  const feedback = checked[step];
  const close = () => (course ? router.replace(`/course/${course}`) : router.back());

  const check = async () => {
    if (!quiz || chosen === null) return;
    setBusy(true);
    try {
      const r = await api<AnswerResult>(`/course-quizzes/${quiz.id}/check`, { method: "POST", body: { question_index: step, answer: chosen } });
      setChecked((c) => ({ ...c, [step]: r }));
      setAnswers((a) => Object.assign([...a], { [step]: chosen }));
    } catch (err) {
      notify("Couldn't check your answer", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    if (step < total - 1) {
      setStep(step + 1);
      setChosen(null);
      return;
    }
    setBusy(true);
    try {
      setResult(await api<QuizAttempt>(`/course-quizzes/${quiz.id}/attempts`, { method: "POST", body: { answers } }));
    } catch (err) {
      notify("Couldn't submit", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setAnswers([]);
    setChecked({});
    setChosen(null);
    setStep(0);
    setResult(null);
    setReview(false);
  };

  if (result && quiz) {
    const c = q.data?.course;
    const lessons = c ? orderedLessons(c) : [];
    const nextLesson = lessons.find((l) => !l.completed);
    const modules = c ? modulesOf(c) : [];
    const nextModuleIndex = nextLesson ? modules.findIndex((m) => m.lessons.some((x) => x.lesson.id === nextLesson.id)) : -1;
    const nextModule = modules[nextModuleIndex];
    return (
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            {result.passed ? (
              nextLesson ? (
                <Button label={`Continue to lesson ${lessons.indexOf(nextLesson) + 1}`} onPress={() => router.replace({ pathname: "/lesson/[id]", params: { id: nextLesson.id, course: course! } })} />
              ) : c?.completed_at || (c && !nextLesson) ? (
                <Button label="See your certificate" icon="certificate" onPress={() => router.replace({ pathname: "/course-complete", params: { course: course! } })} />
              ) : (
                <Button label="Back to the course" onPress={close} />
              )
            ) : (
              <Button label="Try again" icon="refresh" onPress={restart} />
            )}
            <Button label={review ? "Hide answers" : "Review answers"} variant="outline" onPress={() => setReview((r) => !r)} />
          </View>
        }
      >
        <Row style={{ justifyContent: "flex-end", paddingTop: 8 }}>
          <IconButton icon="x" label="Close" onPress={close} />
        </Row>
        <View style={{ backgroundColor: result.passed ? t.c.tertiaryContainer : t.c.secondaryContainer, borderRadius: radius.xxl, padding: 24, overflow: "hidden", alignItems: "center", gap: 6 }}>
          <Blob size={130} color={result.passed ? brand.gold : t.c.primaryContainer} right={-40} top={-40} />
          <T variant="labelMedium" color={result.passed ? t.c.onTertiaryContainer : t.c.onSecondaryContainer}>
            {quiz.title.toUpperCase()} · {result.passed ? "PASSED" : "NOT YET"}
          </T>
          <T variant="displayMedium" color={result.passed ? t.c.onTertiaryContainer : t.c.onSecondaryContainer}>
            {result.correct_count}/{result.question_count}
          </T>
          <T variant="bodyLarge" center color={result.passed ? t.c.onTertiaryContainer : t.c.onSecondaryContainer}>
            {result.passed ? `Well done, ${profile?.display_name.split(" ")[0] ?? "friend"}. ${nextModuleIndex > 0 ? `Module ${nextModuleIndex} is complete.` : "You passed!"}` : `You need ${quiz.pass_mark}% to pass. Have another go – you've got this.`}
          </T>
        </View>
        <Row gap={10} style={{ marginTop: 16 }}>
          {[
            { v: `${result.score}%`, l: "Your score" },
            { v: `${quiz.pass_mark}%`, l: "Needed to pass" },
            { v: `${quiz.attempt_count + 1}`, l: quiz.attempt_count ? "Attempts" : "1st attempt" },
          ].map((s) => (
            <Card key={s.l} style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 14 }}>
              <T variant="headlineSmall">{s.v}</T>
              <T variant="bodySmall" muted center>
                {s.l}
              </T>
            </Card>
          ))}
        </Row>
        <T variant="bodySmall" muted center style={{ marginTop: 12 }}>
          Saved to your progress · {shortDate(result.created_at)}
        </T>

        {result.passed && nextModule ? (
          <Card style={{ marginTop: 20, gap: 4 }}>
            <T variant="labelMedium" muted>
              UP NEXT
            </T>
            <T variant="titleMedium">
              Module {nextModuleIndex + 1}
              {nextModule.title ? ` · ${nextModule.title}` : ""}
            </T>
            <T variant="bodySmall" muted>
              {nextModule.lessons.length} lessons{nextModule.quizzes.length ? " and a quiz" : ""}
            </T>
          </Card>
        ) : null}

        {review ? (
          <View style={{ marginTop: 20, gap: 10 }}>
            {quiz.questions.map((qq, i) => {
              const r = checked[i];
              return (
                <Card key={i} style={{ gap: 6 }}>
                  <T variant="titleSmall">
                    {i + 1}. {qq.prompt}
                  </T>
                  <Row gap={6}>
                    <Icon name={r?.correct ? "check-circle" : "x"} size={16} color={r?.correct ? t.c.tertiary : t.c.error} />
                    <T variant="bodySmall">Your answer: {qq.options[answers[i]]}</T>
                  </Row>
                  {r && !r.correct ? <T variant="bodySmall" muted>Right answer: {qq.options[r.correct_index]}</T> : null}
                  {r?.explanation ? <T variant="bodySmall" muted>{r.explanation}</T> : null}
                </Card>
              );
            })}
          </View>
        ) : null}
      </Screen>
    );
  }

  const tf = question ? isTrueFalse(question.options) : false;

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        question ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            {feedback ? (
              <Button label={step < total - 1 ? "Next question" : "See my score"} onPress={nextQuestion} loading={busy} />
            ) : (
              <Button label="Check answer" onPress={check} disabled={chosen === null} loading={busy} />
            )}
          </View>
        ) : null
      }
    >
      <Header small title={quiz ? `${quiz.title} · Question ${step + 1} of ${total}` : "Quiz"} onBack={close} />
      {!quiz ? (q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />) : !total ? (
        <EmptyState icon="list-checks" tint="yellow" title="No questions yet" />
      ) : (
        <>
          <ProgressBar value={((step + (feedback ? 1 : 0)) / total) * 100} />
          <T variant="labelMedium" color={t.primary} style={{ marginTop: 20 }}>
            {tf ? "TRUE OR FALSE" : "MULTIPLE CHOICE"}
          </T>
          <T variant="headlineSmall" style={{ marginTop: 6, marginBottom: 20 }}>
            {question!.prompt}
          </T>
          <View style={tf ? { flexDirection: "row", gap: 10 } : { gap: 10 }}>
            {question!.options.map((opt, i) => {
              const isChosen = (feedback ? answers[step] : chosen) === i;
              const isRight = feedback && feedback.correct_index === i;
              const isWrongPick = feedback && isChosen && !feedback.correct;
              const border = isRight ? t.c.tertiary : isWrongPick ? t.c.error : isChosen ? t.button : t.c.outlineVariant;
              const bg = isRight ? t.c.tertiaryContainer : isWrongPick ? t.c.errorContainer : isChosen ? t.c.primaryContainer : t.c.surfaceContainerLow;
              return (
                <Pressable
                  key={i}
                  disabled={Boolean(feedback)}
                  onPress={() => setChosen(i)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isChosen }}
                  style={{ flex: tf ? 1 : undefined, flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radius.lg, borderWidth: isChosen || isRight ? 2 : 1, borderColor: border, backgroundColor: bg }}
                >
                  {tf ? null : (
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isRight ? t.c.tertiary : isWrongPick ? t.c.error : isChosen ? t.button : t.c.surfaceContainerHigh, alignItems: "center", justifyContent: "center" }}>
                      {isRight || isWrongPick ? (
                        <Icon name={isRight ? "check" : "x"} size={16} color="#FFFFFF" weight="bold" />
                      ) : (
                        <T variant="labelLarge" color={isChosen ? t.onButton : t.text}>
                          {LETTERS[i]}
                        </T>
                      )}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <T variant="bodyLarge" center={tf}>
                      {opt}
                    </T>
                    {isWrongPick ? <T variant="labelMedium" color={t.c.error}>Your answer</T> : null}
                    {isRight && !tf ? <T variant="labelMedium" color={t.c.tertiary}>Right answer</T> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {feedback ? (
            <Card bg={feedback.correct ? t.c.tertiaryContainer : t.c.errorContainer} bordered={false} style={{ marginTop: 20, gap: 6 }}>
              <Row gap={8}>
                <Icon name={feedback.correct ? "check-circle" : "alert"} color={feedback.correct ? t.c.onTertiaryContainer : t.c.onErrorContainer} />
                <T variant="titleMedium" color={feedback.correct ? t.c.onTertiaryContainer : t.c.onErrorContainer}>
                  {feedback.correct ? "That’s right" : "Not quite"}
                </T>
              </Row>
              {feedback.explanation ? (
                <T variant="bodyMedium" color={feedback.correct ? t.c.onTertiaryContainer : t.c.onErrorContainer}>
                  {feedback.explanation}
                </T>
              ) : !feedback.correct ? (
                <T variant="bodyMedium" color={t.c.onErrorContainer}>
                  The right answer is “{question!.options[feedback.correct_index]}”.
                </T>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

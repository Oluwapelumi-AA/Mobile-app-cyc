import type { CourseDetail, Lesson, Quiz } from "./types";

export type Module = {
  title: string | null;
  lessons: { lesson: Lesson; n: number }[];
  quizzes: Quiz[];
};

/**
 * Group a course's lessons into modules (lessons that share `module_title`,
 * in order). Quizzes go after the lesson they belong to's module; quizzes
 * with no lesson go in the last module.
 */
export function modulesOf(c: CourseDetail): Module[] {
  const lessons = [...c.lessons].sort((a, b) => a.position - b.position);
  const modules: Module[] = [];
  lessons.forEach((lesson, i) => {
    const last = modules[modules.length - 1];
    if (last && last.title === (lesson.module_title ?? null)) last.lessons.push({ lesson, n: i + 1 });
    else modules.push({ title: lesson.module_title ?? null, lessons: [{ lesson, n: i + 1 }], quizzes: [] });
  });
  for (const quiz of c.quizzes) {
    const home = modules.find((m) => m.lessons.some((l) => l.lesson.id === quiz.lesson_id)) ?? modules[modules.length - 1];
    if (home) home.quizzes.push(quiz);
    else modules.push({ title: null, lessons: [], quizzes: [quiz] });
  }
  return modules;
}

export const orderedLessons = (c: CourseDetail) => [...c.lessons].sort((a, b) => a.position - b.position);

export const totalMinutes = (c: CourseDetail) => c.lessons.reduce((n, l) => n + (l.duration_minutes ?? 0), 0);

export const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export const lessonKind = (l: Lesson) => (l.video_url ? "Video" : "Reading");

export const quizPassed = (q: Quiz) => q.my_best_score !== null && q.my_best_score >= q.pass_mark;

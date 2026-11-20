import { router } from "expo-router";
import { View } from "react-native";

import { tintFor } from "@/components/cards";
import { Card, Icon, IconTile, T } from "@/components/ui";
import { plural } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Course } from "@/lib/types";

export function CourseRow({ c, index }: { c: Course; index: number }) {
  const t = useTheme();
  const status = c.completed_at ? "Completed" : c.enrolled ? "In progress" : "Not started";
  return (
    <Card onPress={() => router.push(`/course/${c.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile icon="book" tint={c.completed_at ? "green" : tintFor(index)} size={52} rounded={14} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="overline" muted>
          {plural(c.lesson_count, "LESSON").toUpperCase()}
          {c.quiz_count ? ` · ${plural(c.quiz_count, "QUIZ", "QUIZZES").toUpperCase()}` : ""}
        </T>
        <T variant="title" numberOfLines={1}>
          {c.title}
        </T>
        <T variant="caption" muted>
          {status} · {c.level[0].toUpperCase() + c.level.slice(1)}
        </T>
      </View>
      <Icon name="chevron-right" size={18} color={t.textMuted} />
    </Card>
  );
}

import { Stack } from "expo-router";

import { useTheme } from "@/lib/theme";

/** Learn keeps the tab bar: hub, sermons and courses. */
export default function LearnLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />;
}

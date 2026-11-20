import { router, Stack } from "expo-router";
import { useEffect } from "react";

import { hrefFor } from "@/lib/notificationLinks";
import { useLastNotificationResponse } from "@/lib/useLastNotificationResponse";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  const response = useLastNotificationResponse();

  // Tapping a push notification opens what it's about.
  useEffect(() => {
    const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
    const href = data ? hrefFor(data) : null;
    if (href) router.push(href);
  }, [response]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sermon/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="sermon-filters" options={{ presentation: "transparentModal", animation: "fade" }} />
    </Stack>
  );
}

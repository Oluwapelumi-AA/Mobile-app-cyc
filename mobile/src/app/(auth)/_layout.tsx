import { Stack } from "expo-router";

import { useTheme } from "@/lib/theme";

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="two-step" />
    </Stack>
  );
}

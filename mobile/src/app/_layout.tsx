import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/lib/auth";
import { PlayerProvider } from "@/lib/player";
import { registerPush } from "@/lib/push";
import { useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { status, ready } = useAuth();
  const t = useTheme();
  const signedIn = status === "signedIn";

  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  useEffect(() => {
    if (signedIn && ready) registerPush().catch(() => undefined);
  }, [signedIn, ready]);

  if (status === "loading") return null;

  const nav = t.scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: t.bg, card: t.bg, primary: t.primary, text: t.text, border: t.border } }}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !ready}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && ready}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PlayerProvider>
          <RootNavigator />
        </PlayerProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

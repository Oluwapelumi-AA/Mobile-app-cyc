import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AccountGateProvider } from "@/components/AccountGate";
import { Suspended } from "@/components/Suspended";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PlayerProvider } from "@/lib/player";
import { registerPush } from "@/lib/push";
import { brand, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const crest = require("../../assets/cyc-crest.png");

/** Logo springs in on brand maroon, then the app fades in (Figma: Splash). */
function Splash({ done, onFinished }: { done: boolean; onFinished: () => void }) {
  const scale = useState(() => new Animated.Value(0.35))[0];
  const fade = useState(() => new Animated.Value(1))[0];
  const [sprung, setSprung] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start(() => setSprung(true));
  }, [scale]);

  useEffect(() => {
    if (!done || !sprung) return;
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(onFinished);
    }, 350);
    return () => clearTimeout(timer);
  }, [done, sprung, fade, onFinished]);

  return (
    <Animated.View style={{ position: "absolute", inset: 0, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center", opacity: fade }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={crest} style={{ width: 120, height: 130 }} resizeMode="contain" accessibilityLabel="CYC" />
      </Animated.View>
    </Animated.View>
  );
}

function RootNavigator() {
  const { status, ready, suspended } = useAuth();
  const t = useTheme();
  const [splashGone, setSplashGone] = useState(false);
  const signedIn = status === "signedIn";
  const guest = status === "guest";

  useEffect(() => {
    if (signedIn && ready) registerPush().catch(() => undefined);
  }, [signedIn, ready]);

  const nav = t.scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: t.bg, card: t.bg, primary: t.primary, text: t.text, border: t.border } }}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {status !== "loading" ? (
          suspended ? (
            <Suspended />
          ) : (
            <AccountGateProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Protected guard={!signedIn && !guest}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
                <Stack.Protected guard={signedIn && !ready}>
                  <Stack.Screen name="onboarding" />
                </Stack.Protected>
                <Stack.Protected guard={(signedIn && ready) || guest}>
                  <Stack.Screen name="(app)" />
                </Stack.Protected>
                <Stack.Screen name="verify" />
              </Stack>
            </AccountGateProvider>
          )
        ) : null}
        {!splashGone ? <Splash done={status !== "loading"} onFinished={() => setSplashGone(true)} /> : null}
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
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

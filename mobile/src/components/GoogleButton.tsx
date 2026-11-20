import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { T } from "@/components/ui";
import { radius, useTheme } from "@/lib/theme";

WebBrowser.maybeCompleteAuthSession();

/** OAuth client IDs from Google Cloud Console (see the README). */
const IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
};

/** Google sign-in is shown only when this platform has a client ID. */
export const googleConfigured = Boolean(Platform.select({ web: IDS.webClientId, ios: IDS.iosClientId, android: IDS.androidClientId }));

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

type Props = {
  label?: string;
  /** Called with Google's ID token; send it to the API. */
  onIdToken: (idToken: string) => Promise<void> | void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

function Inner({ label = "Continue with Google", onIdToken, onError, disabled }: Props) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: IDS.webClientId,
    webClientId: IDS.webClientId,
    iosClientId: IDS.iosClientId,
    androidClientId: IDS.androidClientId,
    selectAccount: true,
  });

  const start = async () => {
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type === "success" && result.params.id_token) await onIdToken(result.params.id_token);
      else if (result.type === "error") onError?.("Google sign-in didn't work. Please try again.");
    } catch {
      onError?.("Google sign-in didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!request || busy || disabled}
      onPress={start}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: t.c.outline,
        backgroundColor: pressed ? t.c.surfaceContainerHigh : t.c.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: !request || disabled ? 0.5 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={t.text} /> : <GoogleG />}
      <T variant="labelLarge">{label}</T>
    </Pressable>
  );
}

/** "Continue with Google". Renders nothing until client IDs are set. */
export function GoogleButton(props: Props) {
  if (!googleConfigured) return null;
  return <Inner {...props} />;
}

/** "or" between Google and the email form. */
export function OrDivider() {
  const t = useTheme();
  if (!googleConfigured) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.c.outlineVariant }} />
      <T variant="labelMedium" muted>
        or
      </T>
      <View style={{ flex: 1, height: 1, backgroundColor: t.c.outlineVariant }} />
    </View>
  );
}

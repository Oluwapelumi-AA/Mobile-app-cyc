import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button, Field, Header, IconTile, Screen, Snackbar, T, TextButton } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { goToStep } from "@/lib/authFlow";

/** Confirm the 6-digit code emailed after creating an account. */
export default function VerifyEmail() {
  const { email = "" } = useLocalSearchParams<{ email: string }>();
  const { verifyEmail, resendCode } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snack, setSnack] = useState<string | null>(null);
  const ready = /^\d{6}$/.test(code.trim());

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      goToStep(await verifyEmail(email, code.trim()), true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await resendCode(email);
      setSnack("We've sent a new code");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label="Confirm email" onPress={submit} disabled={!ready} loading={busy} />
            <View style={{ alignItems: "center" }}>
              <TextButton label="Didn't get it? Send again" onPress={resend} />
            </View>
          </View>
        }
      >
        <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} />
        <View style={{ alignItems: "center", marginTop: 12, marginBottom: 20 }}>
          <IconTile icon="mail" tint="green" size={96} />
        </View>
        <T variant="headlineMedium" center accessibilityRole="header">
          Confirm your email
        </T>
        <T variant="bodyLarge" muted center style={{ marginTop: 6, marginBottom: 24 }}>
          We&apos;ve sent a 6-digit code to {email}. It works for 15 minutes.
        </T>
        <Field
          label="6-digit code"
          icon="hash"
          value={code}
          onChangeText={(v) => (setCode(v.replace(/\D/g, "")), setError(""))}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onSubmitEditing={submit}
          error={error || undefined}
        />
        <T variant="bodySmall" muted center>
          Can&apos;t see it? Check your spam or promotions folder.
        </T>
        <Snackbar text={snack} onHide={() => setSnack(null)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

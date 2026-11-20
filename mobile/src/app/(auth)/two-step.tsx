import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, View } from "react-native";

import { Alert, Button, Card, Field, Header, IconTile, Row, Screen, Snackbar, T, TextButton } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { goToStep } from "@/lib/authFlow";
import { useTheme } from "@/lib/theme";

type Setup = { secret: string; otpauth_uri: string };
type Enabled = { access_token: string; refresh_token: string; recovery_codes: string[] };

/** Two-step sign-in: enter the authenticator code, or (admins signing in
 * for the first time) set it up. */
export default function TwoStep() {
  const t = useTheme();
  const { token = "", setup } = useLocalSearchParams<{ token: string; setup?: string }>();
  const { verifyMfa, acceptTokens } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState<Setup | null>(null);
  const [done, setDone] = useState<Enabled | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const settingUp = setup === "1";

  useEffect(() => {
    if (!settingUp) return;
    api<Setup>("/auth/mfa/setup", { method: "POST", body: { mfa_token: token }, auth: false })
      .then(setSecret)
      .catch((err) => setError(errorText(err)));
  }, [settingUp, token]);

  const valid = useRecovery ? code.trim().length >= 10 : /^\d{6}$/.test(code.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (settingUp) {
        const res = await api<Enabled>("/auth/mfa/enable", { method: "POST", body: { mfa_token: token, code: code.trim() }, auth: false });
        setDone(res);
        setBusy(false);
      } else {
        goToStep(await verifyMfa(token, code), true);
      }
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label="Copy codes" variant="outline" icon="copy" onPress={() => Clipboard.setStringAsync(done.recovery_codes.join("\n")).then(() => setSnack("Copied"))} />
            <Button label="I've saved them – continue" onPress={() => acceptTokens(done)} />
          </View>
        }
      >
        <Header title="Save your recovery codes" back={false} />
        <Alert tone="warning" text="If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe – they won't be shown again." />
        <Card style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {done.recovery_codes.map((c) => (
            <T key={c} variant="titleMedium" style={{ width: "46%", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}>
              {c}
            </T>
          ))}
        </Card>
        <Snackbar text={snack} onHide={() => setSnack(null)} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label={settingUp ? "Turn on and sign in" : "Sign in"} onPress={submit} disabled={!valid} loading={busy} />
            {!settingUp ? (
              <View style={{ alignItems: "center" }}>
                <TextButton
                  label={useRecovery ? "Use my authenticator app" : "Lost your phone? Use a recovery code"}
                  onPress={() => (setUseRecovery((r) => !r), setCode(""), setError(""))}
                />
              </View>
            ) : null}
          </View>
        }
      >
        <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} />
        <View style={{ alignItems: "center", marginTop: 8, marginBottom: 16 }}>
          <IconTile icon="shield" tint="yellow" size={88} />
        </View>
        <T variant="headlineMedium" center accessibilityRole="header">
          {settingUp ? "Set up two-step sign-in" : "Two-step sign-in"}
        </T>
        <T variant="bodyLarge" muted center style={{ marginTop: 6, marginBottom: 20 }}>
          {settingUp
            ? "Admins protect their accounts with a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar)."
            : useRecovery
              ? "Enter one of the recovery codes you saved when you turned on two-step sign-in."
              : "Enter the 6-digit code from your authenticator app."}
        </T>

        {settingUp && secret ? (
          <Card style={{ gap: 10, marginBottom: 20 }}>
            <T variant="titleSmall">1. Add CYC to your authenticator app</T>
            <Button label="Open authenticator app" variant="tonal" icon="external-link" onPress={() => Linking.openURL(secret.otpauth_uri).catch(() => setError("No authenticator app found. Add the key below by hand."))} />
            <T variant="bodySmall" muted>
              Or add this key by hand (time-based):
            </T>
            <Row gap={8} style={{ justifyContent: "space-between" }}>
              <T variant="titleSmall" selectable style={{ flex: 1, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), color: t.text }}>
                {secret.secret.match(/.{1,4}/g)?.join(" ")}
              </T>
              <TextButton label="Copy" onPress={() => Clipboard.setStringAsync(secret.secret).then(() => setSnack("Key copied"))} />
            </Row>
            <T variant="titleSmall" style={{ marginTop: 6 }}>
              2. Enter the 6-digit code it shows
            </T>
          </Card>
        ) : null}

        <Field
          label={useRecovery ? "Recovery code" : "6-digit code"}
          icon={useRecovery ? "lock" : "hash"}
          value={code}
          onChangeText={(v) => (setCode(useRecovery ? v : v.replace(/\D/g, "")), setError(""))}
          keyboardType={useRecovery ? "default" : "number-pad"}
          autoCapitalize="none"
          maxLength={useRecovery ? 11 : 6}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onSubmitEditing={submit}
          error={error || undefined}
        />
        <Snackbar text={snack} onHide={() => setSnack(null)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

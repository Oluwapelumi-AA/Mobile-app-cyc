import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

import { Button, Card, ErrorView, Field, Header, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** Two steps: email a 6-digit code, then set a new password with it. */
export default function ForgotPassword() {
  const t = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!email.includes("@")) throw new Error("Enter the email address you signed up with.");
      await api("/auth/password-reset/request", { method: "POST", body: { email: email.trim() }, auth: false });
      setStep("code");
    });

  const reset = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error("Enter the 6-digit code from the email.");
      if (password.length < 12) throw new Error("Your new password needs at least 12 characters.");
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: { email: email.trim(), code: code.trim(), new_password: password },
        auth: false,
      });
      setStep("done");
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Header />
        <T variant="h1" style={{ marginTop: 18 }}>
          {step === "done" ? "Password changed" : "Reset your password"}
        </T>
        <T variant="body" muted style={{ marginTop: 4, marginBottom: 22 }}>
          {step === "email"
            ? "We'll email you a 6-digit code."
            : step === "code"
              ? `If ${email.trim()} has a CYC account, a code is on its way. It works for 15 minutes.`
              : "You can now sign in with your new password."}
        </T>

        {step === "email" ? (
          <Field label="Email address" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" onSubmitEditing={sendCode} />
        ) : null}
        {step === "code" ? (
          <>
            <Field label="6-digit code" icon="hash" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
            <Field label="New password" icon="lock" secure value={password} onChangeText={setPassword} placeholder="At least 12 characters" onSubmitEditing={reset} />
          </>
        ) : null}
        {error ? <ErrorView message={error} /> : null}

        {step === "email" ? <Button label="Send code" onPress={sendCode} loading={busy} style={{ marginTop: 12 }} /> : null}
        {step === "code" ? (
          <>
            <Button label="Change password" onPress={reset} loading={busy} style={{ marginTop: 12 }} />
            <Button label="Send a new code" variant="outline" onPress={sendCode} style={{ marginTop: 12 }} />
          </>
        ) : null}
        {step === "done" ? (
          <>
            <Card bg={t.tints.green.bg} bordered={false}>
              <T variant="small" color={t.tints.green.fg}>
                For your security, you’ve been signed out on your other devices.
              </T>
            </Card>
            <Button label="Sign in" onPress={() => router.replace("/sign-in")} style={{ marginTop: 18 }} />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

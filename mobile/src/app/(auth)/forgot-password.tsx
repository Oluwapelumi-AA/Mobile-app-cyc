import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Alert, Button, Field, Header, IconTile, Screen, T, TextButton } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Step = "email" | "sent" | "password" | "done";

/**
 * Recovery path (Figma R2–R5): reset password → check your email → create a
 * new password → password updated. CYC emails a 6-digit code rather than a
 * link, so "Check your email" asks for the code.
 */
export default function ForgotPassword() {
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

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
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter the email address you signed up with.");
      await api("/auth/password-reset/request", { method: "POST", body: { email: email.trim() }, auth: false });
      setStep("sent");
    });

  const save = () =>
    run(async () => {
      setTouched(true);
      if (password.length < 12) throw new Error("Use at least 12 characters.");
      if (password !== confirm) throw new Error("The two passwords don't match.");
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: { email: email.trim(), code: code.trim(), new_password: password },
        auth: false,
      });
      setStep("done");
    });

  const back = () => (step === "email" || step === "done" ? router.back() : setStep(step === "password" ? "sent" : "email"));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            {step === "email" ? <Button label="Send reset code" onPress={sendCode} loading={busy} disabled={!email.trim()} /> : null}
            {step === "sent" ? (
              <>
                <Button label="Continue" disabled={!/^\d{6}$/.test(code.trim())} onPress={() => setStep("password")} />
                <View style={{ alignItems: "center" }}>
                  <TextButton label="Didn't get it? Send again" onPress={sendCode} />
                </View>
              </>
            ) : null}
            {step === "password" ? <Button label="Update password" onPress={save} loading={busy} disabled={!password || !confirm} /> : null}
            {step === "done" ? (
              <Button
                label="Continue to Home"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await signIn(email, password);
                  })
                }
              />
            ) : null}
          </View>
        }
      >
        <Header onBack={back} back={step !== "done"} />

        {step === "email" ? (
          <>
            <T variant="headlineMedium" accessibilityRole="header">
              Reset your password
            </T>
            <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 24 }}>
              Enter your email and we&apos;ll send you a code to choose a new password.
            </T>
            <Field label="Email address" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" onSubmitEditing={sendCode} />
          </>
        ) : null}

        {step === "sent" ? (
          <>
            <View style={{ alignItems: "center", marginTop: 12, marginBottom: 20 }}>
              <IconTile icon="mail" tint="green" size={96} />
            </View>
            <T variant="headlineMedium" center accessibilityRole="header">
              Check your email
            </T>
            <T variant="bodyLarge" muted center style={{ marginTop: 6, marginBottom: 24 }}>
              If {email.trim()} has a CYC account, we&apos;ve sent a 6-digit code. It works for 15 minutes.
            </T>
            <Field label="6-digit code" icon="hash" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
            <T variant="bodySmall" muted center>
              Can&apos;t see it? Check your spam folder.
            </T>
          </>
        ) : null}

        {step === "password" ? (
          <>
            <T variant="headlineMedium" accessibilityRole="header">
              Create a new password
            </T>
            <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 24 }}>
              Type it twice so typos are caught.
            </T>
            <Field label="New password" icon="lock" secure value={password} onChangeText={setPassword} hint="At least 12 characters" error={touched && password.length < 12 ? "Use at least 12 characters." : undefined} />
            <Field
              label="Confirm new password"
              icon="lock"
              secure
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={save}
              error={touched && confirm && confirm !== password ? "The two passwords don't match." : undefined}
            />
          </>
        ) : null}

        {step === "done" ? (
          <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
            <IconTile icon="check-circle" tint="green" size={96} />
            <T variant="headlineMedium" center accessibilityRole="header">
              Password updated
            </T>
            <T variant="bodyLarge" muted center>
              You&apos;re all set. For your security we&apos;ve signed you out on your other devices.
            </T>
          </View>
        ) : null}

        {error ? (
          <View style={{ marginTop: 12 }}>
            <Alert tone="error" text={error} />
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

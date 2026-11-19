import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { StepHeader } from "@/components/StepIndicator";
import { Alert, Button, Field, Screen, T } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ABOUT } from "@/lib/content";
import { type, useTheme } from "@/lib/theme";

/** Onboarding step 1 of 5: Create account. */
export default function SignUp() {
  const t = useTheme();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = touched && !name.trim() ? "Tell us your name." : undefined;
  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter a valid email address." : undefined;
  const passwordError = touched && password.length < 12 ? "Use at least 12 characters." : undefined;

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 12) return;
    setBusy(true);
    setError("");
    try {
      await signUp(name, email, password);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const link = (label: string, url: string | null) => (
    <Text style={[type.bodySmall, { color: t.primary, textDecorationLine: "underline" }]} onPress={url ? () => WebBrowser.openBrowserAsync(url) : undefined}>
      {label}
    </Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
            <Button label="Create account" onPress={submit} loading={busy} />
            <Text style={[type.bodySmall, { color: t.textMuted, textAlign: "center" }]}>
              By continuing you agree to CYC&apos;s {link("Terms of use", ABOUT.termsUrl)} and {link("Privacy policy", ABOUT.privacyPolicyUrl)}.
            </Text>
          </View>
        }
      >
        <StepHeader step={1} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <T variant="headlineMedium" style={{ marginTop: 16 }} accessibilityRole="header">
          Create your account
        </T>
        <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 20 }}>
          It&apos;s free and takes a minute.
        </T>
        <Field label="Full name" icon="user" value={name} onChangeText={setName} placeholder="Ada Okafor" autoComplete="name" autoCapitalize="words" error={nameError} />
        <Field
          label="Email address"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="ada@mail.com"
          error={emailError}
        />
        <Field
          label="Password"
          icon="lock"
          secure
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          error={passwordError}
          hint="At least 12 characters. A short phrase works well."
          onSubmitEditing={submit}
        />
        {error ? <Alert tone="error" text={error} /> : null}
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Button label="I already have an account" variant="text" full={false} onPress={() => router.replace("/sign-in")} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

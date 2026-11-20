import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button, Field, Header, LoadingBar, Screen, T, TextButton } from "@/components/ui";
import { ApiError, errorText } from "@/lib/api";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { useAuth } from "@/lib/auth";
import { goToStep } from "@/lib/authFlow";

/** Sign in (Figma: Sign in – empty / details entered / signing in / error). */
export default function SignIn() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wrongDetails, setWrongDetails] = useState(false);
  const filled = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!filled || busy) return;
    setBusy(true);
    setError("");
    setWrongDetails(false);
    try {
      const step = await signIn(email, password);
      if (step.kind !== "done") setBusy(false);
      goToStep(step);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setWrongDetails(true);
      else if (err instanceof ApiError && err.code === "account_locked") setError(err.message);
      else setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {busy ? <LoadingBar /> : null}
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={!filled} loading={busy} />
            <View style={{ alignItems: "center" }}>
              <TextButton label="New to CYC? Create account" onPress={() => router.replace("/sign-up")} />
            </View>
          </View>
        }
      >
        <Header />
        <T variant="headlineMedium" accessibilityRole="header">
          Welcome back
        </T>
        <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 24 }}>
          Sign in to pick up where you left off.
        </T>
        <GoogleButton
          disabled={busy}
          onError={setError}
          onIdToken={async (idToken) => {
            setError("");
            try {
              goToStep(await signInWithGoogle(idToken));
            } catch (err) {
              setError(errorText(err));
            }
          }}
        />
        <OrDivider />
        <Field
          label="Email address"
          icon="mail"
          value={email}
          onChangeText={(v) => (setEmail(v), setWrongDetails(false))}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="ada@mail.com"
          editable={!busy}
        />
        <Field
          label="Password"
          icon="lock"
          secure
          value={password}
          onChangeText={(v) => (setPassword(v), setWrongDetails(false))}
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
          editable={!busy}
          error={wrongDetails ? "That email and password don't match. Check them, or reset your password." : undefined}
        />
        {error ? (
          <T variant="bodyMedium" color="#BA1A1A" style={{ marginBottom: 8 }}>
            {error}
          </T>
        ) : null}
        <View style={{ alignItems: "flex-end" }}>
          <TextButton label="Forgot password?" underline={wrongDetails} onPress={() => router.push({ pathname: "/forgot-password", params: { email } })} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

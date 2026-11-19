import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button, ErrorView, Field, Header, Screen, Spacer, T, TextButton } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email address and password.");
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen scroll={false} edges={["top", "bottom"]}>
        <Header />
        <View style={{ flex: 1 }}>
          <T variant="h1" style={{ marginTop: 18 }}>
            Welcome back
          </T>
          <T variant="body" muted style={{ marginTop: 4, marginBottom: 22 }}>
            Sign in to pick up where you left off.
          </T>
          <Field
            label="Email address"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="ada@mail.com"
          />
          <Spacer h={6} />
          <Field
            label="Password"
            icon="lock"
            secure
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <View style={{ alignItems: "flex-end", marginTop: 10 }}>
            <TextButton label="Forgot password?" onPress={() => router.push({ pathname: "/forgot-password", params: { email } })} />
          </View>
          {error ? <ErrorView message={error} /> : null}
        </View>
        <View style={{ gap: 18, paddingBottom: 12 }}>
          <Button label="Sign in" onPress={submit} loading={busy} />
          <View style={{ alignItems: "center" }}>
            <TextButton label="New to CYC? Create account" onPress={() => router.replace("/sign-up")} />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

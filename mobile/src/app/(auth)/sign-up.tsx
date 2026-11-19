import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button, ErrorView, Field, Header, Screen, T, TextButton } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { local } from "@/lib/storage";

export default function SignUp() {
  const { guest } = useLocalSearchParams<{ guest?: string }>();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 12) return setError("Your password needs at least 12 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError("");
    try {
      // Guests explore CYC without choosing a chapter; they can join one later.
      await local.setJSON("cyc.guest", guest === "1");
      await signUp(email, password);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Header />
        <T variant="h1" style={{ marginTop: 18 }}>
          {guest === "1" ? "Look around CYC" : "Create your account"}
        </T>
        <T variant="body" muted style={{ marginTop: 4, marginBottom: 22 }}>
          {guest === "1"
            ? "A free account lets you browse sermons, courses and events. You can join a chapter any time."
            : "Join your chapter, take courses and never miss an event."}
        </T>
        <Field
          label="Email address"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="ada@mail.com"
        />
        <Field label="Password" icon="lock" secure value={password} onChangeText={setPassword} autoComplete="new-password" placeholder="At least 12 characters" />
        <Field label="Confirm password" icon="lock" secure value={confirm} onChangeText={setConfirm} autoComplete="new-password" onSubmitEditing={submit} />
        {error ? <ErrorView message={error} /> : null}
        <View style={{ gap: 18, marginTop: 18 }}>
          <Button label="Create account" onPress={submit} loading={busy} />
          <View style={{ alignItems: "center" }}>
            <TextButton label="Already have an account? Sign in" onPress={() => router.replace("/sign-in")} />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

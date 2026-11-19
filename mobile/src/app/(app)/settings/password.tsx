import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

import { notify } from "@/components/cards";
import { Button, ErrorView, Field, Header, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";

export default function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (next.length < 12) return setError("Your new password needs at least 12 characters.");
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    setError("");
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
      notify("Password changed", "You've been signed out on your other devices.");
      router.back();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Header title="Password" />
        <T variant="small" muted style={{ marginBottom: 18 }}>
          If an admin gave you a temporary password, change it here.
        </T>
        <Field label="Current password" icon="lock" secure value={current} onChangeText={setCurrent} autoComplete="current-password" />
        <Field label="New password" icon="lock" secure value={next} onChangeText={setNext} autoComplete="new-password" placeholder="At least 12 characters" />
        <Field label="Confirm new password" icon="lock" secure value={confirm} onChangeText={setConfirm} autoComplete="new-password" onSubmitEditing={save} />
        {error ? <ErrorView message={error} /> : null}
        <Button label="Change password" onPress={save} loading={busy} style={{ marginTop: 10 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

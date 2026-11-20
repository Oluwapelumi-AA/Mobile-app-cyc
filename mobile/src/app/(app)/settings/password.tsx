import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { notify } from "@/components/cards";
import { Button, Field, Header, Icon, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/** Change password (Figma: Settings – Password). */
export default function Password() {
  const t = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { reload } = useAuth();
  const adding = mode === "set";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "current" | "next" | "confirm"; text: string } | null>(null);

  const rules = [
    { ok: next.length >= 12, text: "At least 12 characters" },
    { ok: /[A-Za-z]/.test(next) && /\d/.test(next), text: "Letters and numbers" },
    ...(adding ? [] : [{ ok: next.length > 0 && next !== current, text: "Different from your current password" }]),
  ];
  const ready = (adding || current.length > 0) && rules.every((r) => r.ok) && confirm.length > 0;

  const save = async () => {
    if (next !== confirm) return setError({ field: "confirm", text: "The new passwords don’t match." });
    setBusy(true);
    setError(null);
    try {
      if (adding) {
        await api("/auth/set-password", { method: "POST", body: { new_password: next } });
        await reload();
        notify("Password added", "You can now also sign in with your email and password.");
      } else {
        await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
        notify("Password changed", "You’ve been signed out on your other devices.");
      }
      router.back();
    } catch (err) {
      const text = errorText(err);
      setError({ field: /current|wrong/i.test(text) ? "current" : "next", text });
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Button label={adding ? "Add password" : "Update password"} onPress={save} loading={busy} disabled={!ready} />
          </View>
        }
      >
        <Header title={adding ? "Add a password" : "Password"} subtitle={adding ? "Sign in with email and password as well as Google." : "Changing it signs you out on your other devices."} />
        {adding ? null : <Field label="Current password" icon="lock" secure value={current} onChangeText={setCurrent} autoComplete="current-password" error={error?.field === "current" ? error.text : undefined} />}
        <Field label="New password" icon="lock" secure value={next} onChangeText={setNext} autoComplete="new-password" error={error?.field === "next" ? error.text : undefined} />
        <View style={{ gap: 6, marginTop: -4, marginBottom: 18, paddingHorizontal: 8 }}>
          {rules.map((r) => (
            <Row key={r.text} gap={8}>
              <Icon name={r.ok ? "check-circle" : "circle"} size={16} color={r.ok ? t.c.tertiary : t.textMuted} weight={r.ok ? "fill" : "regular"} />
              <T variant="bodySmall" color={r.ok ? t.text : t.textMuted}>
                {r.text}
              </T>
            </Row>
          ))}
        </View>
        <Field label="Confirm new password" icon="lock" secure value={confirm} onChangeText={setConfirm} autoComplete="new-password" onSubmitEditing={ready ? save : undefined} error={error?.field === "confirm" ? error.text : undefined} />
        <T variant="bodySmall" muted>
          Forgot your current password? Sign out, then tap “Forgot password?” on the sign-in screen.
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}

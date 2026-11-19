import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

import { notify } from "@/components/cards";
import { Avatar, Button, Card, Field, Header, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function EditProfile() {
  const { profile, user, reload } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return notify("Your name can't be empty");
    setBusy(true);
    try {
      await api("/profiles/me", { method: "PATCH", body: { display_name: name.trim(), bio: bio.trim() || null } });
      await reload();
      router.back();
    } catch (err) {
      notify("Couldn't save", errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Header title="Edit profile" />
        <Card style={{ alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Avatar name={name || "?"} size={72} />
          <T variant="caption" muted>
            {user?.email}
          </T>
        </Card>
        <Field label="Name" icon="user" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="About you" icon="edit-3" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="A line or two other members will see" />
        <Row style={{ marginTop: 8 }}>
          <Button label="Save" onPress={save} loading={busy} />
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}

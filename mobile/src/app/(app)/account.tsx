import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Alert, Dialog, Field, Header, ListGroup, ListRow, Screen, SectionHeader, T } from "@/components/ui";
import { api, clearTokens, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/** Account (Figma: Account & settings). */
export default function Account() {
  const t = useTheme();
  const { user, membership, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError("");
    try {
      await api("/auth/delete-account", { method: "POST", body: { password } });
      await clearTokens();
      await signOut();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Account" />

      <SectionHeader title="Sign-in" style={{ marginTop: 4 }} />
      <ListGroup>
        <ListRow icon="mail" iconCircle label="Email" sublabel={user?.email} chevron={false} />
        <ListRow icon="lock" iconCircle label="Password" sublabel="Change your password" onPress={() => router.push("/settings/password")} />
      </ListGroup>

      <SectionHeader title="Membership" />
      <ListGroup>
        <ListRow
          icon="church"
          iconCircle
          label={membership?.chapter_name ? `You’re in ${membership.chapter_name}` : "No chapter yet"}
          sublabel={membership?.chapter_name ? "Your chapter" : "Find a chapter to join"}
          onPress={() => router.push(membership?.chapter_id ? `/chapter/${membership.chapter_id}` : "/find-chapter")}
        />
        <ListRow icon="users" iconCircle label={membership?.department_name ?? "No department"} sublabel="Department · change or leave" onPress={() => router.push("/departments")} />
        <ListRow icon="heart" iconCircle label="Interest groups" sublabel="Groups you’ve joined" onPress={() => router.push("/interest-groups")} />
      </ListGroup>
      {membership?.chapter_id ? (
        <T variant="bodySmall" muted style={{ marginTop: 8 }}>
          Chapter membership is permanent. If you’ve moved, contact your chapter coordinator or CYC support.
        </T>
      ) : null}

      <SectionHeader title="Settings" />
      <ListGroup>
        <ListRow icon="bell" iconCircle label="Notifications" onPress={() => router.push("/notification-settings")} />
        <ListRow icon="translate" iconCircle label="Language" value="English" onPress={() => router.push("/settings/language")} />
        <ListRow icon="shield" iconCircle label="Privacy" onPress={() => router.push("/settings/privacy")} />
        <ListRow icon="map-pin" iconCircle label="Location" onPress={() => router.push("/settings/location")} />
        <ListRow icon="download" iconCircle label="Downloads" onPress={() => router.push("/downloads")} />
        <ListRow icon="seal-check" iconCircle label="Verify a certificate" onPress={() => router.push("/verify")} />
        <ListRow icon="info" iconCircle label="About CYC" onPress={() => router.push("/about")} />
      </ListGroup>

      <View style={{ height: 20 }} />
      <ListGroup>
        <ListRow icon="log-out" iconCircle label="Sign out" chevron={false} onPress={() => setConfirmOut(true)} />
        <ListRow icon="trash" iconCircle label="Delete account" danger chevron={false} onPress={() => setDeleting(true)} />
      </ListGroup>

      <Dialog visible={confirmOut} icon="log-out" title="Sign out?" text="You can sign back in any time with your email and password." confirm="Sign out" onConfirm={() => void signOut()} onCancel={() => setConfirmOut(false)} />
      <Dialog
        visible={deleting}
        icon="trash"
        danger
        title="Delete your account?"
        confirm="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => (setDeleting(false), setPassword(""), setError(""))}
      >
        <Alert tone="error" text="This permanently deletes your profile, progress, certificates and saved items. Your posts stay, shown as “Deleted user”. This can’t be undone." />
        <Field label="Password" icon="lock" secure value={password} onChangeText={setPassword} error={error || undefined} />
        <T variant="bodySmall" color={t.textMuted}>
          Enter your password to confirm.
        </T>
      </Dialog>
    </Screen>
  );
}

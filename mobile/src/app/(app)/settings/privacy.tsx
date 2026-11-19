import { useState } from "react";

import { Button, Card, ErrorView, Field, Header, ListGroup, ListRow, Screen, T } from "@/components/ui";
import { api, clearTokens, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/** What others can see, and deleting the account (required by the app stores). */
export default function Privacy() {
  const t = useTheme();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <Header title="Privacy" />
      <T variant="h3" style={{ marginBottom: 10 }}>
        What other members see
      </T>
      <ListGroup>
        <ListRow icon="user" label="Your name, photo and bio" chevron={false} />
        <ListRow icon="home" label="Your chapter and department" chevron={false} />
        <ListRow icon="message-circle" label="Posts and comments in your chapter" chevron={false} />
      </ListGroup>
      <T variant="caption" muted style={{ marginTop: 8 }}>
        Your email address is only visible to your chapter’s coordinator and CYC admins.
      </T>

      <T variant="h3" style={{ marginTop: 26, marginBottom: 10 }}>
        Delete account
      </T>
      {!deleting ? (
        <Card style={{ gap: 12 }}>
          <T variant="small" muted>
            This permanently deletes your profile, progress and saved items, and signs you out everywhere. Your posts stay, shown as “Deleted user”.
          </T>
          <Button label="Delete my account" variant="outline" onPress={() => setDeleting(true)} style={{ borderColor: t.danger }} />
        </Card>
      ) : (
        <Card bg={t.tints.pink.bg} bordered={false} style={{ gap: 6 }}>
          <T variant="title" color={t.tints.pink.fg}>
            This can’t be undone
          </T>
          <T variant="small" color={t.tints.pink.fg} style={{ marginBottom: 8 }}>
            Enter your password to delete your account.
          </T>
          <Field label="Password" icon="lock" secure value={password} onChangeText={setPassword} />
          {error ? <ErrorView message={error} /> : null}
          <Button label="Delete my account" onPress={remove} loading={busy} />
          <Button label="Cancel" variant="outline" onPress={() => (setDeleting(false), setPassword(""), setError(""))} style={{ marginTop: 8 }} />
        </Card>
      )}
    </Screen>
  );
}

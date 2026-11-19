import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, Pressable, View } from "react-native";

import { Avatar, Button, Card, Header, Icon, IconButton, IconName, ListGroup, ListRow, Row, Screen, T } from "@/components/ui";
import { apiAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGUAGE_NAMES } from "@/lib/format";
import { Tint, useTheme } from "@/lib/theme";
import type { Certificate, Course, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function Stat({ value, label, icon, tint, onPress }: { value: string; label: string; icon: IconName; tint: Tint; onPress: () => void }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: c.bg, borderRadius: 16, padding: 12, gap: 8, minHeight: 104 }}>
      <Icon name={icon} size={18} color={c.fg} />
      <T variant="h2" color={c.fg}>
        {value}
      </T>
      <T variant="caption" color={c.fg}>
        {label}
      </T>
    </Pressable>
  );
}

function Chipish({ icon, label }: { icon: IconName; label: string }) {
  const t = useTheme();
  return (
    <Row gap={6} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Icon name={icon} size={13} color={t.textMuted} />
      <T variant="caption">{label}</T>
    </Row>
  );
}

export default function Profile() {
  const { user, profile, membership, signOut } = useAuth();
  const q = useApi(async () => {
    const [courses, certs, saved] = await Promise.all([
      apiAll<Course>("/courses", { enrolled: true }).catch(() => [] as Course[]),
      apiAll<Certificate>("/courses/certificates").catch(() => [] as Certificate[]),
      apiAll<Resource>("/resources/bookmarks").catch(() => [] as Resource[]),
    ]);
    return { inProgress: courses.filter((c) => !c.completed_at).length, certificates: certs.length, saved: saved.length };
  });

  const name = profile?.display_name ?? "";
  const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Profile" right={<IconButton icon="settings" label="Notification settings" bordered onPress={() => router.push("/notification-settings")} />} />

      <Card style={{ gap: 14 }}>
        <Row gap={14}>
          <Avatar name={name} size={58} />
          <View style={{ flex: 1 }}>
            <T variant="h2" numberOfLines={1}>
              {name}
            </T>
            <T variant="small" muted numberOfLines={1}>
              {user?.email}
            </T>
          </View>
        </Row>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Chipish icon="home" label={membership?.chapter_name ?? "No chapter yet"} />
          {membership?.department_name ? <Chipish icon="users" label={membership.department_name} /> : null}
        </Row>
        <Button label="Edit profile" icon="edit-2" variant="outline" onPress={() => router.push("/edit-profile")} />
      </Card>

      <T variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>
        My activity
      </T>
      <Row gap={10} style={{ alignItems: "stretch" }}>
        <Stat value={n(q.data?.inProgress)} label={q.data?.inProgress === 1 ? "Course in progress" : "Courses in progress"} icon="book" tint="green" onPress={() => router.push("/learn/courses")} />
        <Stat value={n(q.data?.certificates)} label="Certificates" icon="award" tint="yellow" onPress={() => router.push("/certificates")} />
        <Stat value={n(q.data?.saved)} label="Saved" icon="bookmark" tint="pink" onPress={() => router.push("/saved")} />
      </Row>

      <T variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>
        Settings
      </T>
      <ListGroup>
        <ListRow icon="bell" label="Notifications" onPress={() => router.push("/notification-settings")} />
        <ListRow icon="globe" label="Language" value={LANGUAGE_NAMES[profile?.language_code ?? "en"] ?? profile?.language_code ?? "English"} onPress={() => router.push("/settings/language")} />
        <ListRow icon="shield" label="Privacy" onPress={() => router.push("/settings/privacy")} />
        <ListRow icon="lock" label="Password" onPress={() => router.push("/settings/password")} />
        <ListRow icon="map-pin" label="Location" value={profile?.city ?? undefined} onPress={() => router.push("/settings/location")} />
        <ListRow icon="download" label="Downloads" onPress={() => router.push("/downloads")} />
      </ListGroup>

      <T variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>
        Support
      </T>
      <ListGroup>
        <ListRow icon="help-circle" label="Help & feedback" onPress={() => Linking.openURL("mailto:support@cyc.org?subject=CYC%20app%20feedback")} />
        <ListRow icon="info" label="About CYC" onPress={() => router.push("/about")} />
      </ListGroup>

      <View style={{ height: 14 }} />
      <ListGroup>
        <ListRow icon="log-out" label="Sign out" danger chevron={false} onPress={signOut} />
      </ListGroup>
      <T variant="caption" muted center style={{ marginTop: 14 }}>
        CYC · Version {Constants.expoConfig?.version ?? "1.0.0"}
      </T>
    </Screen>
  );
}

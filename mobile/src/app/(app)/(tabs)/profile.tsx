import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";

import { Avatar, Blob, Button, Card, Dialog, Header, Icon, IconButton, IconName, ListGroup, ListRow, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api, apiAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CYC_CONTACT } from "@/lib/content";
import { LANGUAGE_NAMES } from "@/lib/format";
import { brand, radius, Tint, useTheme } from "@/lib/theme";
import type { Certificate, Course, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const crest = require("../../../../assets/cyc-crest.png");

function Stat({ value, label, icon, tint, onPress }: { value: string; label: string; icon: IconName; tint: Tint; onPress: () => void }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`} style={{ flex: 1, backgroundColor: c.bg, borderRadius: radius.xl, padding: 14, gap: 6, minHeight: 136 }}>
      <Icon name={icon} size={22} color={c.fg} />
      <T variant="headlineSmall" color={c.fg} style={{ marginTop: 6 }}>
        {value}
      </T>
      <T variant="labelLarge" color={c.fg}>
        {label}
      </T>
    </Pressable>
  );
}

function Pill({ icon, label }: { icon: IconName; label: string }) {
  const t = useTheme();
  return (
    <Row gap={6} style={{ backgroundColor: t.c.surfaceContainerHigh, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Icon name={icon} size={16} color={t.textMuted} />
      <T variant="labelLarge">{label}</T>
    </Row>
  );
}

function SupportRows() {
  return (
    <ListGroup>
      <ListRow icon="help" label="Help & feedback" onPress={() => Linking.openURL(`mailto:${CYC_CONTACT.email}?subject=CYC%20app%20feedback`)} />
      <ListRow icon="info" label="About CYC" onPress={() => router.push("/about")} />
    </ListGroup>
  );
}

/** Profile for guests: a calm invitation (Figma: Guest Profile). */
function GuestProfile() {
  const t = useTheme();
  const { leaveGuest } = useAuth();
  return (
    <Screen>
      <Header back={false} title="Profile" />
      <View style={{ backgroundColor: brand.maroon, borderRadius: radius.xxl, padding: 24, overflow: "hidden", gap: 12 }}>
        <Blob size={170} color={brand.gold} right={-70} top={-70} />
        <Image source={crest} style={{ width: 40, height: 44 }} resizeMode="contain" />
        <T variant="headlineSmall" color="#FFFFFF" style={{ paddingRight: 50 }}>
          Make CYC yours
        </T>
        <T variant="bodyMedium" color="#FFFFFF">
          Create a free account to join your chapter, save sermons, track your courses and earn certificates.
        </T>
        <Button label="Create a free account" variant="gold" onPress={() => (leaveGuest(), setTimeout(() => router.push("/sign-up"), 60))} />
        <Button label="I already have an account" variant="outlineLight" onPress={() => (leaveGuest(), setTimeout(() => router.push("/sign-in"), 60))} />
      </View>
      <SectionHeader title="Support" />
      <SupportRows />
      <T variant="bodySmall" muted center style={{ marginTop: 20, color: t.textMuted }}>
        CYC Light · Version {Constants.expoConfig?.version ?? "1.0.0"}
      </T>
    </Screen>
  );
}

export default function Profile() {
  const { isGuest } = useAuth();
  return isGuest ? <GuestProfile /> : <MemberProfile />;
}

function MemberProfile() {
  const t = useTheme();
  const { user, profile, membership, signOut } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useApi(async () => {
    const [courses, certs, saved] = await Promise.all([
      apiAll<Course>("/courses", { enrolled: true }).catch(() => [] as Course[]),
      api<Certificate[]>("/certificates/mine").catch(() => [] as Certificate[]),
      apiAll<Resource>("/resources/bookmarks").catch(() => [] as Resource[]),
    ]);
    return { inProgress: courses.filter((c) => !c.completed_at).length, certificates: certs.length, saved: saved.length };
  });

  const name = profile?.display_name ?? "";
  const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Profile" right={<IconButton icon="settings" label="Account settings" tonal onPress={() => router.push("/account")} />} />

      <Card style={{ gap: 16, padding: 20 }}>
        <Row gap={16}>
          <Avatar name={name} size={72} uri={profile?.avatar_url} />
          <View style={{ flex: 1 }}>
            <T variant="headlineSmall" numberOfLines={1}>
              {name}
            </T>
            <T variant="bodyMedium" muted numberOfLines={1}>
              {user?.email}
            </T>
          </View>
        </Row>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Pill icon="church" label={membership?.chapter_name ?? "No chapter yet"} />
          {membership?.department_name ? <Pill icon="users" label={membership.department_name} /> : null}
        </Row>
        <Button label="Edit profile" icon="edit" variant="outline" onPress={() => router.push("/edit-profile")} />
      </Card>

      <SectionHeader title="My activity" action="See all" onAction={() => router.push("/my-activity")} />
      <Row gap={10} style={{ alignItems: "stretch" }}>
        <Stat value={n(q.data?.inProgress)} label={q.data?.inProgress === 1 ? "Course in progress" : "Courses in progress"} icon="book" tint="green" onPress={() => router.push("/learn/courses")} />
        <Stat value={n(q.data?.certificates)} label="Certificates" icon="certificate" tint="yellow" onPress={() => router.push("/certificates")} />
        <Stat value={n(q.data?.saved)} label="Saved" icon="bookmark" tint="pink" onPress={() => router.push("/saved")} />
      </Row>

      <SectionHeader title="Settings" />
      <ListGroup>
        <ListRow icon="bell" label="Notifications" onPress={() => router.push("/notification-settings")} />
        <ListRow icon="translate" label="Language" value={LANGUAGE_NAMES[profile?.language_code ?? "en"] ?? "English"} onPress={() => router.push("/settings/language")} />
        <ListRow icon="shield" label="Privacy" onPress={() => router.push("/settings/privacy")} />
        <ListRow icon="lock" label="Password" onPress={() => router.push("/settings/password")} />
        <ListRow icon="map-pin" label="Location" value={profile?.city ?? undefined} onPress={() => router.push("/settings/location")} />
        <ListRow icon="download" label="Downloads" onPress={() => router.push("/downloads")} />
      </ListGroup>

      <SectionHeader title="Support" />
      <SupportRows />

      <View style={{ height: 16 }} />
      <ListGroup>
        <ListRow icon="log-out" label="Sign out" labelColor={t.scheme === "dark" ? "#FFB68A" : "#9C4100"} chevron={false} onPress={() => setConfirmSignOut(true)} />
      </ListGroup>
      <T variant="bodySmall" muted center style={{ marginTop: 16 }}>
        CYC Light · Version {Constants.expoConfig?.version ?? "1.0.0"}
      </T>

      <Dialog
        visible={confirmSignOut}
        icon="log-out"
        title="Sign out of CYC Light?"
        text="You can sign back in any time with your email and password. Downloads stay on this phone."
        confirm="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </Screen>
  );
}

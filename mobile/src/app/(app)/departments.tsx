import { router } from "expo-router";
import { View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { tintFor } from "@/components/cards";
import { Alert, Badge, Button, Card, EmptyState, ErrorView, Header, IconTile, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Department } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Departments (Figma: Departments – Light). One at a time; joining is instant. */
export default function Departments() {
  const { membership, isGuest } = useAuth();
  const gate = useAccountGate();
  const q = useApi(() => api<Department[]>("/departments"));
  const mine = (q.data ?? []).find((d) => d.id === membership?.department_id);
  const others = (q.data ?? []).filter((d) => d.id !== membership?.department_id);
  const isMember = membership?.membership_status === "member";

  const open = (d: Department) => router.push({ pathname: "/department/[id]", params: { id: d.id } });

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Departments" subtitle="Departments are how members serve in CYC. You can be in one at a time, and switch whenever you like." />
      {!isGuest && !isMember ? <Alert tone="warning" text="Join a chapter first, then you can join a department." /> : null}
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load departments" /> : null}

      {mine ? (
        <>
          <SectionHeader title="Yours" />
          <Card onPress={() => open(mine)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconTile icon="users" tint="pink" size={48} />
            <View style={{ flex: 1 }}>
              <T variant="titleMedium">{mine.name}</T>
              <T variant="bodySmall" muted numberOfLines={2}>
                {mine.description ?? `${mine.member_count} members`}
              </T>
            </View>
            <Badge label="Member" icon="check" />
          </Card>
        </>
      ) : null}

      {others.length ? (
        <>
          <SectionHeader title={membership?.chapter_name ? `In ${membership.chapter_name}` : "All departments"} />
          <View style={{ gap: 10 }}>
            {others.map((d, i) => (
              <Card key={d.id} onPress={() => open(d)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <IconTile icon="users" tint={tintFor(i)} size={48} />
                <View style={{ flex: 1 }}>
                  <T variant="titleMedium">{d.name}</T>
                  <T variant="bodySmall" muted numberOfLines={2}>
                    {[d.description, `${d.member_count} ${d.member_count === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}
                  </T>
                </View>
                <Button label={mine ? "Switch" : "Join"} small full={false} variant="outline" onPress={() => (gate() ? open(d) : undefined)} />
              </Card>
            ))}
          </View>
        </>
      ) : null}
      {q.data && !q.data.length ? <EmptyState icon="users" title="No departments yet" text="Your admins haven't added any departments." /> : null}
      <Row style={{ height: 8 }}>{null}</Row>
    </Screen>
  );
}

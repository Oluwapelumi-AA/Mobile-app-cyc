import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { notify } from "@/components/cards";
import { Alert, Badge, Blob, Button, Dialog, ErrorView, Header, HeroTag, ListGroup, ListRow, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { radius, useTheme } from "@/lib/theme";
import type { Department } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** One department (Figma: Department – Request sent). Joining is instant here. */
export default function DepartmentScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership, reload } = useAuth();
  const gate = useAccountGate();
  const q = useApi(async () => (await api<Department[]>("/departments")).find((d) => d.id === id) ?? null, [id]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"switch" | "leave" | null>(null);
  const d = q.data;
  const mine = membership?.department_id === id;
  const isMember = membership?.membership_status === "member";

  const act = async (leave: boolean) => {
    setBusy(true);
    try {
      if (leave) await api("/me/department", { method: "DELETE" });
      else await api("/me/department", { method: "PUT", body: { department_id: id } });
      await reload();
      q.reload();
      setConfirm(null);
    } catch (err) {
      notify("Couldn't update", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        d && isMember ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            {mine ? (
              <Button label="Leave department" variant="outline" onPress={() => setConfirm("leave")} />
            ) : (
              <Button label={membership?.department_id ? `Switch to ${d.name}` : "Join department"} loading={busy} onPress={() => (membership?.department_id ? setConfirm("switch") : act(false))} />
            )}
          </View>
        ) : d && !isMember ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Button label="Join department" onPress={() => gate() && notify("Join a chapter first", "Members of a chapter can join its departments.")} />
          </View>
        ) : null
      }
    >
      <Header />
      {q.loading ? <Loading /> : null}
      {q.error && !d ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      {q.data === null ? <ErrorView title="Department not found" message="It may have been removed." /> : null}
      {d ? (
        <>
          <View style={{ backgroundColor: t.c.primaryContainer, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10 }}>
            <Blob size={140} color={t.c.secondaryContainer} right={-50} top={-50} />
            <HeroTag label={`DEPARTMENT${membership?.chapter_name ? ` · ${membership.chapter_name.toUpperCase()}` : ""}`} />
            <T variant="headlineMedium" color={t.c.onPrimaryContainer}>
              {d.name}
            </T>
            <T variant="bodyMedium" color={t.c.onPrimaryContainer}>
              {d.member_count} {d.member_count === 1 ? "member" : "members"}
            </T>
            {mine ? <Badge label="You're a member" icon="check" /> : null}
          </View>
          {mine ? (
            <View style={{ marginTop: 16 }}>
              <Alert tone="success" title="You're in" text="Your department leader can see you're part of the team. Watch for updates in Notifications." />
            </View>
          ) : null}
          <SectionHeader title="About" />
          <T variant="bodyLarge" muted>
            {d.description || "What this department does, who it's for and how often it meets will appear here."}
          </T>
          {membership?.chapter_name ? (
            <>
              <SectionHeader title="Where" />
              <ListGroup>
                <ListRow icon="church" iconCircle label={membership.chapter_name} sublabel="Your chapter" chevron={false} />
              </ListGroup>
            </>
          ) : null}
          <Row style={{ height: 12 }}>{null}</Row>
        </>
      ) : null}

      <Dialog
        visible={confirm === "switch"}
        title={`Switch to ${d?.name}?`}
        text={`You'll leave ${membership?.department_name}. You can be in one department at a time.`}
        confirm="Switch"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => act(false)}
      />
      <Dialog
        visible={confirm === "leave"}
        title={`Leave ${d?.name}?`}
        text="You can join another department any time."
        confirm="Leave"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => act(true)}
      />
    </Screen>
  );
}

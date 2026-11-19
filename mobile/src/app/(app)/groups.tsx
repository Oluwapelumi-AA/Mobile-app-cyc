import { router } from "expo-router";
import { useState } from "react";
import { Alert, Platform, View } from "react-native";

import { notify, tintFor } from "@/components/cards";
import { Badge, Button, Card, EmptyState, ErrorView, Header, IconTile, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Department } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function confirm(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]),
  );
}

/** Departments: join one, switch to another, or leave. */
export default function Groups() {
  const t = useTheme();
  const { membership, reload } = useAuth();
  const q = useApi(() => api<Department[]>("/departments"));
  const [busy, setBusy] = useState<string | null>(null);
  const mine = membership?.department_id;
  const isMember = membership?.membership_status === "member";

  const join = async (d: Department) => {
    if (mine && !(await confirm(`Switch to ${d.name}?`, `You'll leave ${membership?.department_name}. You can only be in one department.`, "Switch"))) return;
    setBusy(d.id);
    try {
      await api("/me/department", { method: "PUT", body: { department_id: d.id } });
      await reload();
      q.reload();
    } catch (err) {
      notify("Couldn't join", errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const leave = async (d: Department) => {
    if (!(await confirm(`Leave ${d.name}?`, "You can join another department any time.", "Leave"))) return;
    setBusy(d.id);
    try {
      await api("/me/department", { method: "DELETE" });
      await reload();
      q.reload();
    } catch (err) {
      notify("Couldn't leave", errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const list = [...(q.data ?? [])].sort((a, b) => (a.id === mine ? -1 : b.id === mine ? 1 : a.name.localeCompare(b.name)));

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Departments" subtitle="Serve with others who share your gifts. You can be in one department at a time." />
      {!isMember ? (
        <Card bg={t.tints.yellow.bg} bordered={false} style={{ gap: 10, marginBottom: 14 }}>
          <T variant="small" color={t.tints.yellow.fg}>
            Join a chapter first, then you can join a department.
          </T>
          <Button label="Find a chapter" small full={false} variant="outline" onPress={() => router.push("/choose-chapter")} />
        </Card>
      ) : null}
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {list.map((d, i) => {
          const on = d.id === mine;
          return (
            <Card key={d.id} style={{ gap: 10, borderColor: on ? t.primary : t.border }}>
              <Row gap={12}>
                <IconTile icon="users" tint={tintFor(i)} />
                <View style={{ flex: 1 }}>
                  <T variant="title">{d.name}</T>
                  <T variant="caption" muted>
                    {d.member_count} {d.member_count === 1 ? "member" : "members"}
                  </T>
                </View>
                {on ? <Badge label="Member" icon="check" /> : null}
              </Row>
              {d.description ? (
                <T variant="small" muted>
                  {d.description}
                </T>
              ) : null}
              {isMember ? (
                on ? (
                  <Button label="Leave" small full={false} variant="outline" loading={busy === d.id} onPress={() => leave(d)} />
                ) : (
                  <Button label={mine ? "Switch to this" : "Join"} small full={false} variant={mine ? "outline" : "primary"} loading={busy === d.id} onPress={() => join(d)} />
                )
              ) : null}
            </Card>
          );
        })}
      </View>
      {q.data && !q.data.length ? <EmptyState icon="users" title="No departments yet" text="Your admins haven't added any departments." /> : null}
    </Screen>
  );
}

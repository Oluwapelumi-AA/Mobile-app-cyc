import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { notify } from "@/components/cards";
import { Button, Card, EmptyState, ErrorView, Header, Icon, IconTile, Loading, Row, Screen, SearchBox, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Chapter } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** For guests who skipped the chapter step. Joining is once only. */
export default function ChooseChapter() {
  const t = useTheme();
  const { membership, reload } = useAuth();
  const q = useApi(() => api<Chapter[]>("/chapters"));
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const s = query.trim().toLowerCase();
    return (q.data ?? []).filter((c) => c.is_active && (!s || `${c.name} ${c.city ?? ""} ${c.country_code}`.toLowerCase().includes(s)));
  }, [q.data, query]);

  if (membership?.chapter_id) {
    return (
      <Screen>
        <Header title="Your chapter" />
        <Card style={{ gap: 10 }}>
          <T variant="body">You’re a member of {membership.chapter_name}. Members stay in one chapter.</T>
          <Button label="Open my chapter" onPress={() => router.replace(`/chapter/${membership.chapter_id}`)} />
        </Card>
      </Screen>
    );
  }

  const join = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await api("/me/chapter", { method: "PUT", body: { chapter_id: picked } });
      await reload();
      router.replace(`/chapter/${picked}`);
    } catch (err) {
      notify("Couldn't join", errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Find a chapter" subtitle="You'll be a member straight away. You can only join one chapter, so choose the one you attend." />
      <Row>
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search by name or city" />
      </Row>
      <View style={{ height: 14 }} />
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {shown.map((c) => {
          const on = c.id === picked;
          return (
            <Pressable key={c.id} onPress={() => setPicked(on ? null : c.id)}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderColor: on ? t.primary : t.border, borderWidth: on ? 2 : 1 }}>
                <IconTile icon="mc:church" tint={on ? "red" : "yellow"} />
                <View style={{ flex: 1 }}>
                  <T variant="title">{c.name}</T>
                  <T variant="caption" muted>
                    {[c.city, c.country_code].filter(Boolean).join(", ")} · {c.member_count} {c.member_count === 1 ? "member" : "members"}
                  </T>
                </View>
                <Icon name={on ? "check-circle" : "circle"} size={22} color={on ? t.primary : t.border} />
              </Card>
            </Pressable>
          );
        })}
      </View>
      {q.data && !shown.length ? <EmptyState icon="map-pin" tint="yellow" title="No chapters found" text="Try another name or city." /> : null}
      <View style={{ height: 18 }} />
      <Button label="Join this chapter" disabled={!picked} loading={busy} onPress={join} />
    </Screen>
  );
}

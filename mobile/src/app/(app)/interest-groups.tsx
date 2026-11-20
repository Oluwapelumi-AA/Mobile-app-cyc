import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { Alert, Badge, Button, Card, Chip, ChipRow, Header, IconTile, Row, Screen, SearchBox, SectionHeader, Snackbar, T } from "@/components/ui";
import { INTEREST_GROUPS, InterestGroup, useInterestGroups } from "@/lib/groups";

/** Interest groups (Figma: Interest groups – Light). Preview: saved on this phone. */
export default function InterestGroups() {
  const gate = useAccountGate();
  const { statuses, interests, join } = useInterestGroups();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [snack, setSnack] = useState<string | null>(null);

  const match = (g: InterestGroup) => (filter === "all" || g.id === filter) && (!query || `${g.name} ${g.description}`.toLowerCase().includes(query.toLowerCase()));
  const mine = INTEREST_GROUPS.filter((g) => statuses[g.id] && match(g));
  const rest = INTEREST_GROUPS.filter((g) => !statuses[g.id] && match(g));
  const suggested = rest.filter((g) => (interests ?? []).includes(g.id));
  const others = rest.filter((g) => !(interests ?? []).includes(g.id));

  const doJoin = async (g: InterestGroup) => {
    if (!gate({ title: "Create an account to join groups", text: "Groups are where members with the same interests meet, plan and serve together." })) return;
    const s = await join(g);
    setSnack(s === "member" ? `You joined ${g.name}.` : `Request sent. A ${g.name} leader will review it.`);
  };

  const row = (g: InterestGroup) => (
    <Card key={g.id} onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
      <IconTile icon={g.icon} tint={g.tint} size={48} />
      <View style={{ flex: 1 }}>
        <T variant="titleMedium">{g.name}</T>
        <T variant="bodySmall" muted>
          {statuses[g.id] ? g.description : g.policy === "open" ? "Joins straight away" : "Leader approves requests"}
        </T>
      </View>
      {statuses[g.id] === "member" ? (
        <Badge label="Member" icon="check" />
      ) : statuses[g.id] === "pending" ? (
        <Badge label="Awaiting approval" icon="pending" tint="yellow" />
      ) : (
        <Button label={g.policy === "open" ? "Join" : "Request"} small full={false} variant="outline" onPress={() => doJoin(g)} />
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Interest groups" />
        <Row>
          <SearchBox value={query} onChangeText={setQuery} placeholder="Search groups" outlined={false} />
        </Row>
        <View style={{ height: 12 }} />
        <ChipRow>
          <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
          {INTEREST_GROUPS.map((g) => (
            <Chip key={g.id} label={g.name} selected={filter === g.id} onPress={() => setFilter(g.id)} />
          ))}
        </ChipRow>
        <View style={{ marginTop: 16 }}>
          <Alert text="Interest groups are new. Your choices are saved on this phone for now, and will move to your account soon." />
        </View>

        {mine.length ? (
          <>
            <SectionHeader title="Your groups" />
            <View style={{ gap: 10 }}>{mine.map(row)}</View>
          </>
        ) : null}
        {suggested.length ? (
          <>
            <SectionHeader title="Suggested for you" />
            <T variant="bodySmall" muted style={{ marginTop: -8, marginBottom: 12 }}>
              Based on the interests you picked.
            </T>
            <View style={{ gap: 10 }}>{suggested.map(row)}</View>
          </>
        ) : null}
        {others.length ? (
          <>
            <SectionHeader title={suggested.length || mine.length ? "More groups" : "All groups"} />
            <View style={{ gap: 10 }}>{others.map(row)}</View>
          </>
        ) : null}
      </Screen>
      <Snackbar text={snack} onHide={() => setSnack(null)} />
    </View>
  );
}

import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { Alert, Blob, Button, Dialog, EmptyState, ErrorView, HeroTag, Icon, IconButton, Row, Screen, SectionHeader, T } from "@/components/ui";
import { groupById, useInterestGroups } from "@/lib/groups";
import { radius, useTheme } from "@/lib/theme";

/** One interest group (Figma: Group – Music). Preview until the API has groups. */
export default function GroupScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = useAccountGate();
  const { statuses, join, leave } = useInterestGroups();
  const [confirm, setConfirm] = useState(false);
  const g = groupById(id);
  if (!g) return <Screen><ErrorView title="Group not found" message="It may have been removed." /></Screen>;
  const c = t.tints[g.tint];
  const status = statuses[g.id];

  return (
    <Screen
      padded={false}
      edges={["bottom"]}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
          {status === "member" ? (
            <Button label="Leave group" variant="outline" onPress={() => setConfirm(true)} />
          ) : status === "pending" ? (
            <Button label="Cancel request" variant="outline" onPress={() => leave(g)} />
          ) : (
            <Button label={g.policy === "open" ? "Join group" : "Request to join"} onPress={() => gate() && join(g)} />
          )}
        </View>
      }
    >
      <View style={{ backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24, overflow: "hidden", gap: 12 }}>
        <Blob size={200} color={t.c.primaryContainer} right={-60} top={60} />
        <IconButton icon="arrow-left" label="Back" bg="#FFFFFF" color="#1D1B19" onPress={() => (router.canGoBack() ? router.back() : router.replace("/interest-groups"))} />
        <View style={{ marginTop: 20, gap: 10 }}>
          <HeroTag label="INTEREST GROUP" />
          <Row gap={12}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.fg, alignItems: "center", justifyContent: "center" }}>
              <Icon name={g.icon} size={28} color={c.bg} weight="fill" />
            </View>
            <T variant="displaySmall" color={c.fg}>
              {g.name}
            </T>
          </Row>
          <T variant="bodyLarge" color={c.fg}>
            {g.description}
          </T>
          {status ? (
            <Row gap={6} style={{ backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Icon name={status === "member" ? "check" : "pending"} size={16} color="#1D1B19" />
              <T variant="labelLarge" color="#1D1B19">
                {status === "member" ? "You're a member" : "Awaiting approval"}
              </T>
            </Row>
          ) : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        {status === "pending" ? (
          <View style={{ marginTop: 16 }}>
            <Alert tone="warning" title="Request sent" text={`A ${g.name} leader will review it. We'll let you know when they do.`} />
          </View>
        ) : null}
        <SectionHeader title="Coming up" />
        <EmptyState icon="calendar" tint="yellow" title="Nothing planned yet" text="Group events and news will appear here once groups go live in your account." />
        <SectionHeader title="How joining works" />
        <T variant="bodyMedium" muted>
          {g.policy === "open" ? "Anyone can join this group straight away." : "A group leader approves new members, so they can welcome you properly."}
        </T>
      </View>
      <Dialog visible={confirm} title={`Leave ${g.name}?`} text="You can join again any time." confirm="Leave" danger onCancel={() => setConfirm(false)} onConfirm={() => (leave(g), setConfirm(false))} />
    </Screen>
  );
}

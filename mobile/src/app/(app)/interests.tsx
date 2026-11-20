import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button, Chip, Header, Row, Screen, T } from "@/components/ui";
import { getInterests, INTEREST_GROUPS, saveInterests } from "@/lib/groups";

/** Choose interests later (Figma: Choose interests (later)). Same chips, no step bar. */
export default function Interests() {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    getInterests().then((x) => x && setPicked(x));
  }, []);
  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Button
            label="Save"
            disabled={!picked.length}
            onPress={async () => {
              await saveInterests(picked);
              router.back();
            }}
          />
        </View>
      }
    >
      <Header title="Your interests" subtitle="Pick a few. We'll suggest groups and content you'll enjoy." />
      <Row gap={8} style={{ flexWrap: "wrap" }}>
        {INTEREST_GROUPS.map((g) => (
          <Chip key={g.id} label={g.name} tone="yellow" selected={picked.includes(g.id)} onPress={() => setPicked((p) => (p.includes(g.id) ? p.filter((x) => x !== g.id) : [...p, g.id]))} />
        ))}
      </Row>
      <T variant="bodySmall" muted style={{ marginTop: 16 }}>
        {picked.length ? `${picked.length} selected` : "Pick at least one."}
      </T>
    </Screen>
  );
}

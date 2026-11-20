import { View } from "react-native";

import { tintFor } from "@/components/cards";
import { Avatar, Card, Header, Row, Screen, SectionHeader, T } from "@/components/ui";
import { ABOUT } from "@/lib/content";
import { brand, useTheme } from "@/lib/theme";

/** Leadership & structure (Figma: About – Leadership & structure). */
export default function Leadership() {
  const t = useTheme();
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Leadership & structure" />
      <SectionHeader title="National leadership" style={{ marginTop: 4 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {ABOUT.leaders.map((l, i) => (
          <Card key={i} style={{ width: "48%", flexGrow: 1, alignItems: "center", gap: 8, paddingVertical: 18 }}>
            <Avatar name={l.name.replace(/[[\]]/g, "") || "?"} size={64} tint={tintFor(i + 1)} />
            <T variant="titleSmall" center>
              {l.name}
            </T>
            <T variant="bodySmall" muted center>
              {l.role}
            </T>
          </Card>
        ))}
      </View>

      <SectionHeader title="How CYC is organised" />
      <View>
        {ABOUT.structure.map((s, i) => (
          <Row key={i} gap={14} style={{ alignItems: "flex-start" }}>
            <View style={{ alignItems: "center", width: 28 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 0 ? brand.maroon : t.c.secondaryContainer, alignItems: "center", justifyContent: "center" }}>
                <T variant="labelMedium" color={i === 0 ? "#FFFFFF" : t.c.onSecondaryContainer}>
                  {i + 1}
                </T>
              </View>
              {i < ABOUT.structure.length - 1 ? <View style={{ width: 2, height: 36, backgroundColor: t.c.outlineVariant }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <T variant="titleMedium">{s.title}</T>
              <T variant="bodySmall" muted>
                {s.text}
              </T>
            </View>
          </Row>
        ))}
      </View>
    </Screen>
  );
}

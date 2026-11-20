import { Linking, View } from "react-native";

import { Button, Card, Header, IconTile, Row, Screen, SectionHeader, T } from "@/components/ui";
import { tintFor } from "@/components/cards";
import { ABOUT } from "@/lib/content";
import { radius, useTheme } from "@/lib/theme";

/** History, mission & values (Figma: About – Mission & values). */
export default function Mission() {
  const t = useTheme();
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Mission & values" />
      <View style={{ gap: 12 }}>
        <View style={{ backgroundColor: t.c.primaryContainer, borderRadius: radius.xl, padding: 18, gap: 6 }}>
          <T variant="labelMedium" color={t.c.onPrimaryContainer}>
            OUR MISSION
          </T>
          <T variant="titleLarge" color={t.c.onPrimaryContainer}>
            {ABOUT.mission}
          </T>
        </View>
        <View style={{ backgroundColor: t.c.tertiaryContainer, borderRadius: radius.xl, padding: 18, gap: 6 }}>
          <T variant="labelMedium" color={t.c.onTertiaryContainer}>
            OUR VISION
          </T>
          <T variant="titleLarge" color={t.c.onTertiaryContainer}>
            {ABOUT.vision}
          </T>
        </View>
      </View>

      <SectionHeader title="Our values" />
      <View style={{ gap: 10 }}>
        {ABOUT.values.map((v, i) => (
          <Card key={i}>
            <Row gap={12} style={{ alignItems: "flex-start" }}>
              <IconTile icon="star" tint={tintFor(i)} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="titleMedium">{v.title}</T>
                <T variant="bodyMedium" muted>
                  {v.text}
                </T>
              </View>
            </Row>
          </Card>
        ))}
      </View>

      <SectionHeader title={ABOUT.history.title} />
      <T variant="titleMedium" style={{ marginBottom: 6 }}>
        {ABOUT.history.lead}
      </T>
      {ABOUT.history.body.split("\n\n").map((p, i) => (
        <T key={i} variant="bodyLarge" muted style={{ marginBottom: 12 }}>
          {p}
        </T>
      ))}
      {ABOUT.constitutionUrl ? <Button label="Read the CYC constitution" icon="file-pdf" variant="outline" onPress={() => Linking.openURL(ABOUT.constitutionUrl!)} /> : null}
    </Screen>
  );
}

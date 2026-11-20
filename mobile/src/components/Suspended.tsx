import { Linking, View } from "react-native";

import { Button, Card, IconTile, Row, Screen, T } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { CYC_CONTACT } from "@/lib/content";
import { useTheme } from "@/lib/theme";

/** Shown when sign-in is refused because staff suspended the account. */
export function Suspended() {
  const t = useTheme();
  const { suspended, clearSuspended } = useAuth();
  return (
    <Screen
      edges={["top", "bottom"]}
      contentStyle={{ paddingTop: 48 }}
      footer={
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
          <Button label="Contact support" icon="mail" onPress={() => Linking.openURL(`mailto:${CYC_CONTACT.email}?subject=My%20CYC%20account%20is%20suspended`)} />
          <Button label="Sign out" variant="outline" onPress={clearSuspended} />
        </View>
      }
    >
      <View style={{ alignItems: "center", gap: 14 }}>
        <IconTile icon="prohibit" tint="pink" size={88} />
        <T variant="headlineMedium" center>
          Your account is suspended
        </T>
        <T variant="bodyLarge" muted center>
          {suspended?.reason || "CYC staff have paused this account. Contact support to find out more and what to do next."}
        </T>
      </View>
      <Card style={{ marginTop: 28, gap: 12 }}>
        <Row gap={12}>
          <IconTile icon="clock" tint="gray" />
          <View style={{ flex: 1 }}>
            <T variant="bodySmall" muted>
              Suspended until
            </T>
            <T variant="titleMedium">Further notice</T>
          </View>
        </Row>
      </Card>
      <T variant="bodySmall" muted center style={{ marginTop: 16, color: t.textMuted }}>
        Downloads and certificates you already have stay on this phone.
      </T>
    </Screen>
  );
}

import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, IconTile, T } from "@/components/ui";
import { registerPush } from "@/lib/push";
import { local } from "@/lib/storage";
import { radius, useTheme } from "@/lib/theme";

const KEY = "cyc.notificationPromptSeen";

/** Asks once, gently, before the system permission dialog (Figma: Notification permission). */
export function NotificationPrompt() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      if (await local.getJSON<boolean>(KEY, false)) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") return;
      setTimeout(() => !cancelled && setOpen(true), 1500);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => {
    setOpen(false);
    void local.setJSON(KEY, true);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: t.c.scrim, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Not now" />
        <View style={{ backgroundColor: t.c.surfaceContainerLow, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: 24, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 14, alignItems: "center" }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: t.c.outline, marginBottom: 6 }} />
          <IconTile icon="bell" tint="yellow" size={72} />
          <T variant="headlineSmall" center>
            Never miss what matters
          </T>
          <T variant="bodyMedium" muted center>
            Turn on notifications for reminders before events, when meetings go live, and news from your chapter.
          </T>
          <Button
            label="Turn on notifications"
            onPress={async () => {
              close();
              await registerPush().catch(() => undefined);
            }}
          />
          <Button label="Not now" variant="text" onPress={close} />
          <T variant="bodySmall" muted center>
            You can change this any time in Settings.
          </T>
        </View>
      </View>
    </Modal>
  );
}

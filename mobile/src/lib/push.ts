import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "./api";

let registeredToken: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Ask for permission and send this phone's Expo push token to CYC.
 * Quietly does nothing on web, simulators, or when push isn't set up yet
 * (the app needs an EAS project ID: run `npx eas-cli init`).
 */
export async function registerPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "CYC",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("/notifications/devices", {
    method: "POST",
    body: { token, platform: Platform.OS === "ios" ? "ios" : "android", app_version: Constants.expoConfig?.version },
  });
  registeredToken = token;
}

export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await api("/notifications/devices", { method: "DELETE", query: { token: registeredToken } });
  registeredToken = null;
}

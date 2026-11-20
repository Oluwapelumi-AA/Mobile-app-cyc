import { createEventInCalendarAsync } from "expo-calendar/legacy";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { local } from "./storage";
import type { EventItem } from "./types";

const KEY = "cyc.reminders";

/** Event reminders scheduled on this phone ("Remind me – the day before"). */
export async function reminderIds() {
  return local.getJSON<Record<string, string>>(KEY, {});
}

export async function setReminder(e: EventItem, on: boolean): Promise<boolean> {
  if (Platform.OS === "web") throw new Error("Reminders work in the phone app.");
  const all = await reminderIds();
  if (!on) {
    if (all[e.id]) await Notifications.cancelScheduledNotificationAsync(all[e.id]).catch(() => undefined);
    delete all[e.id];
    await local.setJSON(KEY, all);
    return false;
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") throw new Error("Turn on notifications for CYC in your phone's settings to get reminders.");
  const start = new Date(e.starts_at);
  const at = new Date(start.getTime() - 24 * 3600 * 1000);
  const when = at.getTime() > Date.now() + 60_000 ? at : new Date(Math.max(Date.now() + 60_000, start.getTime() - 3600 * 1000));
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${e.title} is ${when === at ? "tomorrow" : "soon"}`,
      body: start.toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + (e.location ? ` · ${e.location}` : ""),
      data: { event_id: e.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  all[e.id] = id;
  await local.setJSON(KEY, all);
  return true;
}

/** Opens the phone's calendar with the event filled in. */
export async function addToCalendar(e: EventItem) {
  if (Platform.OS === "web") throw new Error("Add to calendar works in the phone app.");
  await createEventInCalendarAsync({
    title: e.title,
    startDate: new Date(e.starts_at),
    endDate: new Date(e.ends_at),
    location: e.location ?? e.online_url ?? undefined,
    notes: e.description ?? undefined,
    timeZone: e.timezone,
  });
}

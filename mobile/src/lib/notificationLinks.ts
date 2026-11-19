import type { IconName } from "@/components/ui";

import type { Tint } from "./theme";
import type { NotificationCategory } from "./types";

type Data = Record<string, unknown>;

/** Where tapping a notification goes. */
export function hrefFor(data: Data): string | null {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : null);
  if (s("meeting_id")) return `/meeting/${s("meeting_id")}`;
  if (s("post_id")) return `/post/${s("post_id")}`;
  if (s("event_id")) return `/event/${s("event_id")}`;
  if (s("resource_id")) return `/resource/${s("resource_id")}`;
  if (s("chapter_id")) return `/chapter/${s("chapter_id")}`;
  return null;
}

export const categoryLook: Record<NotificationCategory, { label: string; icon: IconName; tint: Tint }> = {
  meetings: { label: "LIVE", icon: "radio", tint: "red" },
  events: { label: "EVENT", icon: "calendar", tint: "yellow" },
  chapter: { label: "CHAPTER", icon: "megaphone", tint: "pink" },
  resources: { label: "LEARN", icon: "book", tint: "green" },
  social: { label: "COMMUNITY", icon: "message", tint: "yellow" },
};

import { useCallback, useEffect, useState } from "react";

import type { IconName } from "@/components/Icon";

import { local } from "./storage";
import type { Tint } from "./theme";

/**
 * Interest groups (Figma: Community → Interest groups).
 *
 * PREVIEW ONLY: the backend doesn't have interest groups yet, so the list
 * lives here and a member's choices are saved on this phone. When the API
 * adds groups, replace `INTEREST_GROUPS` and `useInterestGroups` with calls
 * to it; the screens don't need to change.
 */
export type InterestGroup = {
  id: string;
  name: string;
  icon: IconName;
  tint: Tint;
  description: string;
  /** "open" joins straight away; "approval" sends a request to the leader. */
  policy: "open" | "approval";
};

export const INTEREST_GROUPS: InterestGroup[] = [
  { id: "music", name: "Music", icon: "music", tint: "yellow", description: "Worship, rehearsals and songwriting.", policy: "open" },
  { id: "drama", name: "Drama", icon: "drama", tint: "pink", description: "Plays, skits and creative ministry.", policy: "approval" },
  { id: "technology", name: "Technology", icon: "monitor", tint: "green", description: "Sound, streaming, apps and the web.", policy: "approval" },
  { id: "media", name: "Media", icon: "camera", tint: "pink", description: "Photos, video and social media.", policy: "approval" },
  { id: "prayer", name: "Prayer", icon: "hand", tint: "yellow", description: "Praying together for CYC and the world.", policy: "open" },
  { id: "evangelism", name: "Evangelism", icon: "megaphone", tint: "green", description: "Sharing the gospel in our cities.", policy: "open" },
  { id: "bible-study", name: "Bible study", icon: "book-open", tint: "yellow", description: "Weekly small groups in the Word.", policy: "open" },
  { id: "welfare", name: "Welfare", icon: "heart", tint: "pink", description: "Caring for members and neighbours.", policy: "open" },
  { id: "leadership", name: "Leadership", icon: "star", tint: "green", description: "Growing as leaders who serve.", policy: "approval" },
];

export type GroupStatus = "member" | "pending";

const MEMBERSHIP_KEY = "cyc.groups";
const INTERESTS_KEY = "cyc.interests";
const listeners = new Set<() => void>();

export async function getInterests() {
  return local.getJSON<string[] | null>(INTERESTS_KEY, null);
}

export async function saveInterests(ids: string[]) {
  await local.setJSON(INTERESTS_KEY, ids);
  listeners.forEach((l) => l());
}

/** The member's interests and group memberships (saved on this phone). */
export function useInterestGroups() {
  const [statuses, setStatuses] = useState<Record<string, GroupStatus>>({});
  const [interests, setInterests] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const [s, i] = await Promise.all([local.getJSON<Record<string, GroupStatus>>(MEMBERSHIP_KEY, {}), getInterests()]);
    setStatuses(s);
    setInterests(i);
  }, []);

  useEffect(() => {
    // Read from storage once; later changes arrive through the listeners.
    void Promise.resolve().then(load);
    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, [load]);

  const join = useCallback(async (g: InterestGroup) => {
    const next = { ...(await local.getJSON<Record<string, GroupStatus>>(MEMBERSHIP_KEY, {})), [g.id]: g.policy === "open" ? "member" : "pending" } as Record<string, GroupStatus>;
    await local.setJSON(MEMBERSHIP_KEY, next);
    listeners.forEach((l) => l());
    return next[g.id];
  }, []);

  const leave = useCallback(async (g: InterestGroup) => {
    const next = { ...(await local.getJSON<Record<string, GroupStatus>>(MEMBERSHIP_KEY, {})) };
    delete next[g.id];
    await local.setJSON(MEMBERSHIP_KEY, next);
    listeners.forEach((l) => l());
  }, []);

  const mine = INTEREST_GROUPS.filter((g) => statuses[g.id]);
  const suggested = INTEREST_GROUPS.filter((g) => !statuses[g.id] && (interests ?? []).includes(g.id));
  return { statuses, interests, mine, suggested, join, leave };
}

export const groupById = (id: string) => INTEREST_GROUPS.find((g) => g.id === id);

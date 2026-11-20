import { useEffect, useState } from "react";

import { api } from "./api";
import type { PublicProfile } from "./types";

const cache = new Map<string, Promise<string>>();

function nameOf(id: string): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = api<PublicProfile>(`/profiles/${id}`)
      .then((x) => (x.is_deleted ? "Deleted user" : x.display_name))
      .catch(() => "CYC member");
    cache.set(id, p);
  }
  return p;
}

/** Display names for a list of user IDs, loaded once and cached. */
export function useNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    let alive = true;
    const unique = key ? key.split(",") : [];
    Promise.all(unique.map(async (id) => [id, await nameOf(id)] as const)).then((pairs) => {
      if (alive) setNames(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return names;
}

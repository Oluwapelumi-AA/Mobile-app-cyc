import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorText } from "./api";

type State<T> = { data: T | undefined; error: string; loading: boolean; refreshing: boolean };

/**
 * Loads data for a screen. Reloads when `deps` change, and quietly when the
 * screen comes back into focus (so changes made elsewhere show up).
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = [], { refetchOnFocus = true } = {}) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: "", loading: true, refreshing: false });
  const loadRef = useRef(load);
  loadRef.current = load;
  const first = useRef(true);

  const run = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    setState((s) => ({
      ...s,
      loading: mode === "initial" && s.data === undefined,
      refreshing: mode === "refresh",
      error: mode === "silent" ? s.error : "",
    }));
    try {
      const data = await loadRef.current();
      setState({ data, error: "", loading: false, refreshing: false });
    } catch (err) {
      setState((s) => ({ ...s, error: errorText(err), loading: false, refreshing: false }));
    }
  }, []);

  useEffect(() => {
    void run("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (refetchOnFocus) void run("silent");
    }, [run, refetchOnFocus]),
  );

  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({
      ...s,
      data: typeof update === "function" ? (update as (p: T | undefined) => T)(s.data) : update,
    }));
  }, []);

  return {
    ...state,
    reload: () => run("initial"),
    refresh: () => run("refresh"),
    setData,
  };
}

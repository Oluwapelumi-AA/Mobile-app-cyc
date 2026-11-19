import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { EventRow, LiveCard } from "@/components/cards";
import { EmptyState, ErrorView, Header, IconButton, Loading, Screen, Segmented, T, TextButton } from "@/components/ui";
import { api } from "@/lib/api";
import { dayShort, monthLong, sameDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { EventItem, Meeting, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "upcoming" | "live" | "past";

const startOfWeek = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function Events() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [day, setDay] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const q = useApi(async () => {
    const [upcoming, past, live] = await Promise.all([
      api<Page<EventItem>>("/events", { query: { limit: 50 } }),
      api<Page<EventItem>>("/events", { query: { past: true, limit: 30 } }),
      api<Page<Meeting>>("/meetings", { query: { status: "live", limit: 10 } }),
    ]);
    return { upcoming: upcoming.items, past: past.items, live: live.items };
  });

  const setEvent = (e: EventItem) =>
    q.setData((d) => ({ ...d!, upcoming: d!.upcoming.map((x) => (x.id === e.id ? e : x)), past: d!.past }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)), [weekStart]);
  const upcoming = q.data?.upcoming ?? [];
  const today = new Date();
  const shown = day ? upcoming.filter((e) => sameDay(new Date(e.starts_at), day)) : upcoming;
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const thisWeek = shown.filter((e) => new Date(e.starts_at) < weekEnd);
  const laterByMonth = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    for (const e of shown.filter((x) => new Date(x.starts_at) >= weekEnd)) {
      const d = new Date(e.starts_at);
      const key = `${monthLong(d)}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const content = () => {
    if (q.loading) return <Loading />;
    if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.reload} />;
    const d = q.data!;
    if (tab === "live") {
      return d.live.length ? (
        <View style={{ gap: 12 }}>
          {d.live.map((m) => (
            <LiveCard key={m.id} meeting={m} />
          ))}
        </View>
      ) : (
        <EmptyState icon="radio" tint="pink" title="Nothing live right now" text="When your chapter or CYC goes live, you'll see it here and get a notification." />
      );
    }
    if (tab === "past") {
      return d.past.length ? (
        <View style={{ gap: 10 }}>
          {d.past.map((e, i) => (
            <EventRow key={e.id} event={e} index={i} />
          ))}
        </View>
      ) : (
        <EmptyState icon="calendar" tint="yellow" title="No past events" />
      );
    }
    return (
      <>
        <T variant="title" style={{ marginBottom: 10 }}>
          {monthLong(weekStart)} {weekStart.getFullYear()}
        </T>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <IconButton icon="chevron-left" label="Previous week" size={28} onPress={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))} />
          {days.map((dd) => {
            const on = day ? sameDay(dd, day) : sameDay(dd, today);
            const has = upcoming.some((e) => sameDay(new Date(e.starts_at), dd));
            return (
              <Pressable
                key={dd.toISOString()}
                onPress={() => setDay(day && sameDay(day, dd) ? null : dd)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: on ? 0 : 1,
                  borderColor: t.border,
                  backgroundColor: on ? t.primary : t.surface,
                }}
              >
                <T variant="caption" color={on ? "#FFFFFF" : t.textMuted} style={{ fontSize: 10 }}>
                  {dayShort(dd).toUpperCase()}
                </T>
                <T variant="h3" color={on ? "#FFFFFF" : t.text}>
                  {dd.getDate()}
                </T>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: has ? (on ? "#FFFFFF" : t.primary) : "transparent", marginTop: 1 }} />
              </Pressable>
            );
          })}
          <IconButton icon="chevron-right" label="Next week" size={28} onPress={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))} />
        </View>

        {d.live.length && !day ? (
          <View style={{ marginTop: 18, gap: 12 }}>
            {d.live.map((m) => (
              <LiveCard key={m.id} meeting={m} />
            ))}
          </View>
        ) : null}

        {day ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 22 }}>
            <T variant="h3">
              {dayShort(day)} {day.getDate()} {monthLong(day)}
            </T>
            <TextButton label="Show all" onPress={() => setDay(null)} />
          </View>
        ) : null}

        {thisWeek.length ? (
          <>
            {!day ? (
              <T variant="h3" style={{ marginTop: 22, marginBottom: 12 }}>
                This week
              </T>
            ) : (
              <View style={{ height: 12 }} />
            )}
            <View style={{ gap: 10 }}>
              {thisWeek.map((e, i) => (
                <EventRow key={e.id} event={e} index={i} onChange={setEvent} />
              ))}
            </View>
          </>
        ) : null}

        {laterByMonth.map(([month, list]) => (
          <View key={month}>
            <T variant="h3" style={{ marginTop: 22, marginBottom: 12 }}>
              {month}
            </T>
            <View style={{ gap: 10 }}>
              {list.map((e, i) => (
                <EventRow key={e.id} event={e} index={i + 1} onChange={setEvent} />
              ))}
            </View>
          </View>
        ))}

        {!shown.length ? (
          <EmptyState icon="calendar" tint="yellow" title={day ? "Nothing on this day" : "No upcoming events"} text="New events from CYC and your chapter will show up here." />
        ) : null}
      </>
    );
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header back={false} title="Events" subtitle="What's on in CYC and your chapter." />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { key: "upcoming", label: "Upcoming" },
          { key: "live", label: "Live now" },
          { key: "past", label: "Past" },
        ]}
      />
      <View style={{ height: 18 }} />
      {content()}
    </Screen>
  );
}

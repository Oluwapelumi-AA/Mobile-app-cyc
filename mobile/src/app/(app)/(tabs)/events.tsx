import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { EventRow, LiveCard } from "@/components/cards";
import { EmptyState, ErrorView, Header, IconButton, Row, Screen, Segmented, Skeleton, T, TextButton } from "@/components/ui";
import { api } from "@/lib/api";
import { dayShort, monthLong, sameDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { EventItem, Meeting, Page } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "upcoming" | "live" | "past";

const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday first
  return x;
};

/** Events (Figma: Events – Light, Events – Error, Events – No upcoming events). */
export default function Events() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [day, setDay] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const q = useApi(async () => {
    const [upcoming, past, live] = await Promise.all([
      api<Page<EventItem>>("/events", { query: { limit: 50 } }),
      api<Page<EventItem>>("/events", { query: { past: true, limit: 30 } }),
      api<Page<Meeting>>("/meetings", { query: { status: "live", limit: 10 } }).catch(() => ({ items: [] as Meeting[], next_cursor: null })),
    ]);
    return { upcoming: upcoming.items, past: past.items, live: live.items };
  });

  const setEvent = (e: EventItem) => q.setData((d) => ({ ...d!, upcoming: d!.upcoming.map((x) => (x.id === e.id ? e : x)) }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)), [weekStart]);
  const upcoming = q.data?.upcoming ?? [];
  const today = new Date();
  const shown = day ? upcoming.filter((e) => sameDay(new Date(e.starts_at), day)) : upcoming;
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const thisWeek = shown.filter((e) => new Date(e.starts_at) < weekEnd);
  const byMonth = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    for (const e of shown.filter((x) => new Date(x.starts_at) >= weekEnd)) {
      const d = new Date(e.starts_at);
      const key = `${monthLong(d)}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const offline = q.error && !q.data;

  const body = () => {
    if (q.loading)
      return (
        <View style={{ gap: 12 }}>
          <Skeleton h={76} r={12} />
          <Skeleton h={190} r={28} />
          <Skeleton h={88} r={20} />
          <Skeleton h={88} r={20} />
        </View>
      );
    if (offline) return null;
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
            <EventRow key={e.id} event={e} index={i} chevron />
          ))}
        </View>
      ) : (
        <EmptyState icon="calendar" tint="yellow" title="No past events" />
      );
    }
    if (!upcoming.length) {
      return (
        <EmptyState
          icon="calendar"
          tint="yellow"
          title="No upcoming events"
          text="When your chapter, departments or groups plan something, it'll show up here."
          action="See past events"
          onAction={() => setTab("past")}
          secondary="Browse events in other chapters"
          onSecondary={() => router.push("/find-chapter")}
        />
      );
    }
    return (
      <>
        <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <T variant="titleMedium">
            {monthLong(days[3])} {days[3].getFullYear()}
          </T>
          <Row gap={0}>
            <IconButton icon="chevron-left" label="Previous week" size={36} onPress={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))} />
            <IconButton icon="chevron-right" label="Next week" size={36} onPress={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))} />
          </Row>
        </Row>
        <Row gap={6}>
          {days.map((dd) => {
            const on = day ? sameDay(dd, day) : sameDay(dd, today);
            const has = upcoming.some((e) => sameDay(new Date(e.starts_at), dd));
            return (
              <Pressable
                key={dd.toISOString()}
                onPress={() => setDay(day && sameDay(day, dd) ? null : dd)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${dd.toDateString()}${has ? ", has events" : ""}`}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: 14,
                  borderWidth: on ? 0 : 1,
                  borderColor: t.c.outlineVariant,
                  backgroundColor: on ? t.button : t.c.surfaceContainerLow,
                  gap: 2,
                }}
              >
                <T variant="labelSmall" color={on ? t.onButton : t.textMuted}>
                  {dayShort(dd).toUpperCase()}
                </T>
                <T variant="titleMedium" color={on ? t.onButton : t.text}>
                  {dd.getDate()}
                </T>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? (on ? t.onButton : t.button) : "transparent" }} />
              </Pressable>
            );
          })}
        </Row>

        {d.live.length && !day ? (
          <View style={{ marginTop: 20, gap: 12 }}>
            {d.live.map((m) => (
              <LiveCard key={m.id} meeting={m} />
            ))}
          </View>
        ) : null}

        {day ? (
          <Row style={{ justifyContent: "space-between", marginTop: 24 }}>
            <T variant="section">
              {dayShort(day)} {day.getDate()} {monthLong(day)}
            </T>
            <TextButton label="Show all" underline onPress={() => setDay(null)} />
          </Row>
        ) : null}

        {thisWeek.length ? (
          <>
            {!day ? (
              <T variant="section" style={{ marginTop: 28, marginBottom: 14 }}>
                This week
              </T>
            ) : (
              <View style={{ height: 14 }} />
            )}
            <View style={{ gap: 10 }}>
              {thisWeek.map((e, i) => (
                <EventRow key={e.id} event={e} index={i} onChange={setEvent} />
              ))}
            </View>
          </>
        ) : null}

        {byMonth.map(([month, list]) => (
          <View key={month}>
            <T variant="section" style={{ marginTop: 28, marginBottom: 14 }}>
              {month}
            </T>
            <View style={{ gap: 10 }}>
              {list.map((e, i) => (
                <EventRow key={e.id} event={e} index={i + 1} onChange={setEvent} />
              ))}
            </View>
          </View>
        ))}

        {day && !shown.length ? <EmptyState icon="calendar" tint="yellow" title="Nothing on this day" text="Pick another day, or show all events." /> : null}
      </>
    );
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header
        back={false}
        title="Events"
        subtitle="What's on in CYC and your chapter."
        right={
          <IconButton
            icon="calendar"
            label="Back to this week"
            tonal
            onPress={() => {
              setTab("upcoming");
              setDay(null);
              setWeekStart(startOfWeek(new Date()));
            }}
          />
        }
      />
      {offline ? (
        <ErrorView
          title="We couldn't load events"
          message="Check your internet connection, then try again."
          onRetry={q.reload}
        />
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: "upcoming", label: "Upcoming" },
              { key: "live", label: "Live now" },
              { key: "past", label: "Past" },
            ]}
          />
          <View style={{ height: 20 }} />
          {body()}
        </>
      )}
      {offline && q.error ? (
        <T variant="bodySmall" muted center>
          {q.error}
        </T>
      ) : null}
    </Screen>
  );
}

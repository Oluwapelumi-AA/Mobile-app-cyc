import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Chip, Icon, Row, T, TextButton } from "@/components/ui";
import { applyFilters, bookOf, DateRange, EMPTY_FILTERS, SermonFilters, sermonStore, useSermonStore } from "@/lib/sermons";
import { useTheme } from "@/lib/theme";

const DATES: { key: DateRange; label: string }[] = [
  { key: "any", label: "Any time" },
  { key: "month", label: "This month" },
  { key: "3months", label: "Last 3 months" },
  { key: "year", label: "This year" },
];

function Label({ children }: { children: string }) {
  return (
    <T variant="small" weight="semibold" style={{ marginTop: 18, marginBottom: 8 }}>
      {children}
    </T>
  );
}

/** Bottom sheet for filtering sermons. */
export default function SermonFiltersSheet() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const store = useSermonStore();
  const [f, setF] = useState<SermonFilters>(store.filters);
  const [allSpeakers, setAllSpeakers] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const speakers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of store.sermons) if (s.author_name) counts.set(s.author_name, (counts.get(s.author_name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [store.sermons]);
  const books = useMemo(() => [...new Set(store.sermons.map((s) => bookOf(s.scripture_reference)).filter(Boolean))] as string[], [store.sermons]);
  const count = applyFilters(store.sermons, f).length;

  const toggle = <K extends "format" | "speakers" | "categoryIds">(key: K, value: SermonFilters[K][number]) =>
    setF((cur) => {
      const list = cur[key] as string[];
      return { ...cur, [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
    });

  const apply = () => {
    sermonStore.set({ filters: f });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
      <Pressable style={{ flex: 1 }} onPress={() => router.back()} accessibilityLabel="Close filters" />
      <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", paddingBottom: Math.max(insets.bottom, 14) }}>
        <View style={{ alignItems: "center", paddingTop: 10 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
            <T variant="h2">Filter sermons</T>
            <TextButton label="Reset" onPress={() => setF(EMPTY_FILTERS)} />
          </Row>

          <Label>Format</Label>
          <Row gap={8}>
            <Chip label="Audio" tone="yellow" selected={f.format.includes("audio")} onPress={() => toggle("format", "audio")} />
            <Chip label="Video" tone="yellow" selected={f.format.includes("video")} onPress={() => toggle("format", "video")} />
          </Row>

          {speakers.length ? (
            <>
              <Label>Speaker</Label>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                {(allSpeakers ? speakers : speakers.slice(0, 5)).map((s) => (
                  <Chip key={s} label={s} tone="yellow" selected={f.speakers.includes(s)} onPress={() => toggle("speakers", s)} />
                ))}
                {speakers.length > 5 && !allSpeakers ? <Chip label="More speakers" onPress={() => setAllSpeakers(true)} /> : null}
              </Row>
            </>
          ) : null}

          {store.categories.length ? (
            <>
              <Label>Topic</Label>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                {store.categories.map((c) => (
                  <Chip key={c.id} label={c.name} tone="yellow" selected={f.categoryIds.includes(c.id)} onPress={() => toggle("categoryIds", c.id)} />
                ))}
              </Row>
            </>
          ) : null}

          <Label>Scripture</Label>
          <Pressable
            onPress={() => setBookOpen((o) => !o)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 14, borderWidth: 1, borderColor: t.border, paddingHorizontal: 14 }}
          >
            <Icon name="book-open" size={17} />
            <T variant="body" style={{ flex: 1 }}>
              {f.book ?? "Any book of the Bible"}
            </T>
            <Icon name={bookOpen ? "chevron-up" : "chevron-down"} size={18} color={t.textMuted} />
          </Pressable>
          {bookOpen ? (
            <Row gap={8} style={{ flexWrap: "wrap", marginTop: 10 }}>
              <Chip label="Any book" tone="yellow" selected={!f.book} onPress={() => (setF({ ...f, book: null }), setBookOpen(false))} />
              {books.length ? (
                books.map((b) => <Chip key={b} label={b} tone="yellow" selected={f.book === b} onPress={() => (setF({ ...f, book: b }), setBookOpen(false))} />)
              ) : (
                <T variant="small" muted>
                  No sermons list a scripture yet.
                </T>
              )}
            </Row>
          ) : null}

          <Label>Date</Label>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {DATES.map((d) => (
              <Chip key={d.key} label={d.label} tone="yellow" selected={f.date === d.key} onPress={() => setF({ ...f, date: d.key })} />
            ))}
          </Row>
        </ScrollView>
        <View style={{ paddingHorizontal: 20 }}>
          <Button label={`Show ${count} ${count === 1 ? "sermon" : "sermons"}`} onPress={apply} />
        </View>
      </View>
    </View>
  );
}

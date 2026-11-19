import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { notify, SermonRow, toggleBookmark } from "@/components/cards";
import { Blob, Button, Chip, ChipRow, EmptyState, ErrorView, Header, Icon, IconButton, Loading, Row, Screen, T } from "@/components/ui";
import { api, apiAll, errorText } from "@/lib/api";
import { duration } from "@/lib/format";
import { applyFilters, countFilters, EMPTY_FILTERS, SortOrder, sermonStore, useSermonStore } from "@/lib/sermons";
import { brand } from "@/lib/theme";
import type { Category, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const SORTS: { key: SortOrder; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "A to Z" },
];

export default function Sermons() {
  const store = useSermonStore();
  const f = store.filters;
  const [sortOpen, setSortOpen] = useState(false);

  const q = useApi(async () => {
    const [audio, video, categories] = await Promise.all([
      apiAll<Resource>("/resources", { kind: "audio" }),
      apiAll<Resource>("/resources", { kind: "video" }),
      api<Category[]>("/resource-categories").catch(() => [] as Category[]),
    ]);
    return { sermons: [...audio, ...video], categories };
  });

  useEffect(() => {
    if (q.data) sermonStore.set({ sermons: q.data.sermons, categories: q.data.categories });
  }, [q.data]);

  const all = store.sermons;
  const list = useMemo(() => applyFilters(all, f, store.sort), [all, f, store.sort]);
  const featured = useMemo(() => [...all].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0], [all]);
  const n = countFilters(f);

  const bookmark = async (r: Resource) => {
    try {
      const updated = await toggleBookmark(r);
      sermonStore.set({ sermons: sermonStore.get().sermons.map((x) => (x.id === r.id ? updated : x)) });
    } catch (err) {
      notify("Couldn't save", errorText(err));
    }
  };

  const setFilters = (patch: Partial<typeof f>) => sermonStore.set({ filters: { ...f, ...patch } });
  const catName = (id: string) => store.categories.find((c) => c.id === id)?.name ?? "Topic";

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Sermons" right={<IconButton icon="search" label="Search sermons" bordered onPress={() => router.push({ pathname: "/search", params: { type: "sermons" } })} />} />

      <ChipRow>
        <Chip label={n ? `Filters  ${n}` : "Filters"} icon="sliders" selected onPress={() => router.push("/sermon-filters")} />
        {f.format.map((x) => (
          <Chip key={x} label={x === "audio" ? "Audio" : "Video"} tone="yellow" selected onRemove={() => setFilters({ format: f.format.filter((y) => y !== x) })} />
        ))}
        {f.speakers.map((x) => (
          <Chip key={x} label={x} tone="yellow" selected onRemove={() => setFilters({ speakers: f.speakers.filter((y) => y !== x) })} />
        ))}
        {f.categoryIds.map((x) => (
          <Chip key={x} label={catName(x)} tone="yellow" selected onRemove={() => setFilters({ categoryIds: f.categoryIds.filter((y) => y !== x) })} />
        ))}
        {f.book ? <Chip label={f.book} tone="yellow" selected onRemove={() => setFilters({ book: null })} /> : null}
        {f.date !== "any" ? <Chip label={{ month: "This month", "3months": "Last 3 months", year: "This year", any: "" }[f.date]} tone="yellow" selected onRemove={() => setFilters({ date: "any" })} /> : null}
        {!n ? <Chip label="Topic" onPress={() => router.push("/sermon-filters")} /> : null}
        {!n ? <Chip label="Speaker" onPress={() => router.push("/sermon-filters")} /> : null}
      </ChipRow>

      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {featured && !n ? (
        <Pressable onPress={() => router.push(`/sermon/${featured.id}`)} style={{ marginTop: 16 }}>
          <View style={{ backgroundColor: brand.red, borderRadius: 20, padding: 16, gap: 8, overflow: "hidden" }}>
            <Blob size={150} color={brand.gold} top={-60} right={-40} />
            <Blob size={22} color={brand.green} bottom={60} right={70} />
            <View style={{ backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <T variant="overline" color="#FFFFFF">
                FEATURED · NEW
              </T>
            </View>
            <T variant="h2" color="#FFFFFF" numberOfLines={2} style={{ paddingRight: 60 }}>
              {featured.title}
            </T>
            <T variant="small" color="rgba(255,255,255,0.85)">
              {[featured.author_name, featured.scripture_reference].filter(Boolean).join(" · ")}
            </T>
            <Row gap={12} style={{ marginTop: 6 }}>
              <Button label="Play" icon="play" variant="light" small full={false} onPress={() => router.push(`/sermon/${featured.id}`)} />
              <T variant="small" color="#FFFFFF">
                {[featured.kind === "video" ? "Video" : "Audio", duration(featured.duration_seconds)].filter(Boolean).join(" · ")}
              </T>
            </Row>
          </View>
        </Pressable>
      ) : null}

      {q.data ? (
        <Row style={{ justifyContent: "space-between", marginTop: 18, marginBottom: 10 }}>
          <T variant="small" muted>
            {list.length} {list.length === 1 ? "sermon" : "sermons"}
          </T>
          <Pressable onPress={() => setSortOpen((o) => !o)}>
            <Row gap={4}>
              <T variant="small">{SORTS.find((s) => s.key === store.sort)?.label}</T>
              <Icon name={sortOpen ? "chevron-up" : "chevron-down"} size={15} />
            </Row>
          </Pressable>
        </Row>
      ) : null}
      {sortOpen ? (
        <Row gap={8} style={{ marginBottom: 12 }}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} tone="yellow" selected={store.sort === s.key} onPress={() => (sermonStore.set({ sort: s.key }), setSortOpen(false))} />
          ))}
        </Row>
      ) : null}

      <View style={{ gap: 10 }}>
        {list.map((r) => (
          <SermonRow key={r.id} item={r} onBookmark={bookmark} />
        ))}
      </View>
      {q.data && !list.length ? (
        <EmptyState
          icon="headphones"
          tint="pink"
          title={n ? "No sermons match" : "No sermons yet"}
          text={n ? "Try removing a filter." : "New sermons will appear here when they're published."}
          action={n ? "Clear filters" : undefined}
          onAction={() => sermonStore.set({ filters: EMPTY_FILTERS })}
        />
      ) : null}
    </Screen>
  );
}

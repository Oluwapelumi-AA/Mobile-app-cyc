import { View } from "react-native";

import { notify, SermonRow, toggleBookmark } from "@/components/cards";
import { EmptyState, ErrorView, Header, Loading, Screen } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import type { Page, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function Saved() {
  const q = useApi(() => api<Page<Resource>>("/resources/bookmarks", { query: { limit: 50 } }));
  const unsave = async (r: Resource) => {
    try {
      await toggleBookmark(r);
      q.setData((d) => ({ items: d!.items.filter((x) => x.id !== r.id), next_cursor: d!.next_cursor }));
    } catch (err) {
      notify("Couldn't update", errorText(err));
    }
  };
  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Saved" subtitle="Sermons and resources you've bookmarked." />
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {(q.data?.items ?? []).map((r) => (
          <SermonRow key={r.id} item={r} onBookmark={unsave} />
        ))}
      </View>
      {q.data && !q.data.items.length ? <EmptyState icon="bookmark" tint="pink" title="Nothing saved yet" text="Tap the bookmark on any sermon to keep it here." /> : null}
    </Screen>
  );
}

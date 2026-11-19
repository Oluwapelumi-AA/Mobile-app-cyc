import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { notify } from "@/components/cards";
import { AnnouncementCard } from "@/components/PostCard";
import { Button, Card, EmptyState, ErrorView, Header, Loading, Row, Screen } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fonts, useTheme } from "@/lib/theme";
import type { Page, Post } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** News from your chapter: posts by leaders and members, newest first. */
export default function Announcements() {
  const t = useTheme();
  const { membership } = useAuth();
  const chapterId = membership?.chapter_id;
  const q = useApi(async () => (chapterId ? api<Page<Post>>(`/chapters/${chapterId}/posts`, { query: { limit: 30 } }) : null), [chapterId]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  const post = async () => {
    if (!draft.trim() || !chapterId) return;
    setBusy(true);
    try {
      const created = await api<Post>(`/chapters/${chapterId}/posts`, { method: "POST", body: { body: draft.trim() } });
      q.setData((d) => ({ items: [created, ...(d?.items ?? [])], next_cursor: d?.next_cursor ?? null }));
      setDraft("");
    } catch (err) {
      notify("Couldn't post", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!q.data?.next_cursor || !chapterId) return;
    setMore(true);
    try {
      const page = await api<Page<Post>>(`/chapters/${chapterId}/posts`, { query: { limit: 30, cursor: q.data.next_cursor } });
      q.setData((d) => ({ items: [...(d?.items ?? []), ...page.items], next_cursor: page.next_cursor }));
    } finally {
      setMore(false);
    }
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Announcements" subtitle={membership?.chapter_name ? `News and updates from ${membership.chapter_name}.` : undefined} />
      {!chapterId ? (
        <EmptyState icon="megaphone" tint="pink" title="Join a chapter to see its news" action="Find a chapter" onAction={() => router.push("/find-chapter")} />
      ) : (
        <>
          <Card style={{ gap: 10, marginBottom: 16 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Share something with ${membership?.chapter_name ?? "your chapter"}…`}
              placeholderTextColor={t.textMuted}
              multiline
              maxLength={5000}
              accessibilityLabel="New post"
              style={{ fontFamily: fonts.regular, fontSize: 16, color: t.text, minHeight: 48, textAlignVertical: "top" }}
            />
            {draft.trim() ? (
              <Row style={{ justifyContent: "flex-end" }}>
                <Button label="Post" small full={false} onPress={post} loading={busy} />
              </Row>
            ) : null}
          </Card>
          {q.loading ? <Loading /> : null}
          {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
          <View style={{ gap: 10 }}>
            {(q.data?.items ?? []).map((p) => (
              <AnnouncementCard key={p.id} post={p} source={membership?.chapter_name ?? "Chapter"} onPress={() => router.push(`/post/${p.id}`)} />
            ))}
          </View>
          {q.data && !q.data.items.length ? <EmptyState icon="megaphone" tint="yellow" title="No news yet" text="Updates from your chapter will appear here." /> : null}
          {q.data?.next_cursor ? <Button label="Load more" variant="outline" onPress={loadMore} loading={more} style={{ marginTop: 14 }} /> : null}
        </>
      )}
    </Screen>
  );
}

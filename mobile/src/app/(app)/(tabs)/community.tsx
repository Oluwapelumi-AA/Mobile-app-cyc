import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { notify } from "@/components/cards";
import { PostCard } from "@/components/PostCard";
import { Button, Card, EmptyState, ErrorView, Header, IconTile, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNames } from "@/lib/people";
import { fonts, useTheme } from "@/lib/theme";
import type { Page, Post } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Your chapter's feed. */
export default function Community() {
  const t = useTheme();
  const { membership } = useAuth();
  const chapterId = membership?.chapter_id;
  const q = useApi(async () => (chapterId ? api<Page<Post>>(`/chapters/${chapterId}/posts`, { query: { limit: 30 } }) : null), [chapterId]);
  const names = useNames((q.data?.items ?? []).map((p) => p.author_id));
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
      <Header back={false} title="Community" subtitle={membership?.chapter_name ? `What's happening in ${membership.chapter_name}.` : "Your chapter and departments."} />

      <Row gap={10} style={{ marginBottom: 16 }}>
        <Card style={{ flex: 1, gap: 8 }} onPress={() => (chapterId ? router.push(`/chapter/${chapterId}`) : router.push("/choose-chapter"))}>
          <IconTile icon="mc:church" tint="green" size={36} />
          <T variant="title" numberOfLines={1}>
            {membership?.chapter_name ?? "Find a chapter"}
          </T>
          <T variant="caption" muted>
            {chapterId ? "Chapter page" : "Join the one you attend"}
          </T>
        </Card>
        <Card style={{ flex: 1, gap: 8 }} onPress={() => router.push("/groups")}>
          <IconTile icon="users" tint="yellow" size={36} />
          <T variant="title" numberOfLines={1}>
            {membership?.department_name ?? "Departments"}
          </T>
          <T variant="caption" muted>
            {membership?.department_name ? "Your department" : "Join one"}
          </T>
        </Card>
      </Row>

      {!chapterId ? (
        <EmptyState icon="users" tint="green" title="Join a chapter to see its feed" text="Updates, prayer requests and news from your chapter show up here." action="Find a chapter" onAction={() => router.push("/choose-chapter")} />
      ) : (
        <>
          <Card style={{ gap: 10, marginBottom: 14 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Share something with ${membership?.chapter_name ?? "your chapter"}…`}
              placeholderTextColor={t.textMuted}
              multiline
              maxLength={5000}
              style={{ fontFamily: fonts.regular, fontSize: 15, color: t.text, minHeight: 44, textAlignVertical: "top" }}
            />
            {draft.trim() ? (
              <Row style={{ justifyContent: "flex-end" }}>
                <Button label="Post" small full={false} onPress={post} loading={busy} />
              </Row>
            ) : null}
          </Card>
          {q.loading ? <Loading /> : null}
          {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
          <View style={{ gap: 12 }}>
            {(q.data?.items ?? []).map((p) => (
              <PostCard key={p.id} post={p} author={names[p.author_id]} onPress={() => router.push(`/post/${p.id}`)} />
            ))}
          </View>
          {q.data && !q.data.items.length ? <EmptyState icon="message-circle" tint="yellow" title="No posts yet" text="Be the first to share something with your chapter." /> : null}
          {q.data?.next_cursor ? <Button label="Load more" variant="outline" onPress={loadMore} loading={more} style={{ marginTop: 14 }} /> : null}
        </>
      )}
    </Screen>
  );
}

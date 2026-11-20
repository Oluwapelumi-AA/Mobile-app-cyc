import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

import { notify, tintFor } from "@/components/cards";
import { PostCard } from "@/components/PostCard";
import { Avatar, Button, Card, ErrorView, Header, IconButton, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { useNames } from "@/lib/people";
import { fonts, useTheme } from "@/lib/theme";
import type { Comment, Page, Post } from "@/lib/types";
import { useApi } from "@/lib/useApi";


export default function PostScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(async () => {
    const [post, comments] = await Promise.all([api<Post>(`/posts/${id}`), api<Page<Comment>>(`/posts/${id}/comments`, { query: { limit: 50 } })]);
    return { post, comments: comments.items };
  }, [id]);
  const names = useNames([...(q.data ? [q.data.post.author_id] : []), ...(q.data?.comments ?? []).map((c) => c.author_id)]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const c = await api<Comment>(`/posts/${id}/comments`, { method: "POST", body: { body: draft.trim() } });
      q.setData((d) => ({ post: { ...d!.post, comment_count: d!.post.comment_count + 1 }, comments: [...d!.comments, c] }));
      setDraft("");
    } catch (err) {
      notify("Couldn't comment", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    try {
      await api("/reports", { method: "POST", body: { target_type: "post", target_id: id, reason: "other" } });
      notify("Thanks for telling us", "Your chapter's coordinator will review this post.");
    } catch (err) {
      notify("Couldn't report", errorText(err));
    }
  };

  const remove = async () => {
    try {
      await api(`/posts/${id}`, { method: "DELETE" });
      router.back();
    } catch (err) {
      notify("Couldn't delete", errorText(err));
    }
  };

  const mine = q.data?.post.author_id === user?.id;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Header
          title="Post"
          right={q.data ? <IconButton icon={mine ? "trash" : "flag"} label={mine ? "Delete post" : "Report post"} onPress={mine ? remove : report} /> : null}
        />
        {!q.data ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : (
          <>
            <PostCard post={q.data.post} author={names[q.data.post.author_id]} />
            <T variant="h3" style={{ marginTop: 20, marginBottom: 10 }}>
              Comments
            </T>
            <View style={{ gap: 12 }}>
              {q.data.comments.map((c) => {
                const name = names[c.author_id] ?? "…";
                return (
                  <Row key={c.id} gap={10} style={{ alignItems: "flex-start" }}>
                    <Avatar name={name} size={30} tint={tintFor(name.length)} />
                    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: 14, padding: 10 }}>
                      <T variant="small" weight="semibold">
                        {name}{" "}
                        <T variant="caption" muted>
                          · {timeAgo(c.created_at)}
                        </T>
                      </T>
                      <T variant="small">{c.body}</T>
                    </View>
                  </Row>
                );
              })}
              {!q.data.comments.length ? (
                <T variant="small" muted>
                  No comments yet.
                </T>
              ) : null}
            </View>
            <Card style={{ marginTop: 16, gap: 10 }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Write a comment…"
                placeholderTextColor={t.textMuted}
                multiline
                style={{ fontFamily: fonts.regular, fontSize: 15, color: t.text, minHeight: 40 }}
              />
              <Row style={{ justifyContent: "flex-end" }}>
                <Button label="Comment" small full={false} onPress={send} loading={busy} disabled={!draft.trim()} />
              </Row>
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

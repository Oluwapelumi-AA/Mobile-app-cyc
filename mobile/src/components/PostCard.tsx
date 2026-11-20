import { View } from "react-native";

import { tintFor } from "@/components/cards";
import { Avatar, Card, Icon, Row, T } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { brand, useTheme } from "@/lib/theme";
import type { Post } from "@/lib/types";

/** A full post with its author (post detail). */
export function PostCard({ post, author, onPress }: { post: Post; author?: string; onPress?: () => void }) {
  const t = useTheme();
  const name = author ?? "…";
  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <Row gap={12}>
        <Avatar name={name} size={40} tint={tintFor(name.length)} />
        <View style={{ flex: 1 }}>
          <T variant="titleMedium" numberOfLines={1}>
            {name}
          </T>
          <T variant="bodySmall" muted>
            {timeAgo(post.created_at)}
            {post.edited_at ? " · edited" : ""}
          </T>
        </View>
      </Row>
      <T variant="bodyLarge">{post.body}</T>
      <Row gap={6}>
        <Icon name="message" size={16} color={t.textMuted} />
        <T variant="bodySmall" muted>
          {post.comment_count ? `${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}` : "Comment"}
        </T>
      </Row>
    </Card>
  );
}

/** Announcement row (Figma: Community → Announcements): first line as the title. */
export function AnnouncementCard({ post, source, onPress }: { post: Post; source: string; onPress?: () => void }) {
  const t = useTheme();
  const [first, ...rest] = post.body.split(/\n+/);
  const title = first.length > 90 ? `${first.slice(0, 88)}…` : first;
  const preview = rest.join(" ") || (first.length > 90 ? first : "");
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center" }}>
        <Icon name="megaphone" size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="labelMedium" color={t.primary}>
          {source.toUpperCase()} · {timeAgo(post.created_at).toUpperCase()}
        </T>
        <T variant="titleMedium" numberOfLines={2}>
          {title}
        </T>
        {preview ? (
          <T variant="bodySmall" muted numberOfLines={2}>
            {preview}
          </T>
        ) : null}
      </View>
    </Card>
  );
}

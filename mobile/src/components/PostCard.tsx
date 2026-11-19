import { View } from "react-native";

import { tintFor } from "@/components/cards";
import { Avatar, Card, Icon, Row, T } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Post } from "@/lib/types";

export function PostCard({ post, author, onPress }: { post: Post; author?: string; onPress?: () => void }) {
  const t = useTheme();
  const name = author ?? "…";
  return (
    <Card onPress={onPress} style={{ gap: 10 }}>
      <Row gap={10}>
        <Avatar name={name} size={36} tint={tintFor(name.length)} />
        <View style={{ flex: 1 }}>
          <T variant="title" numberOfLines={1}>
            {name}
          </T>
          <T variant="caption" muted>
            {timeAgo(post.created_at)}
            {post.edited_at ? " · edited" : ""}
          </T>
        </View>
      </Row>
      <T variant="body">{post.body}</T>
      <Row gap={6}>
        <Icon name="message-circle" size={15} color={t.textMuted} />
        <T variant="caption" muted>
          {post.comment_count ? `${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}` : "Comment"}
        </T>
      </Row>
    </Card>
  );
}

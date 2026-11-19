import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { Share, View } from "react-native";

import { kindIcon, notify, toggleBookmark } from "@/components/cards";
import { Button, Card, ErrorView, Header, IconButton, IconTile, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { ResourceDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Articles, documents and links. Audio and video open the sermon player. */
export default function ResourceScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(() => api<ResourceDetail>(`/resources/${id}`), [id], { refetchOnFocus: false });
  const r = q.data;

  useEffect(() => {
    if (r && (r.kind === "audio" || r.kind === "video")) router.replace(`/sermon/${r.id}`);
    else if (r && r.kind === "article" && !r.my_progress?.completed) {
      api(`/resources/${r.id}/progress`, { method: "PUT", body: { percent: 100, completed: true } }).catch(() => undefined);
    }
  }, [r]);

  const bookmark = async () => {
    if (!r) return;
    try {
      const u = await toggleBookmark(r);
      q.setData({ ...r, bookmarked: u.bookmarked });
    } catch (err) {
      notify("Couldn't save", errorText(err));
    }
  };

  const link = r?.file_url ?? r?.external_url;

  return (
    <Screen edges={["top", "bottom"]}>
      <Header
        right={
          r ? (
            <Row gap={4}>
              <IconButton icon="bookmark" label={r.bookmarked ? "Remove from saved" : "Save"} color={r.bookmarked ? t.primary : t.text} bordered onPress={bookmark} />
              <IconButton icon="share-2" label="Share" bordered onPress={() => Share.share({ message: `${r.title} on the CYC app${r.external_url ? `: ${r.external_url}` : ""}` })} />
            </Row>
          ) : null
        }
      />
      {!r ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : (
        <>
          <IconTile icon={kindIcon(r.kind)} tint="yellow" size={52} />
          <T variant="overline" color={t.primary} style={{ marginTop: 14 }}>
            {r.kind.toUpperCase()}
          </T>
          <T variant="h1" style={{ marginTop: 2 }}>
            {r.title}
          </T>
          <T variant="small" muted style={{ marginTop: 4 }}>
            {[r.author_name, r.scripture_reference, r.published_at ? shortDate(r.published_at) : null].filter(Boolean).join(" · ")}
          </T>
          {r.summary ? (
            <T variant="body" muted style={{ marginTop: 14 }}>
              {r.summary}
            </T>
          ) : null}
          {r.body ? (
            <Card style={{ marginTop: 16 }}>
              <T variant="body" style={{ lineHeight: 25 }}>
                {r.body}
              </T>
            </Card>
          ) : null}
          {link ? (
            <View style={{ marginTop: 20 }}>
              <Button
                label={r.kind === "link" ? "Open link" : r.kind === "document" ? "Open document" : "Open"}
                icon="external-link"
                onPress={() => {
                  WebBrowser.openBrowserAsync(link).catch(() => undefined);
                  api(`/resources/${r.id}/progress`, { method: "PUT", body: { percent: 100, completed: true } }).catch(() => undefined);
                }}
              />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

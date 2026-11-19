import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, Share, View } from "react-native";

import { notify, SermonRow, toggleBookmark } from "@/components/cards";
import { Blob, Card, ErrorView, Icon, IconButton, IconName, Loading, Row, Screen, Segmented, T, TextButton } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { downloadResource, findDownload, removeDownload } from "@/lib/downloads";
import { clock, shortDate } from "@/lib/format";
import { usePlayer } from "@/lib/player";
import { brand, useTheme } from "@/lib/theme";
import type { Category, Page, Resource, ResourceDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const RATES = [1, 1.25, 1.5, 2, 0.75];

function ActionButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={18} color={active ? t.primary : t.text} />
      <T variant="small" weight="medium" color={active ? t.primary : t.text}>
        {label}
      </T>
    </Pressable>
  );
}

function Scrubber({ position, duration, onSeek }: { position: number; duration: number; onSeek: (s: number) => void }) {
  const t = useTheme();
  const [width, setWidth] = useState(1);
  const pct = duration ? Math.min(1, position / duration) : 0;
  return (
    <View>
      <Pressable
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => duration && onSeek((e.nativeEvent.locationX / width) * duration)}
        style={{ height: 24, justifyContent: "center" }}
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
      >
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.border }}>
          <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: t.primary }} />
        </View>
        <View style={{ position: "absolute", left: pct * width - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: t.primary }} />
      </Pressable>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="caption" muted>
          {clock(position)}
        </T>
        <T variant="caption" muted>
          {duration ? clock(duration) : "--:--"}
        </T>
      </Row>
    </View>
  );
}

function VideoPane({ uri, resumeAt, resourceId }: { uri: string; resumeAt: number; resourceId: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    if (resumeAt > 5) p.currentTime = resumeAt;
    p.play();
  });
  useEffect(
    () => () => {
      try {
        const d = player.duration;
        const at = player.currentTime;
        if (d) {
          const percent = Math.round((at / d) * 100);
          api(`/resources/${resourceId}/progress`, { method: "PUT", body: { percent, position_seconds: Math.floor(at), completed: percent >= 98 } }).catch(() => undefined);
        }
      } catch {
        // Player already released.
      }
    },
    [player, resourceId],
  );
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: "#000" }} nativeControls contentFit="contain" />;
}

export default function SermonPlayer() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePlayer();
  const q = useApi(async () => {
    const [r, categories] = await Promise.all([api<ResourceDetail>(`/resources/${id}`), api<Category[]>("/resource-categories").catch(() => [] as Category[])]);
    const [more, saved] = await Promise.all([
      api<Page<Resource>>("/resources", { query: { limit: 8, ...(r.category_id ? { category_id: r.category_id } : {}) } }).catch(() => ({ items: [] as Resource[], next_cursor: null })),
      findDownload(r.id),
    ]);
    return {
      r,
      category: categories.find((c) => c.id === r.category_id)?.name,
      upNext: more.items.filter((x) => x.id !== r.id && (x.kind === "audio" || x.kind === "video")).slice(0, 4),
      saved: Boolean(saved),
    };
  }, [id], { refetchOnFocus: false });
  const [chosenMode, setMode] = useState<"audio" | "video" | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const r = q.data?.r;
  const mediaUri = r ? r.file_url ?? r.external_url : null;
  const isVideo = r?.kind === "video";
  const isCurrent = p.track?.id === r?.id;
  const mode = chosenMode ?? (isVideo ? "video" : "audio");

  useEffect(() => {
    if (!r) return;
    if (!isVideo && !isCurrent && mediaUri) p.play(r).catch((err) => notify("Can't play this sermon", errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id]);

  const switchMode = (m: "audio" | "video") => {
    if (!r) return;
    setMode(m);
    if (m === "audio" && !isCurrent) p.play(r).catch((err) => notify("Can't play this sermon", errorText(err)));
    if (m === "video" && isCurrent) p.stop();
  };

  const paragraphs = useMemo(() => (r?.body ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean), [r?.body]);

  if (!r) {
    return (
      <Screen>
        <Row style={{ paddingTop: 8 }}>
          <IconButton icon="chevron-down" label="Close" onPress={() => router.back()} bordered />
        </Row>
        {q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const bookmark = async () => {
    try {
      const u = await toggleBookmark(r);
      q.setData((d) => ({ ...d!, r: { ...d!.r, bookmarked: u.bookmarked } }));
    } catch (err) {
      notify("Couldn't save", errorText(err));
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      if (q.data?.saved) {
        await removeDownload(r.id);
        q.setData((d) => ({ ...d!, saved: false }));
      } else {
        await downloadResource(r);
        q.setData((d) => ({ ...d!, saved: true }));
        notify("Downloaded", "This sermon now plays without internet. Find it in Profile → Downloads.");
      }
    } catch (err) {
      notify("Couldn't download", errorText(err));
    } finally {
      setDownloading(false);
    }
  };

  const position = isCurrent ? p.position : r.my_progress?.position_seconds ?? 0;
  const duration = isCurrent ? p.duration : r.duration_seconds ?? 0;

  return (
    <Screen edges={["top", "bottom"]}>
      <Row style={{ justifyContent: "space-between", paddingTop: 8, paddingBottom: 12 }}>
        <IconButton icon="chevron-down" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace("/learn/sermons"))} bordered />
        <View style={{ width: 190 }}>
          <Segmented
            value={mode}
            onChange={(m) => (m === "video" && !isVideo ? notify("Audio only", "This sermon doesn't have a video.") : switchMode(m))}
            options={[
              { key: "audio", label: "Audio" },
              { key: "video", label: "Video" },
            ]}
          />
        </View>
        <IconButton
          icon="more-vertical"
          label="More"
          bordered
          onPress={() =>
            api(`/resources/${r.id}/progress`, { method: "PUT", body: { percent: 100, position_seconds: Math.floor(duration), completed: true } })
              .then(() => notify("Marked as finished"))
              .catch((err) => notify("Couldn't update", errorText(err)))
          }
        />
      </Row>

      {mode === "video" && mediaUri ? (
        <VideoPane uri={mediaUri} resumeAt={r.my_progress?.completed ? 0 : r.my_progress?.position_seconds ?? 0} resourceId={r.id} />
      ) : (
        <View style={{ aspectRatio: 1, borderRadius: 22, backgroundColor: brand.red, overflow: "hidden", padding: 20, justifyContent: "space-between" }}>
          <Icon name="headphones" size={44} color="#FFFFFF" />
          <Blob size={240} color={brand.gold} right={-70} bottom={-80} />
          <Blob size={30} color={brand.green} left="42%" top="38%" />
          <T variant="overline" color="#FFFFFF">
            CYC SERMONS
          </T>
        </View>
      )}

      <T variant="overline" color={t.primary} style={{ marginTop: 16 }}>
        SERMON{q.data?.category ? ` · ${q.data.category.toUpperCase()}` : ""}
      </T>
      <T variant="h1" style={{ marginTop: 2 }}>
        {r.title}
      </T>
      <T variant="small" muted>
        {[r.author_name, r.scripture_reference, r.published_at ? shortDate(r.published_at) : null].filter(Boolean).join(" · ")}
      </T>

      {mode === "audio" ? (
        <>
          <View style={{ marginTop: 14 }}>
            <Scrubber position={position} duration={duration} onSeek={(s) => (isCurrent ? p.seek(s) : p.play(r))} />
          </View>
          <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
            <Pressable onPress={() => p.setRate(RATES[(RATES.indexOf(p.rate) + 1) % RATES.length])} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <T variant="small" weight="semibold">
                {p.rate}×
              </T>
            </Pressable>
            <IconButton icon="rotate-ccw" label="Back 15 seconds" size={46} onPress={() => p.skip(-15)} />
            <Pressable
              onPress={() => (isCurrent ? p.toggle() : p.play(r).catch((err) => notify("Can't play this sermon", errorText(err))))}
              accessibilityLabel={isCurrent && p.playing ? "Pause" : "Play"}
              style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name={isCurrent && p.playing ? "pause" : "play"} size={30} color="#FFFFFF" />
            </Pressable>
            <IconButton icon="rotate-cw" label="Forward 30 seconds" size={46} onPress={() => p.skip(30)} />
            <IconButton icon="file-text" label="Transcript" size={44} bg={t.surfaceAlt} onPress={() => setTranscriptOpen((o) => !o)} />
          </Row>
        </>
      ) : null}

      <Row gap={10} style={{ marginTop: 18 }}>
        <ActionButton icon="bookmark" label={r.bookmarked ? "Saved" : "Save"} active={r.bookmarked} onPress={bookmark} />
        <ActionButton icon={q.data?.saved ? "check-circle" : "download"} label={downloading ? "Saving…" : q.data?.saved ? "Downloaded" : "Download"} active={q.data?.saved} onPress={download} />
        <ActionButton icon="share-2" label="Share" onPress={() => Share.share({ message: `${r.title}${r.author_name ? ` — ${r.author_name}` : ""} on the CYC app` })} />
      </Row>

      {r.summary || paragraphs.length ? (
        <Card style={{ marginTop: 16, gap: 10 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="title">{paragraphs.length ? "Transcript" : "About this sermon"}</T>
            {paragraphs.length > 3 ? <TextButton label={transcriptOpen ? "Close" : "Open"} onPress={() => setTranscriptOpen((o) => !o)} /> : null}
          </Row>
          {paragraphs.length ? (
            (transcriptOpen ? paragraphs : paragraphs.slice(0, 3)).map((line, i) => (
              <T key={i} variant="small" muted={!transcriptOpen && i !== 1} style={!transcriptOpen && i === 1 ? { backgroundColor: t.tints.pink.bg, padding: 8, borderRadius: 10, color: t.tints.pink.fg } : null}>
                {line}
              </T>
            ))
          ) : (
            <T variant="small" muted>
              {r.summary}
            </T>
          )}
        </Card>
      ) : null}

      {q.data?.upNext.length ? (
        <>
          <T variant="h3" style={{ marginTop: 24, marginBottom: 12 }}>
            Up next
          </T>
          <View style={{ gap: 10 }}>
            {q.data.upNext.map((x) => (
              <Pressable key={x.id} onPress={() => router.replace(`/sermon/${x.id}`)}>
                <View pointerEvents="none">
                  <SermonRow item={x} />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

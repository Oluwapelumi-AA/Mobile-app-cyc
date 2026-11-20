import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Linking, Pressable, View } from "react-native";

import { Blob, Button, Header, Icon, IconButton, ProgressBar, Row, Screen, T } from "@/components/ui";
import { ANTHEM } from "@/lib/content";
import { brand, radius, useTheme } from "@/lib/theme";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** CYC Anthem (Figma: About – Anthem): player and the words. */
export default function Anthem() {
  const t = useTheme();
  const player = useAudioPlayer(ANTHEM.audioUrl ? { uri: ANTHEM.audioUrl } : null);
  const status = useAudioPlayerStatus(player);
  const ready = Boolean(ANTHEM.audioUrl);
  const pct = status.duration ? (status.currentTime / status.duration) * 100 : 0;

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="CYC Anthem" />
      <View style={{ backgroundColor: brand.maroon, borderRadius: radius.xxl, padding: 22, overflow: "hidden", gap: 14 }}>
        <Blob size={140} color={brand.gold} right={-50} top={-50} />
        <View style={{ gap: 2 }}>
          <T variant="titleLarge" color="#FFFFFF">
            {ANTHEM.title}
          </T>
          <T variant="bodySmall" color="rgba(255,255,255,0.85)">
            {ANTHEM.credit}
          </T>
        </View>
        <ProgressBar value={pct} color={brand.gold} track="rgba(255,255,255,0.25)" />
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="labelSmall" color="rgba(255,255,255,0.85)">
            {clock(status.currentTime)}
          </T>
          <T variant="labelSmall" color="rgba(255,255,255,0.85)">
            {clock(status.duration || 0)}
          </T>
        </Row>
        <Row gap={20} style={{ justifyContent: "center" }}>
          <IconButton icon="rotate-ccw" label="Back 10 seconds" color="#FFFFFF" onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status.playing ? "Pause" : "Play"}
            disabled={!ready}
            onPress={() => (status.playing ? player.pause() : player.play())}
            style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: ready ? "#FFFFFF" : "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={status.playing ? "pause" : "play"} size={28} color={brand.maroon} weight="fill" />
          </Pressable>
          <IconButton icon="rotate-cw" label="Forward 10 seconds" color="#FFFFFF" onPress={() => player.seekTo(status.currentTime + 10)} />
        </Row>
        {!ready ? (
          <T variant="bodySmall" color="rgba(255,255,255,0.85)" center>
            The recording will be added soon.
          </T>
        ) : null}
      </View>
      {ANTHEM.videoUrl ? <Button label="Watch the video" icon="video" variant="outline" onPress={() => Linking.openURL(ANTHEM.videoUrl!)} style={{ marginTop: 12 }} /> : null}

      <View style={{ marginTop: 24, gap: 22 }}>
        {ANTHEM.verses.map((v, i) => (
          <View key={i} style={{ gap: 6 }}>
            <T variant="labelMedium" color={v.label === "CHORUS" ? t.primary : t.textMuted}>
              {v.label}
            </T>
            {v.lines.map((line, j) => (
              <T key={j} variant="bodyLarge" style={v.label === "CHORUS" ? { fontStyle: "italic" } : undefined}>
                {line}
              </T>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { IconButton, IconTile, T } from "@/components/ui";
import { usePlayer } from "@/lib/player";
import { useTheme } from "@/lib/theme";

/** The sermon that's playing, shown above the tab bar. */
export function MiniPlayer() {
  const t = useTheme();
  const p = usePlayer();
  if (!p.track) return null;
  const pct = p.duration ? (p.position / p.duration) * 100 : 0;
  return (
    <Pressable
      onPress={() => router.push(`/sermon/${p.track!.id}`)}
      style={{ marginHorizontal: 10, marginBottom: 6, borderRadius: 14, backgroundColor: t.c.surfaceContainerHigh, overflow: "hidden" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8 }}>
        <IconTile icon="headphones" tint="red" size={40} rounded={10} />
        <View style={{ flex: 1 }}>
          <T variant="titleSmall" numberOfLines={1}>
            {p.track.title}
          </T>
          <T variant="bodySmall" muted numberOfLines={1}>
            {p.track.author_name ?? "CYC Sermons"}
          </T>
        </View>
        <IconButton icon={p.playing ? "pause" : "play"} weight="fill" label={p.playing ? "Pause" : "Play"} onPress={p.toggle} size={40} />
        <IconButton icon="x" label="Stop" onPress={p.stop} size={32} color={t.textMuted} />
      </View>
      <View style={{ height: 3, backgroundColor: t.border }}>
        <View style={{ height: 3, width: `${pct}%`, backgroundColor: t.primary }} />
      </View>
    </Pressable>
  );
}

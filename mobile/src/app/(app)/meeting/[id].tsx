import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Blob, Button, Card, ErrorView, Header, Icon, Loading, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { minutesAgo } from "@/lib/format";
import { brand, useTheme } from "@/lib/theme";
import type { JoinToken, Meeting } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/**
 * Joins a live meeting. The server issues a join token from its video
 * provider. Until a real provider (LiveKit, Daily, …) is set up on the
 * server, this screen explains that instead of showing video.
 */
export default function MeetingScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(() => api<Meeting>(`/meetings/${id}`), [id], { refetchOnFocus: false });
  const [token, setToken] = useState<JoinToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const m = q.data;

  const join = async () => {
    setBusy(true);
    setError("");
    try {
      setToken(await api<JoinToken>(`/meetings/${id}/token`, { method: "POST" }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (m?.status === "live" && m.can_join && !token) void Promise.resolve().then(join);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.status]);

  const isFake = token && (token.provider === "fake" || !/^https?:|^wss?:/.test(token.server_url));
  const webUrl =
    token && token.provider === "livekit"
      ? `https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(token.server_url)}&token=${encodeURIComponent(token.token)}`
      : null;

  return (
    <Screen edges={["top", "bottom"]}>
      <Header />
      {!m ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : (
        <>
          <View style={{ backgroundColor: brand.red, borderRadius: 20, padding: 18, overflow: "hidden", gap: 8, minHeight: 210, justifyContent: "flex-end" }}>
            <Blob size={160} color={brand.gold} top={-60} right={-50} />
            <Blob size={22} color={brand.green} top={70} right={60} />
            <Row gap={6} style={{ backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.status === "live" ? brand.red : "#999" }} />
              <T variant="overline" color={brand.red}>
                {m.status === "live" ? "LIVE NOW" : m.status.toUpperCase()}
              </T>
            </Row>
            <T variant="h1" color="#FFFFFF">
              {m.title}
            </T>
            {m.started_at ? (
              <T variant="small" color="#FFFFFF">
                Started {minutesAgo(m.started_at)}
              </T>
            ) : null}
          </View>

          {m.description ? (
            <T variant="body" muted style={{ marginTop: 16 }}>
              {m.description}
            </T>
          ) : null}

          <View style={{ marginTop: 18, gap: 12 }}>
            {m.status !== "live" ? (
              <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Icon name="clock" size={18} color={t.textMuted} />
                <T variant="small" muted style={{ flex: 1 }}>
                  {m.status === "scheduled" ? "This meeting hasn't started yet. We'll notify you when it goes live." : "This meeting has ended."}
                </T>
              </Card>
            ) : null}
            {busy ? <Loading label="Joining…" /> : null}
            {error ? <ErrorView message={error} onRetry={join} /> : null}
            {token && isFake ? (
              <Card bg={t.tints.yellow.bg} bordered={false} style={{ gap: 6 }}>
                <T variant="title" color={t.tints.yellow.fg}>
                  You’re checked in
                </T>
                <T variant="small" color={t.tints.yellow.fg}>
                  Live video isn’t switched on for CYC yet, so there’s nothing to watch here. Once the team connects a video service, the meeting will play on this screen.
                </T>
              </Card>
            ) : null}
            {webUrl ? <Button label="Open the meeting" icon="video" onPress={() => WebBrowser.openBrowserAsync(webUrl)} /> : null}
            {m.status === "live" && !token && !busy ? <Button label="Join meeting" icon="video" onPress={join} /> : null}
          </View>
        </>
      )}
    </Screen>
  );
}

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api";
import { findDownload } from "./downloads";
import type { Resource, ResourceDetail } from "./types";

type Track = Pick<Resource, "id" | "title" | "author_name" | "kind" | "duration_seconds" | "scripture_reference">;

type PlayerValue = {
  track: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  buffering: boolean;
  /** Load a sermon and start playing (audio only; video plays on its own screen). */
  play: (r: ResourceDetail) => Promise<void>;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (seconds: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerValue | null>(null);

/** One audio player for the whole app, so a sermon keeps playing while you browse. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [track, setTrack] = useState<Track | null>(null);
  const [rate, setRateState] = useState(1);
  const lastSaved = useRef(0);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => undefined);
  }, []);

  const saveProgress = useCallback(
    (completed = false) => {
      if (!track || !status.duration) return;
      const percent = Math.min(100, Math.round((status.currentTime / status.duration) * 100));
      api(`/resources/${track.id}/progress`, {
        method: "PUT",
        body: { percent: completed ? 100 : percent, position_seconds: Math.floor(status.currentTime), completed: completed || percent >= 98 },
      }).catch(() => undefined);
    },
    [track, status.currentTime, status.duration],
  );

  // Save progress every 20 seconds while playing, and when it finishes.
  useEffect(() => {
    if (!track) return;
    if (status.didJustFinish) {
      saveProgress(true);
      return;
    }
    if (status.playing && Date.now() - lastSaved.current > 20000) {
      lastSaved.current = Date.now();
      saveProgress();
    }
  }, [track, status.playing, status.currentTime, status.didJustFinish, saveProgress]);

  const play = useCallback(
    async (r: ResourceDetail) => {
      if (track?.id === r.id) {
        player.play();
        return;
      }
      const saved = await findDownload(r.id);
      const uri = saved?.uri ?? r.file_url ?? r.external_url;
      if (!uri) throw new Error("This sermon has no audio yet.");
      saveProgress();
      player.replace({ uri });
      setTrack(r);
      const resumeAt = r.my_progress && !r.my_progress.completed ? r.my_progress.position_seconds ?? 0 : 0;
      if (resumeAt > 5) await player.seekTo(resumeAt).catch(() => undefined);
      player.setPlaybackRate(rate);
      player.play();
      try {
        player.setActiveForLockScreen(true, { title: r.title, artist: r.author_name ?? "CYC Sermons", albumTitle: "CYC Sermons" });
      } catch {
        // Lock-screen controls aren't available everywhere (e.g. web).
      }
    },
    [player, track, rate, saveProgress],
  );

  const value = useMemo<PlayerValue>(
    () => ({
      track,
      playing: status.playing,
      position: status.currentTime,
      duration: status.duration || track?.duration_seconds || 0,
      rate,
      buffering: status.isBuffering,
      play,
      toggle: () => {
        if (status.playing) {
          player.pause();
          saveProgress();
        } else {
          if (status.duration && status.currentTime >= status.duration - 0.5) void player.seekTo(0);
          player.play();
        }
      },
      seek: (s) => void player.seekTo(Math.max(0, s)),
      skip: (d) => void player.seekTo(Math.max(0, Math.min(status.duration || Infinity, status.currentTime + d))),
      setRate: (r) => {
        setRateState(r);
        player.setPlaybackRate(r);
      },
      stop: () => {
        saveProgress();
        player.pause();
        setTrack(null);
        try {
          player.setActiveForLockScreen(false);
        } catch {
          // ignore
        }
      },
    }),
    [track, status, rate, play, player, saveProgress],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

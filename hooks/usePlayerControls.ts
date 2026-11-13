"use client";

import { useCallback, useEffect, useState } from "react";
import { CONTROL_SCOPE } from "@/lib/spotify/config";
import { hasScope, startLogin } from "@/lib/spotify/auth";
import { PlayerCommandError, RateLimitError, playerNext, playerPause, playerPlay, playerPrevious, playerSeek } from "@/lib/spotify/api";
import { positionAt } from "@/lib/playback/position";
import type { PlaybackApi } from "./usePlayback";

export interface PlayerControls {
  /** session was granted the control scope */
  granted: boolean;
  /** controls can be used right now (scope, no known Premium problem, device not restricted) */
  available: boolean;
  error: string | null;
  /** why controls are off even though they were granted */
  unavailableReason: string | null;
  /** user has to reconnect Spotify once to allow controls */
  needsReconnect: boolean;
  reconnect: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
}

/** Restart the song instead of going back when more than this has played (like Apple Music). */
const RESTART_AFTER_MS = 3000;

export function usePlayerControls(playback: PlaybackApi): PlayerControls {
  const [granted, setGranted] = useState(false);
  const [premiumMissing, setPremiumMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setGranted(hasScope(CONTROL_SCOPE)), []);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(id);
  }, [error]);

  const { optimistic, refresh } = playback;

  const run = useCallback(
    async (cmd: () => Promise<void>) => {
      setError(null);
      try {
        await cmd();
      } catch (e) {
        if (e instanceof PlayerCommandError) {
          if (e.reason === "scope") setGranted(false);
          if (e.reason === "premium") setPremiumMissing(true);
          setError(e.message);
        } else if (e instanceof RateLimitError) setError(e.message);
        else setError(e instanceof Error ? e.message : "Spotify didn't accept the command.");
        refresh(); // undo the optimistic change
      }
    },
    [refresh],
  );

  const seek = useCallback(
    (ms: number) => {
      const target = Math.max(0, Math.round(ms));
      optimistic((p) => (p.anchor ? { ...p, anchor: { ...p.anchor, progressMs: Math.min(target, p.anchor.durationMs || target), at: performance.now() } } : p));
      void run(() => playerSeek(target));
    },
    [optimistic, run],
  );

  const togglePlay = useCallback(() => {
    const playing = playback.anchor?.isPlaying ?? false;
    optimistic((p) => {
      if (!p.anchor) return p;
      const now = performance.now();
      return { ...p, status: playing ? "paused" : "playing", anchor: { ...p.anchor, progressMs: positionAt(p.anchor, now), at: now, isPlaying: !playing } };
    });
    void run(playing ? playerPause : playerPlay);
  }, [playback.anchor, optimistic, run]);

  const next = useCallback(() => {
    optimistic((p) => p);
    void run(playerNext);
  }, [optimistic, run]);

  const previous = useCallback(() => {
    if (positionAt(playback.anchor, performance.now()) > RESTART_AFTER_MS) return seek(0);
    optimistic((p) => p);
    void run(playerPrevious);
  }, [playback.anchor, optimistic, run, seek]);

  return {
    granted,
    available: granted && !premiumMissing && !playback.device?.restricted,
    error,
    unavailableReason: premiumMissing ? "Playback controls need Spotify Premium." : playback.device?.restricted ? "This Spotify device can't be controlled remotely." : null,
    needsReconnect: !granted,
    reconnect: () => void startLogin().catch(() => {}),
    togglePlay,
    next,
    previous,
    seek,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthExpiredError } from "@/lib/spotify/auth";
import { RateLimitError, getPlaybackState, type PlaybackStateResponse } from "@/lib/spotify/api";
import { reconcileAnchor, type Anchor } from "@/lib/playback/position";

export type PlaybackStatus =
  | "connecting"
  | "playing"
  | "paused"
  | "idle" // no active device / nothing playing
  | "unsupported" // ad, podcast, private session
  | "error"
  | "auth-expired";

export interface TrackInfo {
  key: string; // id or uri — stable per track
  id: string | null;
  name: string;
  artists: string[];
  album: string;
  artUrl: string | null;
  artUrlSmall: string | null;
  durationMs: number;
  isLocal: boolean;
  spotifyUrl?: string;
}

export interface Playback {
  status: PlaybackStatus;
  track: TrackInfo | null;
  anchor: Anchor | null;
  deviceName?: string;
  message?: string;
  rateLimitedUntil?: number;
  lastUpdated?: number;
}

const INTERVAL_PLAYING = 1500;
const INTERVAL_PAUSED = 3000;
const INTERVAL_IDLE = 5000;
const INTERVAL_HIDDEN = 10000;

function mapTrack(d: PlaybackStateResponse): TrackInfo | null {
  const it = d.item;
  if (!it) return null;
  const images = [...(it.album?.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return {
    key: it.id ?? it.uri,
    id: it.id,
    name: it.name,
    artists: it.artists.map((a) => a.name).filter(Boolean),
    album: it.album?.name ?? "",
    artUrl: images[0]?.url ?? null,
    artUrlSmall: images[images.length - 1]?.url ?? null,
    durationMs: it.duration_ms,
    isLocal: it.is_local,
    spotifyUrl: it.external_urls?.spotify,
  };
}

export function usePlayback(enabled: boolean): Playback & { refresh: () => void } {
  const [state, setState] = useState<Playback>({ status: "connecting", track: null, anchor: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;

    let next = INTERVAL_IDLE;
    const t0 = performance.now();
    try {
      const data = await getPlaybackState(ctrl.signal);
      const t1 = performance.now();
      // request midpoint ≈ moment the server sampled progress
      const at = (t0 + t1) / 2;

      if (!data) {
        setState({ status: "idle", track: null, anchor: null, message: "Nothing is playing on Spotify right now.", lastUpdated: Date.now() });
      } else if (data.currently_playing_type === "ad") {
        setState((s) => ({ ...s, status: "unsupported", message: "An ad is playing — lyrics resume with the next song.", anchor: null, lastUpdated: Date.now() }));
        next = INTERVAL_PAUSED;
      } else if (data.currently_playing_type === "episode") {
        setState({ status: "unsupported", track: null, anchor: null, deviceName: data.device?.name, message: "Podcast episodes don't have lyrics.", lastUpdated: Date.now() });
      } else {
        const track = mapTrack(data);
        if (!track) {
          setState({
            status: "unsupported",
            track: null,
            anchor: null,
            deviceName: data.device?.name,
            message: data.device?.is_private_session ? "Spotify is in a private session — track info is hidden." : "Spotify isn't sharing track info right now.",
            lastUpdated: Date.now(),
          });
        } else {
          const anchor: Anchor = { progressMs: data.progress_ms ?? 0, at, isPlaying: data.is_playing, durationMs: track.durationMs };
          setState((prev) => {
            const sameTrack = prev.track?.key === track.key;
            return {
              status: data.is_playing ? "playing" : "paused",
              track: sameTrack && prev.track ? prev.track : track,
              anchor: reconcileAnchor(prev.anchor, anchor, sameTrack),
              deviceName: data.device?.name,
              lastUpdated: Date.now(),
            };
          });
          if (data.is_playing) {
            next = INTERVAL_PLAYING;
            // poll right after the song should end so the next one shows up instantly
            const remaining = track.durationMs - (data.progress_ms ?? 0);
            if (remaining > 0 && remaining < next) next = remaining + 400;
          } else next = INTERVAL_PAUSED;
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof AuthExpiredError) {
        setState({ status: "auth-expired", track: null, anchor: null, message: e.message });
        return; // stop polling
      }
      if (e instanceof RateLimitError) {
        next = e.retryAfterMs;
        setState((s) => ({ ...s, rateLimitedUntil: Date.now() + e.retryAfterMs }));
      } else {
        next = INTERVAL_IDLE;
        setState((s) => ({
          ...s,
          status: s.track ? s.status : "error",
          message: navigator.onLine === false ? "You're offline." : e instanceof Error ? e.message : "Couldn't reach Spotify.",
        }));
      }
    }

    if (document.hidden) next = Math.max(next, INTERVAL_HIDDEN);
    timer.current = setTimeout(poll, next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    poll();
    const onVisible = () => !document.hidden && poll();
    const onOnline = () => poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      inflight.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
  }, [enabled, poll]);

  // clear the rate-limit banner once it has passed
  useEffect(() => {
    if (!state.rateLimitedUntil) return;
    const ms = state.rateLimitedUntil - Date.now();
    const t = setTimeout(() => setState((s) => ({ ...s, rateLimitedUntil: undefined })), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [state.rateLimitedUntil]);

  return { ...state, refresh: poll };
}

"use client";

import { useEffect, useState } from "react";
import type { LyricLine, LyricsKind } from "@/lib/lyrics/lrc";
import type { TrackInfo } from "./usePlayback";

export type LyricsState =
  | { status: "idle" }
  | { status: "loading"; trackKey: string }
  | { status: "ready"; trackKey: string; kind: LyricsKind; lines: LyricLine[]; source?: { provider: string; id: number } }
  | { status: "error"; trackKey: string; message: string };

const memo = new Map<string, Extract<LyricsState, { status: "ready" }>>();

export function useLyrics(track: TrackInfo | null, retryNonce = 0): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "idle" });

  useEffect(() => {
    if (!track) {
      setState({ status: "idle" });
      return;
    }
    const key = track.key;
    const hit = memo.get(key);
    if (hit) {
      setState(hit);
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading", trackKey: key });

    const params = new URLSearchParams({
      track: track.name,
      artist: track.artists[0] ?? "",
      album: track.album,
      duration: String(track.durationMs),
    });
    fetch(`/api/lyrics?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Lyrics lookup failed.");
        const ready = { status: "ready" as const, trackKey: key, kind: data.kind as LyricsKind, lines: data.lines as LyricLine[], source: data.source };
        memo.set(key, ready);
        setState(ready);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", trackKey: key, message: e instanceof Error ? e.message : "Lyrics lookup failed." });
      });
    return () => ctrl.abort();
  }, [track?.key, retryNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

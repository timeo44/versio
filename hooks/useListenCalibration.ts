"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { HeardWord } from "@/lib/lyrics/align";

export type ListenState =
  | { phase: "idle" }
  | { phase: "listening"; startedAt: number; durationMs: number }
  | { phase: "matching" }
  | { phase: "error"; message: string };

/** How long to listen. Long enough for 2–3 lyric lines, short enough to feel quick. */
export const LISTEN_MS = 8000;

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIMES.find((m) => MediaRecorder.isTypeSupported?.(m));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const listenSupported = () =>
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/**
 * Records a short clip from the microphone and transcribes it with word
 * timestamps. `onHeard` gets the words plus the performance.now() at which the
 * clip started, so the caller can line the words up with the song clock.
 */
export function useListenCalibration(onHeard: (words: HeardWord[], clipStart: number) => void, meta: { title?: string; artist?: string }) {
  const [state, setState] = useState<ListenState>({ phase: "idle" });
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopTimer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const cleanup = useCallback(() => {
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopTimer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
  }, []);

  useEffect(() => () => {
    cancelled.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    cleanup();
  }, [cleanup]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    cleanup();
    setState({ phase: "idle" });
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!listenSupported()) {
      setState({ phase: "error", message: "This browser can't record audio." });
      return;
    }
    cancelled.current = false;
    let media: MediaStream;
    try {
      // raw signal: echo cancellation / noise suppression would remove the music we want to hear
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setState({ phase: "error", message: denied ? "Microphone access was blocked — allow it in your browser settings." : "Couldn't open the microphone." });
      return;
    }
    if (cancelled.current) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = media;
    const mime = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(media, { mimeType: mime, audioBitsPerSecond: 64_000 }) : new MediaRecorder(media);
    } catch {
      cleanup();
      setState({ phase: "error", message: "This browser can't record audio." });
      return;
    }
    rec.current = recorder;
    const chunks: Blob[] = [];
    let clipStart = 0;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstart = () => {
      clipStart = performance.now();
      setState({ phase: "listening", startedAt: clipStart, durationMs: LISTEN_MS });
      stopTimer.current = window.setTimeout(() => recorder.state === "recording" && recorder.stop(), LISTEN_MS);
    };
    recorder.onstop = async () => {
      const type = recorder.mimeType || mime || "audio/webm";
      cleanup();
      if (cancelled.current) return;
      setState({ phase: "matching" });
      try {
        const blob = new Blob(chunks, { type });
        const audio = await toBase64(blob);
        const res = await apiFetch<{ text: string; words: HeardWord[] }>("/transcribe", {
          method: "POST",
          body: JSON.stringify({ audio, mime: type, title: metaRef.current.title, artist: metaRef.current.artist }),
        });
        if (cancelled.current) return;
        setState({ phase: "idle" });
        onHeardRef.current(res.words ?? [], clipStart);
      } catch (e) {
        if (!cancelled.current) setState({ phase: "error", message: e instanceof Error ? e.message : "Couldn't transcribe the clip." });
      }
    };
    recorder.start();
  }, [cleanup]);

  const fail = useCallback((message: string) => setState({ phase: "error", message }), []);
  const clear = useCallback(() => setState({ phase: "idle" }), []);

  return { state, start, cancel, fail, clear };
}

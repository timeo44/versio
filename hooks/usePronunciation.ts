"use client";

import { useEffect, useState } from "react";
import { needsRomanization, type LyricLine } from "@/lib/lyrics/lrc";
import { apiFetch } from "@/lib/api";

const PREFIX = "versio:rom2:"; // bump when the server transliteration rules change

/**
 * Latin transliterations for the non-Latin lines of a song (Arabic, Japanese,
 * Korean, Cyrillic, …). Only requested when the user turns pronunciation on;
 * cached per song in localStorage.
 */
export function usePronunciation(opts: { enabled: boolean; trackKey: string | null; lines: LyricLine[] | null; title?: string; artist?: string }) {
  const { enabled, trackKey, lines, title, artist } = opts;
  const [map, setMap] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "not-needed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!enabled || !trackKey || !lines?.length) {
      setMap({});
      setStatus("idle");
      return;
    }
    const texts = Array.from(new Set(lines.map((l) => l.text.trim()).filter((t) => t && needsRomanization(t))));
    if (!texts.length) {
      setMap({});
      setStatus("not-needed");
      return;
    }
    let cached: Record<string, string> = {};
    try {
      cached = JSON.parse(localStorage.getItem(PREFIX + trackKey) || "{}");
    } catch {}
    const missing = texts.filter((t) => !(t in cached));
    setMap(cached);
    if (!missing.length) {
      setStatus("done");
      return;
    }

    const ctrl = new AbortController();
    const fullLyrics = lines.map((l) => l.text).join("\n");
    setStatus("loading");
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 20) chunks.push(missing.slice(i, i + 20));
    const acc = { ...cached };
    Promise.all(
      chunks.map((chunk) =>
        apiFetch<{ romanizations: Record<string, string> }>("/romanize", {
          method: "POST",
          body: JSON.stringify({ lines: chunk, context: { title, artist, lyrics: fullLyrics } }),
          signal: ctrl.signal,
        }).then((r) => {
          if (ctrl.signal.aborted) return;
          Object.assign(acc, r.romanizations);
          setMap({ ...acc });
          try {
            localStorage.setItem(PREFIX + trackKey, JSON.stringify(acc));
          } catch {}
        }),
      ),
    )
      .then(() => !ctrl.signal.aborted && setStatus("done"))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Pronunciation failed.");
      });
    return () => ctrl.abort();
  }, [enabled, trackKey, lines, title, artist]);

  return { map, status, error };
}

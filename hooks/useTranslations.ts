"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prioritizedChunks, type LyricLine } from "@/lib/lyrics/lrc";
import type { TranslateResponse } from "@/lib/translation/types";

export interface TranslationState {
  map: Record<string, string>;
  sourceLanguage: string | null;
  status: "idle" | "loading" | "done" | "error" | "same-language";
  error?: string;
  pending: number;
}

const STORE_PREFIX = "versio:tr:";
const INDEX_KEY = "versio:tr:index";
const MAX_STORED_SONGS = 200;

function load(key: string): { map: Record<string, string>; src: string | null } | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, map: Record<string, string>, src: string | null) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify({ map, src }));
    const idx: string[] = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]").filter((k: string) => k !== key);
    idx.push(key);
    while (idx.length > MAX_STORED_SONGS) localStorage.removeItem(STORE_PREFIX + idx.shift());
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* quota — cache is best effort */
  }
}

const CONCURRENCY = 3;

/**
 * Translates a song's lines. The chunk around the current line goes first so
 * the line being sung is translated before anything else; the rest follows in
 * parallel. Results are cached per (provider, song, language) in localStorage
 * and stale responses (song or language changed mid-flight) are discarded.
 */
export function useTranslations(opts: {
  enabled: boolean;
  provider: string;
  trackKey: string | null;
  title?: string;
  artist?: string;
  lines: LyricLine[] | null;
  target: string;
  activeIndex: number;
}): TranslationState & { retry: () => void } {
  const { enabled, provider, trackKey, title, artist, lines, target } = opts;
  const [state, setState] = useState<TranslationState>({ map: {}, sourceLanguage: null, status: "idle", pending: 0 });
  const [nonce, setNonce] = useState(0);
  const activeRef = useRef(opts.activeIndex);
  activeRef.current = opts.activeIndex;

  useEffect(() => {
    if (!enabled || !trackKey || !lines?.length) {
      setState({ map: {}, sourceLanguage: null, status: "idle", pending: 0 });
      return;
    }
    const storeKey = `${provider}:${target}:${trackKey}`;
    const cached = load(storeKey);
    const map: Record<string, string> = { ...(cached?.map ?? {}) };
    let src = cached?.src ?? null;

    const missing = new Set(lines.map((l) => l.text.trim()).filter((t) => t && !(t in map)));
    if (src && src.slice(0, 2) === target.slice(0, 2)) {
      setState({ map, sourceLanguage: src, status: "same-language", pending: 0 });
      return;
    }
    if (!missing.size) {
      setState({ map, sourceLanguage: src, status: "done", pending: 0 });
      return;
    }

    const ctrl = new AbortController();
    const chunks = prioritizedChunks(lines, activeRef.current, missing);
    const fullLyrics = lines.map((l) => l.text).join("\n");
    let remaining = chunks.length;
    let failed: string | null = null;
    setState({ map, sourceLanguage: src, status: "loading", pending: remaining });

    const run = async (chunk: string[]) => {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: chunk, target, context: { title, artist, lyrics: fullLyrics } }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Translation failed (${res.status})`);
      return data as TranslateResponse;
    };

    const apply = (r: TranslateResponse) => {
      if (ctrl.signal.aborted) return;
      Object.assign(map, r.translations);
      if (r.sourceLanguage) src = r.sourceLanguage;
      remaining -= 1;
      save(storeKey, map, src);
      const same = !!src && src.slice(0, 2) === target.slice(0, 2);
      setState({ map: { ...map }, sourceLanguage: src, status: same ? "same-language" : remaining ? "loading" : "done", pending: remaining });
    };

    (async () => {
      // first chunk alone → fastest time-to-first-translation for the current line
      const queue = [...chunks];
      const first = queue.shift();
      try {
        if (first) apply(await run(first));
        if (src && src.slice(0, 2) === target.slice(0, 2)) return; // song already in target language
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (queue.length && !ctrl.signal.aborted) {
            const c = queue.shift()!;
            try {
              apply(await run(c));
            } catch (e) {
              if (ctrl.signal.aborted) return;
              failed = e instanceof Error ? e.message : "Translation failed.";
              remaining -= 1;
            }
          }
        });
        await Promise.all(workers);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        failed = e instanceof Error ? e.message : "Translation failed.";
      }
      if (!ctrl.signal.aborted && failed) {
        setState({ map: { ...map }, sourceLanguage: src, status: "error", error: failed, pending: 0 });
      }
    })();

    return () => ctrl.abort();
    // activeIndex deliberately not a dependency: it only decides chunk order
  }, [enabled, provider, trackKey, lines, target, title, artist, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}

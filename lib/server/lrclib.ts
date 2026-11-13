import { cleanTrackName, parseLrc, parsePlain, type LyricLine, type LyricsKind } from "@/lib/lyrics/lrc";
import { LruCache } from "./cache";
import { env } from "./env";

export interface LyricsResult {
  kind: LyricsKind;
  lines: LyricLine[];
  source?: { provider: "LRCLIB"; id: number; trackName: string; artistName: string };
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const BASE = (env("LRCLIB_BASE_URL") || "https://lrclib.net").replace(/\/$/, "");
const UA = env("LRCLIB_USER_AGENT") || "Versio/1.0 (live lyrics translator)";
const cache = new LruCache<LyricsResult>(1000, 1000 * 60 * 60 * 6);

async function lrclib<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Lrclib-Client": UA },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
  return (await res.json()) as T;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\u0080-￿]+/g, " ").trim();

function toResult(rec: LrclibRecord): LyricsResult | null {
  const source = { provider: "LRCLIB" as const, id: rec.id, trackName: rec.trackName, artistName: rec.artistName };
  if (rec.instrumental) return { kind: "instrumental", lines: [], source };
  if (rec.syncedLyrics) {
    const lines = parseLrc(rec.syncedLyrics);
    if (lines.length) return { kind: "synced", lines, source };
  }
  if (rec.plainLyrics) {
    const lines = parsePlain(rec.plainLyrics);
    if (lines.length) return { kind: "plain", lines, source };
  }
  return null;
}

/**
 * Lookup strategy:
 *  1. exact signature match (track, artist, album, duration ±2 s — LRCLIB rule)
 *  2. search by cleaned title + primary artist, keep candidates whose
 *     duration is within 3 s, prefer synced, closest duration first
 *  3. fall back to plain lyrics, clearly marked as unsynchronized
 */
export async function findLyrics(q: {
  track: string;
  artist: string;
  album?: string;
  durationMs?: number;
}): Promise<LyricsResult> {
  const durationSec = q.durationMs ? Math.round(q.durationMs / 1000) : undefined;
  const key = [q.track, q.artist, q.album ?? "", durationSec ?? ""].join("|").toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let plainFallback: LyricsResult | null = null;

  // 1. exact
  const exactParams: Record<string, string> = { track_name: q.track, artist_name: q.artist };
  if (q.album) exactParams.album_name = q.album;
  if (durationSec) exactParams.duration = String(durationSec);
  const exact = await lrclib<LrclibRecord>("/api/get", exactParams).catch(() => null);
  if (exact) {
    const r = toResult(exact);
    if (r && r.kind !== "plain") {
      cache.set(key, r);
      return r;
    }
    if (r) plainFallback = r;
  }

  // 2. search
  const titles = Array.from(new Set([q.track, cleanTrackName(q.track)]));
  const candidates: LrclibRecord[] = [];
  for (const title of titles) {
    const found = await lrclib<LrclibRecord[]>("/api/search", { track_name: title, artist_name: q.artist }).catch(() => null);
    if (found?.length) candidates.push(...found);
    if (candidates.some((c) => c.syncedLyrics)) break;
  }

  const wantArtist = norm(q.artist);
  const scored = candidates
    .filter((c) => {
      if (durationSec && c.duration && Math.abs(c.duration - durationSec) > 3) return false;
      const a = norm(c.artistName);
      return a.includes(wantArtist) || wantArtist.includes(a);
    })
    .sort((a, b) => {
      const syncA = a.syncedLyrics ? 0 : 1;
      const syncB = b.syncedLyrics ? 0 : 1;
      if (syncA !== syncB) return syncA - syncB;
      const dA = durationSec && a.duration ? Math.abs(a.duration - durationSec) : 99;
      const dB = durationSec && b.duration ? Math.abs(b.duration - durationSec) : 99;
      return dA - dB;
    });

  for (const c of scored) {
    const r = toResult(c);
    if (!r) continue;
    if (r.kind === "plain") {
      plainFallback ??= r;
      continue;
    }
    cache.set(key, r);
    return r;
  }

  const result: LyricsResult = plainFallback ?? { kind: "not_found", lines: [] };
  cache.set(key, result);
  return result;
}

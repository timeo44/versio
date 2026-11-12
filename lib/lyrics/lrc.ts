/**
 * LRC parsing + synchronization helpers. Pure functions, no DOM.
 */

export interface LyricLine {
  /** Stable index within the song */
  id: number;
  /** Start time in ms, or null for unsynchronized lyrics */
  timeMs: number | null;
  /** Line text. Empty string = instrumental gap (rendered as ♪) */
  text: string;
}

export type LyricsKind = "synced" | "plain" | "instrumental" | "not_found";

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-z]+):(.*)\]\s*$/i;

function fractionToMs(frac: string | undefined): number {
  if (!frac) return 0;
  if (frac.length === 1) return Number(frac) * 100;
  if (frac.length === 2) return Number(frac) * 10;
  return Number(frac.slice(0, 3));
}

/**
 * Parse line-synced LRC text. Supports multiple timestamps per line
 * ([00:12.00][01:30.50]Chorus), 1–3 digit fractions and the [offset:] tag.
 * Returns lines sorted by time.
 */
export function parseLrc(raw: string): LyricLine[] {
  let offset = 0;
  const entries: { timeMs: number; text: string; order: number }[] = [];
  let order = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = line.match(META_TAG);
    if (meta && !/^\d/.test(meta[1])) {
      if (meta[1].toLowerCase() === "offset") {
        const n = parseInt(meta[2].trim(), 10);
        if (!Number.isNaN(n)) offset = n;
      }
      continue;
    }

    const stamps: number[] = [];
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME_TAG.exec(line)) !== null) {
      // only leading tags count as line timestamps
      if (m.index !== lastEnd) break;
      stamps.push(Number(m[1]) * 60_000 + Number(m[2]) * 1000 + fractionToMs(m[3]));
      lastEnd = TIME_TAG.lastIndex;
    }
    if (stamps.length === 0) continue;

    // strip enhanced/word-level tags like <00:12.34>
    const text = line.slice(lastEnd).replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "").trim();
    for (const t of stamps) entries.push({ timeMs: Math.max(0, t - offset), text, order: order++ });
  }

  entries.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);

  // collapse consecutive empty gaps
  const out: LyricLine[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.text === "" && e.text === "") continue;
    out.push({ id: out.length, timeMs: e.timeMs, text: e.text });
  }
  // a leading empty line before the first lyric is noise
  while (out.length && out[0].text === "" && out.length > 1 && out[0].timeMs === 0) out.shift();
  return out.map((l, i) => ({ ...l, id: i }));
}

/** Plain (unsynchronized) lyrics → lines without timestamps. */
export function parsePlain(raw: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const text = rawLine.trim();
    const prev = out[out.length - 1];
    if (text === "" && (!prev || prev.text === "")) continue;
    out.push({ id: out.length, timeMs: null, text });
  }
  while (out.length && out[out.length - 1].text === "") out.pop();
  return out;
}

/**
 * Index of the line that is active at `positionMs`
 * (last line whose start <= position). -1 before the first line.
 */
export function findActiveIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = lines[mid].timeMs;
    if (t === null) return -1;
    if (t <= positionMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Strip Spotify-style suffixes that break lyric lookups. */
export function cleanTrackName(name: string): string {
  return name
    .replace(/\s*[-–]\s*(\d{4}\s+)?(remaster(ed)?|live|mono|stereo|single version|radio edit|edit|version|mix|acoustic|demo|bonus track).*$/i, "")
    .replace(/\s*[([](feat\.?|ft\.?|with|prod\.?)[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([](\d{4}\s+)?remaster(ed)?[^)\]]*[)\]]/gi, "")
    .trim();
}

/** Unique, non-empty line texts in first-appearance order. */
export function uniqueTexts(lines: { text: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const t = l.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Order texts so the ones around the current line come first, then split
 * into chunks. The first chunk is what the listener needs right now.
 */
export function prioritizedChunks(
  lines: { text: string }[],
  activeIndex: number,
  missing: Set<string>,
  chunkSize = 14,
): string[][] {
  const start = Math.max(0, activeIndex);
  const ordered = [...lines.slice(start), ...lines.slice(0, start)];
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const l of ordered) {
    const t = l.text.trim();
    if (!t || seen.has(t) || !missing.has(t)) continue;
    seen.add(t);
    queue.push(t);
  }
  const chunks: string[][] = [];
  for (let i = 0; i < queue.length; i += chunkSize) chunks.push(queue.slice(i, i + chunkSize));
  return chunks;
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** True if the text contains letters outside the Latin script (Arabic, CJK, Cyrillic, …). */
export function needsRomanization(text: string): boolean {
  return /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text);
}

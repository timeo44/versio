import type { LyricLine } from "./lrc";

/** A word heard through the microphone, `start` in seconds from the start of the clip. */
export interface HeardWord {
  word: string;
  start: number;
}

export interface LineMatch {
  index: number;
  /** offset (ms) that would make this line start exactly when it was heard */
  offsetMs: number;
  score: number;
}

const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/u;

/** Lower-cased, accent- and punctuation-free tokens; CJK splits per character. */
export function tokens(text: string): string[] {
  const norm = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const out: string[] = [];
  for (const w of norm.split(/\s+/)) {
    if (!w) continue;
    if (CJK.test(w)) out.push(...Array.from(w));
    else out.push(w);
  }
  return out;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams (0…1), tolerant of mishearings. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    inter += Math.min(n, B.get(g) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

/**
 * Find where lyric lines begin inside a transcribed clip and derive the timing
 * offset. `songMsAt(sec)` maps a clip time to the (un-offset) song position.
 * Repeated lines (choruses) produce several candidate offsets; the one most
 * lines agree on wins, ties go to the one closest to `currentOffsetMs`.
 */
export function alignHeard(
  lines: LyricLine[],
  heard: HeardWord[],
  songMsAt: (clipSec: number) => number,
  currentOffsetMs = 0,
  minScore = 0.72,
): { offsetMs: number; matches: LineMatch[] } | null {
  const ht: { t: string; start: number }[] = [];
  for (const w of heard) for (const t of tokens(w.word)) ht.push({ t, start: w.start });
  if (ht.length < 2) return null;

  const candidates: LineMatch[] = [];
  lines.forEach((line, index) => {
    if (line.timeMs === null) return;
    const lt = tokens(line.text);
    const cjk = lt.length > 0 && CJK.test(lt[0]);
    const k = Math.min(cjk ? 6 : 4, lt.length);
    const probe = lt.slice(0, k).join(" ");
    // too short to identify a line reliably ("oh", "yeah")
    if (k < (cjk ? 3 : 2) || probe.length < 6) return;
    let best = 0;
    let at = -1;
    for (let j = 0; j < ht.length; j++) {
      for (const len of [k - 1, k, k + 1]) {
        if (len < 1 || j + len > ht.length) continue;
        const sc = similarity(probe, ht.slice(j, j + len).map((h) => h.t).join(" "));
        if (sc > best) (best = sc), (at = j);
      }
    }
    if (best >= minScore && at >= 0) candidates.push({ index, score: best, offsetMs: Math.round(line.timeMs - songMsAt(ht[at].start)) });
  });
  if (!candidates.length) return null;

  const AGREE_MS = 1200;
  let bestCluster: LineMatch[] = [];
  let bestWeight = -1;
  let bestDist = Infinity;
  for (const c of candidates) {
    const cluster = candidates.filter((o) => Math.abs(o.offsetMs - c.offsetMs) <= AGREE_MS);
    const weight = cluster.reduce((s, o) => s + o.score, 0);
    const dist = Math.abs(c.offsetMs - currentOffsetMs);
    if (weight > bestWeight + 1e-9 || (Math.abs(weight - bestWeight) <= 1e-9 && dist < bestDist)) {
      bestCluster = cluster;
      bestWeight = weight;
      bestDist = dist;
    }
  }
  // a single, merely-plausible match is too weak to trust
  if (bestCluster.length === 1 && bestCluster[0].score < 0.85) return null;

  const offs = bestCluster.map((c) => c.offsetMs).sort((a, b) => a - b);
  const mid = offs.length >> 1;
  const median = offs.length % 2 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2;
  return { offsetMs: Math.round(median / 10) * 10, matches: bestCluster.sort((a, b) => a.index - b.index) };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { positionAt, type Anchor } from "@/lib/playback/position";
import { findActiveIndex, type LyricLine } from "@/lib/lyrics/lrc";

/** Position in ms, re-rendering at most every `everyMs`. */
export function usePosition(anchor: Anchor | null, everyMs = 250, offsetMs = 0): number {
  const [pos, setPos] = useState(() => positionAt(anchor, performance.now(), offsetMs));
  useEffect(() => {
    setPos(positionAt(anchor, performance.now(), offsetMs));
    if (!anchor?.isPlaying) return;
    const id = setInterval(() => setPos(positionAt(anchor, performance.now(), offsetMs)), everyMs);
    return () => clearInterval(id);
  }, [anchor, everyMs, offsetMs]);
  return pos;
}

/**
 * Active lyric index, driven by requestAnimationFrame for frame-accurate
 * switching but only re-rendering when the index actually changes.
 */
export function useActiveLine(lines: LyricLine[] | null, anchor: Anchor | null, offsetMs: number, enabled: boolean): number {
  const [idx, setIdx] = useState(-1);
  const idxRef = useRef(-1);

  useEffect(() => {
    if (!enabled || !lines?.length || !anchor) {
      idxRef.current = -1;
      setIdx(-1);
      return;
    }
    let raf = 0;
    const tick = () => {
      const i = findActiveIndex(lines, positionAt(anchor, performance.now(), offsetMs));
      if (i !== idxRef.current) {
        idxRef.current = i;
        setIdx(i);
      }
      if (anchor.isPlaying) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [lines, anchor, offsetMs, enabled]);

  return idx;
}

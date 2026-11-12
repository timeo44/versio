"use client";

import { useEffect, useState } from "react";

export type RGB = [number, number, number];
const FALLBACK: RGB = [40, 40, 48];
const memo = new Map<string, RGB>();

/**
 * Picks a vivid, representative color from the album art (canvas sampling).
 * Falls back to a neutral tone if the image can't be read.
 */
export function useDominantColor(url: string | null): RGB {
  const [rgb, setRgb] = useState<RGB>(() => (url && memo.get(url)) || FALLBACK);

  useEffect(() => {
    if (!url) return setRgb(FALLBACK);
    const hit = memo.get(url);
    if (hit) return setRgb(hit);
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 40;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (max + min) / 510;
          // favour saturated mid-tones, ignore near-black/white
          const weight = sat * sat * (lum > 0.08 && lum < 0.92 ? 1 : 0.05) + 0.02;
          r += R * weight; g += G * weight; b += B * weight; w += weight;
        }
        let out: RGB = [r / w, g / w, b / w].map(Math.round) as RGB;
        // keep it readable behind white text: cap brightness
        const l = (0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]) / 255;
        if (l > 0.55) out = out.map((v) => Math.round(v * (0.55 / l))) as RGB;
        memo.set(url, out);
        if (!cancelled) setRgb(out);
      } catch {
        if (!cancelled) setRgb(FALLBACK);
      }
    };
    img.onerror = () => !cancelled && setRgb(FALLBACK);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return rgb;
}

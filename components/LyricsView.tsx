"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LyricLine } from "@/lib/lyrics/lrc";
import type { DisplayMode } from "@/hooks/useSettings";
import { isRtl } from "@/lib/languages";
import { IconArrowDown } from "./icons";

interface Props {
  trackKey: string;
  lines: LyricLine[];
  synced: boolean;
  activeIndex: number;
  translations: Record<string, string>;
  pronunciations?: Record<string, string>;
  translating: boolean;
  showTranslation: boolean;
  mode: DisplayMode;
  targetLang: string;
  sourceLang: string | null;
  onSelect: (index: number) => void;
}

/** Where the active line sits in the viewport (fraction from top). */
const FOCUS = 0.34;

export function LyricsView(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const lineEls = useRef<(HTMLDivElement | null)[]>([]);
  const [follow, setFollow] = useState(true);
  const programmatic = useRef(false);

  // new song → back to the top, follow on
  useLayoutEffect(() => {
    setFollow(true);
    scroller.current?.scrollTo({ top: 0 });
  }, [p.trackKey]);

  const scrollToActive = useCallback(
    (smooth = true) => {
      const el = lineEls.current[Math.max(0, p.activeIndex)];
      const box = scroller.current;
      if (!el || !box) return;
      const top = el.offsetTop - box.clientHeight * FOCUS + el.clientHeight / 2;
      programmatic.current = true;
      box.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
      window.setTimeout(() => (programmatic.current = false), 700);
    },
    [p.activeIndex],
  );

  useEffect(() => {
    if (p.synced && follow) scrollToActive(true);
  }, [p.activeIndex, p.synced, follow, scrollToActive]);

  // translations arriving change line heights — keep the focus steady
  useEffect(() => {
    if (p.synced && follow) scrollToActive(false);
  }, [p.mode, p.showTranslation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any user-initiated scroll releases "follow"
  useEffect(() => {
    const box = scroller.current;
    if (!box || !p.synced) return;
    const release = () => setFollow(false);
    const onKey = (e: KeyboardEvent) => ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && release();
    box.addEventListener("wheel", release, { passive: true });
    box.addEventListener("touchmove", release, { passive: true });
    box.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("wheel", release);
      box.removeEventListener("touchmove", release);
      box.removeEventListener("keydown", onKey);
    };
  }, [p.synced]);

  const rtlTranslation = isRtl(p.targetLang);
  const rtlOriginal = isRtl(p.sourceLang);

  return (
    <div className="relative h-full">
      <div
        ref={scroller}
        tabIndex={0}
        className="lyrics-mask h-full overflow-y-auto overscroll-contain px-1 focus:outline-hidden"
        style={{ scrollbarWidth: "none" }}
      >
        <div className={p.synced ? "pb-[60vh] pt-[24vh] md:pt-[30vh]" : "pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4"}>
          {p.lines.map((line, i) => (
            <Line
              key={`${p.trackKey}-${line.id}`}
              ref={(el) => {
                lineEls.current[i] = el;
              }}
              line={line}
              distance={p.synced && p.activeIndex >= 0 ? i - p.activeIndex : p.synced ? i + 1 : 0}
              synced={p.synced}
              browsing={!follow}
              translation={p.showTranslation ? p.translations[line.text.trim()] : undefined}
              pronunciation={p.pronunciations?.[line.text.trim()]}
              pending={p.showTranslation && p.translating && !!line.text.trim() && !(line.text.trim() in p.translations)}
              mode={p.showTranslation ? p.mode : "original"}
              rtlOriginal={rtlOriginal}
              rtlTranslation={rtlTranslation}
              onSelect={() => p.onSelect(i)}
            />
          ))}
        </div>
      </div>

      {p.synced && !follow && (
        <button
          onClick={() => {
            setFollow(true);
            scrollToActive(true);
          }}
          className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 animate-fadeUp select-none items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black shadow-xl transition active:scale-95"
        >
          <IconArrowDown width={15} height={15} /> Follow live
        </button>
      )}
    </div>
  );
}

interface LineProps {
  line: LyricLine;
  distance: number;
  synced: boolean;
  browsing: boolean;
  translation?: string;
  pronunciation?: string;
  pending: boolean;
  mode: DisplayMode;
  rtlOriginal: boolean;
  rtlTranslation: boolean;
  onSelect: () => void;
  ref?: React.Ref<HTMLDivElement>;
}

const Line = memo(function Line({ line, distance, synced, browsing, translation, pronunciation, pending, mode, rtlOriginal, rtlTranslation, onSelect, ref }: LineProps) {
  const active = synced && distance === 0;
  const near = synced && Math.abs(distance) === 1;
  const isGap = !line.text.trim();

  // three levels: current (bright), neighbours (muted), rest (faint)
  let opacity = 1;
  let scale = 1;
  let blur = 0;
  if (synced) {
    if (active) opacity = 1;
    else if (near) (opacity = browsing ? 0.6 : 0.42), (scale = 0.92);
    else (opacity = browsing ? 0.5 : distance < 0 ? 0.16 : 0.22), (scale = 0.9), (blur = browsing ? 0 : Math.min(1.2, Math.abs(distance) * 0.25));
  } else opacity = 0.9;

  if (isGap) {
    if (!synced) return <div ref={ref} className="h-6" />;
    return (
      <div ref={ref} className="flex h-14 items-center gap-2 py-2 pl-1 transition-opacity duration-500" style={{ opacity: active ? 1 : 0.18 }} aria-label="Instrumental">
        {[0, 1, 2].map((d) => (
          <span key={d} className={`h-2.5 w-2.5 rounded-full bg-white ${active ? "animate-pulse" : ""}`} style={{ animationDelay: `${d * 0.25}s` }} />
        ))}
      </div>
    );
  }

  const showOriginal = mode !== "translation" || !translation;
  const showTranslation = mode !== "original";
  const translationIsMain = mode === "translation" && !!translation;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      onClick={onSelect}
      className="group cursor-pointer select-none origin-left rounded-2xl py-2.5 transition-[opacity,transform,filter] duration-700 ease-glide hover:!opacity-90 md:py-4"
      style={{ opacity, transform: `scale(${scale})`, filter: blur ? `blur(${blur}px)` : undefined }}
      aria-current={active ? "true" : undefined}
    >
      {showOriginal && (
        <p
          dir={rtlOriginal ? "rtl" : "auto"}
          className={`text-balance text-left font-bold leading-[1.15] tracking-[-0.02em] text-white transition-colors ${
            translationIsMain ? "" : "text-[24px] sm:text-[28px] md:text-[38px] xl:text-[44px]"
          } ${mode === "translation" ? "text-[24px] text-white/50 sm:text-[28px] md:text-[38px]" : ""}`}
        >
          {line.text}
        </p>
      )}

      {showOriginal && pronunciation && (
        <p dir="ltr" className="mt-1 text-[14px] font-normal leading-snug tracking-[0.01em] text-white/55 sm:text-[15px] md:text-[18px]">
          {pronunciation}
        </p>
      )}

      {showTranslation && (translation || pending) && (
        <div className={showOriginal ? "mt-2 md:mt-2.5" : ""}>
          {translation ? (
            <p
              dir={rtlTranslation ? "rtl" : "auto"}
              className={
                translationIsMain
                  ? "text-balance text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-white sm:text-[28px] md:text-[38px] xl:text-[44px]"
                  : "text-balance text-[17px] font-medium leading-snug tracking-[-0.01em] text-[color:var(--accent-text)] sm:text-[19px] md:text-[24px] xl:text-[27px]"
              }
            >
              {translation}
            </p>
          ) : (
            <span className="block h-6 w-2/3 max-w-md animate-shimmer rounded-lg bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.12),rgba(255,255,255,0.04))] bg-[length:200%_100%] md:h-7" />
          )}
        </div>
      )}
    </div>
  );
});

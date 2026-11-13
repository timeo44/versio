"use client";

import { useRef, useState } from "react";
import { formatTime } from "@/lib/lyrics/lrc";
import type { Anchor } from "@/lib/playback/position";
import { usePosition } from "@/hooks/useClock";
import type { Playback } from "@/hooks/usePlayback";
import type { PlayerControls } from "@/hooks/usePlayerControls";
import { Equalizer, IconChevron, IconNext, IconPause, IconPlay, IconPrevious } from "./icons";

export function ProgressBar({ anchor, durationMs, thin }: { anchor: Anchor | null; durationMs: number; thin?: boolean }) {
  const pos = usePosition(anchor, 250);
  const pct = durationMs ? Math.min(100, (pos / durationMs) * 100) : 0;
  return (
    <div>
      <div className={`relative w-full overflow-hidden rounded-full bg-white/[0.12] ${thin ? "h-[3px]" : "h-1"}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      {!thin && (
        <div className="mt-2 flex justify-between text-[12px] tabular-nums text-white/45">
          <span>{formatTime(pos)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      )}
    </div>
  );
}

/** Progress bar you can tap or drag to seek (when controls are available). */
export function SeekBar({ anchor, durationMs, onSeek }: { anchor: Anchor | null; durationMs: number; onSeek?: (ms: number) => void }) {
  const pos = usePosition(anchor, 250);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? pos;
  const pct = durationMs ? Math.min(100, (shown / durationMs) * 100) : 0;

  const at = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !box.width) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * durationMs;
  };

  return (
    <div>
      <div
        ref={track}
        className={`group relative flex h-5 touch-none items-center ${onSeek ? "cursor-pointer" : ""}`}
        onPointerDown={(e) => {
          if (!onSeek) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag !== null && setDrag(at(e.clientX))}
        onPointerUp={(e) => {
          if (drag === null || !onSeek) return;
          onSeek(at(e.clientX));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        role={onSeek ? "slider" : undefined}
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
      >
        <div className={`relative w-full overflow-hidden rounded-full bg-white/[0.14] transition-[height] ${drag !== null ? "h-2" : "h-1"}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full bg-white ${drag !== null ? "" : "transition-[width] duration-300 ease-linear"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[12px] tabular-nums text-white/45">
        <span>{formatTime(shown)}</span>
        <span>-{formatTime(Math.max(0, durationMs - shown))}</span>
      </div>
    </div>
  );
}

/** Previous · play/pause · next — or a one-time "allow controls" prompt. */
function Transport({ playing, controls, size = "md" }: { playing: boolean; controls: PlayerControls; size?: "md" | "lg" }) {
  if (controls.needsReconnect)
    return (
      <div className="flex flex-col items-center gap-2 py-1 text-center">
        <p className="text-[12px] text-white/50">Control Spotify from here — needs one quick reconnect.</p>
        <button onClick={controls.reconnect} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition active:scale-95">
          Allow playback controls
        </button>
      </div>
    );
  const off = !controls.available;
  const side = "grid h-12 w-12 place-items-center rounded-full text-white transition active:scale-90 active:bg-white/[0.1] disabled:opacity-30";
  const big = size === "lg" ? "h-16 w-16" : "h-14 w-14";
  return (
    <div>
      <div className="flex items-center justify-center gap-6">
        <button className={side} onClick={controls.previous} disabled={off} aria-label="Previous">
          <IconPrevious width={26} height={26} />
        </button>
        <button
          className={`grid ${big} place-items-center rounded-full bg-white text-black shadow-[0_8px_30px_-8px_rgba(255,255,255,0.35)] transition active:scale-90 disabled:opacity-30`}
          onClick={controls.togglePlay}
          disabled={off}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <IconPause width={26} height={26} /> : <IconPlay width={26} height={26} className="translate-x-[1px]" />}
        </button>
        <button className={side} onClick={controls.next} disabled={off} aria-label="Next">
          <IconNext width={26} height={26} />
        </button>
      </div>
      {(controls.error || controls.unavailableReason) && (
        <p className="mt-2 animate-fadeUp text-center text-[12px] text-amber-100/80">{controls.error ?? controls.unavailableReason}</p>
      )}
    </div>
  );
}

export function NowPlaying({ playback, glow, meta, controls }: { playback: Playback; glow: string; meta?: React.ReactNode; controls: PlayerControls }) {
  const [open, setOpen] = useState(false);
  const t = playback.track;
  if (!t) return null;
  const playing = playback.status === "playing";
  const seek = controls.available ? controls.seek : undefined;

  return (
    <section className="animate-fadeUp">
      {/* Desktop: large art */}
      <div className="hidden lg:block">
        <div className="relative">
          <div className="absolute -inset-6 rounded-[40px] opacity-60 blur-3xl transition-colors duration-1000" style={{ background: glow }} />
          {t.artUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t.artUrl} src={t.artUrl} alt={`${t.album} cover`} className="relative aspect-square w-full animate-fadeUp rounded-[28px] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" />
          ) : (
            <div className="relative grid aspect-square w-full place-items-center rounded-[28px] bg-white/[0.04] text-white/30">No artwork</div>
          )}
        </div>
        <div className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-white">{t.name}</h1>
          <p className="mt-1.5 text-[17px] text-white/70">{t.artists.join(", ")}</p>
          <p className="mt-0.5 text-sm text-white/40">{t.album}</p>
        </div>
        <div className="mt-7">
          <SeekBar anchor={playback.anchor} durationMs={t.durationMs} onSeek={seek} />
        </div>
        <div className="mt-4">
          <Transport playing={playing} controls={controls} size="lg" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5">
            {playing ? <Equalizer playing /> : <IconPause width={11} height={11} />}
            {playing ? "Playing" : "Paused"}
            {playback.deviceName && <span className="text-white/35">· {playback.deviceName}</span>}
          </span>
          {meta}
        </div>
      </div>

      {/* Mobile: compact card */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] backdrop-blur-xl lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide player" : "Show player"}
        className="flex w-full items-center gap-3.5 p-2.5 pr-3 text-left"
      >
        {t.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.artUrlSmall ?? t.artUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-white">{t.name}</p>
            {playing ? <Equalizer playing /> : <IconPause width={10} height={10} className="text-white/50" />}
          </div>
          <p className="truncate text-[13px] text-white/55">
            {t.artists.join(", ")} · {t.album}
          </p>
          <div className={`mt-2 transition-opacity duration-300 ${open ? "opacity-0" : ""}`}>
            <ProgressBar anchor={playback.anchor} durationMs={t.durationMs} thin />
          </div>
        </div>
        <IconChevron width={18} height={18} className={`shrink-0 text-white/40 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4 pt-0.5">
            <SeekBar anchor={playback.anchor} durationMs={t.durationMs} onSeek={seek} />
            <div className="mt-2">
              <Transport playing={playing} controls={controls} />
            </div>
            {playback.deviceName && <p className="mt-3 text-center text-[11px] text-white/35">Playing on {playback.deviceName}</p>}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

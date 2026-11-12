"use client";

import { formatTime } from "@/lib/lyrics/lrc";
import type { Anchor } from "@/lib/playback/position";
import { usePosition } from "@/hooks/useClock";
import type { Playback } from "@/hooks/usePlayback";
import { Equalizer, IconPause } from "./icons";

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

export function NowPlaying({ playback, glow, meta }: { playback: Playback; glow: string; meta?: React.ReactNode }) {
  const t = playback.track;
  if (!t) return null;
  const playing = playback.status === "playing";

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
          <ProgressBar anchor={playback.anchor} durationMs={t.durationMs} />
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
      <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-2.5 pr-4 backdrop-blur-xl lg:hidden">
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
          <div className="mt-2">
            <ProgressBar anchor={playback.anchor} durationMs={t.durationMs} thin />
          </div>
        </div>
      </div>
    </section>
  );
}

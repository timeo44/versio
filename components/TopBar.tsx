"use client";

import type { PlaybackStatus } from "@/hooks/usePlayback";
import { LanguageSelect } from "./LanguageSelect";
import { IconBookmark, IconSettings, Logo } from "./icons";
import { btn } from "./StateMessage";

const STATUS: Record<PlaybackStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting", dot: "bg-white/40 animate-pulse" },
  playing: { label: "Live", dot: "bg-spotify" },
  paused: { label: "Paused", dot: "bg-white/50" },
  idle: { label: "Connected", dot: "bg-spotify/60" },
  unsupported: { label: "Connected", dot: "bg-spotify/60" },
  error: { label: "Reconnecting", dot: "bg-amber-400 animate-pulse" },
  "auth-expired": { label: "Disconnected", dot: "bg-rose-400" },
};

export function TopBar({
  status,
  targetLang,
  onLang,
  provider,
  vocabCount,
  onVocab,
  onSettings,
}: {
  status: PlaybackStatus;
  targetLang: string;
  onLang: (c: string) => void;
  provider: string;
  vocabCount: number;
  onVocab: () => void;
  onSettings: () => void;
}) {
  const s = STATUS[status];
  return (
    <header className="relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center pt-[env(safe-area-inset-top)] justify-between gap-3 px-4 md:px-8">
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="hidden text-[15px] font-semibold tracking-tight text-white sm:inline">Versio</span>
        <span className="ml-2 hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/60 md:inline-flex">
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          Spotify · {s.label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`mr-1 h-2 w-2 rounded-full md:hidden ${s.dot}`} title={`Spotify · ${s.label}`} />
        <LanguageSelect value={targetLang} onChange={onLang} provider={provider} />
        <button className={`${btn.icon} relative`} onClick={onVocab} aria-label="Vocabulary">
          <IconBookmark />
          {vocabCount > 0 && <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-white px-1 text-[10px] font-bold leading-4 text-black">{vocabCount > 99 ? "99+" : vocabCount}</span>}
        </button>
        <button className={btn.icon} onClick={onSettings} aria-label="Settings">
          <IconSettings />
        </button>
      </div>
    </header>
  );
}

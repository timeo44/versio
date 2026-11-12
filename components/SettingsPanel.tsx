"use client";

import { useEffect, useState } from "react";
import type { DisplayMode, Settings } from "@/hooks/useSettings";
import type { AppConfig } from "@/hooks/useConfig";
import { getMe, type SpotifyUser } from "@/lib/spotify/api";
import { Sheet } from "./Sheet";
import { IconSpotify } from "./icons";
import { btn } from "./StateMessage";

export const MODES: { id: DisplayMode; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "original", label: "Original" },
  { id: "translation", label: "Translation" },
];

export function ModeToggle({ value, onChange, className = "" }: { value: DisplayMode; onChange: (m: DisplayMode) => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1 ${className}`} role="radiogroup" aria-label="Lyrics display">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${value === m.id ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  update,
  config,
  onDisconnect,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  config: AppConfig | null;
  onDisconnect: () => void;
}) {
  const [me, setMe] = useState<SpotifyUser | null>(null);
  useEffect(() => {
    if (open && !me) getMe().then(setMe).catch(() => {});
  }, [open, me]);

  const providerLabel = config?.provider === "openai" ? "OpenAI (context-aware)" : config?.provider === "deepl" ? "DeepL" : "Not configured";

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-8">
        <Group label="Lyrics display">
          <ModeToggle value={settings.displayMode} onChange={(displayMode) => update({ displayMode })} />
        </Group>

        <Group label="Timing offset" hint="Nudge lyrics if they feel early or late on your device (e.g. Bluetooth latency).">
          <div className="flex items-center gap-3">
            <button className={btn.icon} onClick={() => update({ offsetMs: settings.offsetMs - 100 })} aria-label="Lyrics later">−</button>
            <input
              type="range"
              min={-2000}
              max={2000}
              step={50}
              value={settings.offsetMs}
              onChange={(e) => update({ offsetMs: Number(e.target.value) })}
              className="flex-1 accent-white"
              aria-label="Timing offset"
            />
            <button className={btn.icon} onClick={() => update({ offsetMs: settings.offsetMs + 100 })} aria-label="Lyrics earlier">+</button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[12px] text-white/45">
            <span className="tabular-nums">
              {settings.offsetMs === 0 ? "No offset" : `${settings.offsetMs > 0 ? "+" : ""}${(settings.offsetMs / 1000).toFixed(2)} s ${settings.offsetMs > 0 ? "(earlier)" : "(later)"}`}
            </span>
            {settings.offsetMs !== 0 && (
              <button className="text-white/60 underline-offset-2 hover:underline" onClick={() => update({ offsetMs: 0 })}>
                Reset
              </button>
            )}
          </div>
        </Group>

        <Group label="Services">
          <dl className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] text-sm">
            <Row k="Translation" v={providerLabel} ok={config?.provider !== "none"} />
            <Row k="Line explanations" v={config?.explanations ? "Available" : "Needs OpenAI key"} ok={!!config?.explanations} />
            <Row k="Lyrics" v="LRCLIB (synced LRC)" ok />
            <Row k="Vocabulary" v={config?.vocabularySync ? "Synced via Supabase" : "This device only"} ok />
          </dl>
        </Group>

        <Group label="Spotify">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <IconSpotify className="shrink-0 text-spotify" width={28} height={28} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{me?.display_name || me?.id || "Connected"}</p>
                <p className="text-[12px] text-white/40">Read-only playback access</p>
              </div>
            </div>
            <button className={btn.ghost} onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </Group>

        <p className="text-[11px] leading-relaxed text-white/30">
          Lyrics are provided by LRCLIB and remain the property of their respective rights holders. Versio displays them for personal, non-commercial listening only.
        </p>
      </div>
    </Sheet>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</h3>
      {hint && <p className="mt-1 text-[13px] text-white/45">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-white/55">{k}</dt>
      <dd className="flex items-center gap-2 text-white/85">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-spotify" : "bg-amber-400"}`} />
        {v}
      </dd>
    </div>
  );
}

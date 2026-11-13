"use client";

import { useEffect, useState } from "react";
import type { DisplayMode, Settings } from "@/hooks/useSettings";
import type { AppConfig } from "@/hooks/useConfig";
import { getMe, type SpotifyUser } from "@/lib/spotify/api";
import { Sheet } from "./Sheet";
import { IconSpotify } from "./icons";
import { btn } from "./StateMessage";
import { IconChevron } from "./icons";
import type { AccessInfo } from "@/lib/access/types";
import type { DeviceInfo } from "@/hooks/usePlayback";
import { IconMic, IconTap, IconTrash } from "./icons";

export const MODES: { id: DisplayMode; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "original", label: "Original" },
  { id: "translation", label: "Translation" },
];

export function ModeToggle({ value, onChange, className = "" }: { value: DisplayMode; onChange: (m: DisplayMode) => void; className?: string }) {
  return (
    <div className={`flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1 sm:inline-flex ${className}`} role="radiogroup" aria-label="Lyrics display">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={`flex-1 select-none rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:flex-none ${value === m.id ? "bg-white text-black" : "text-white/60 active:text-white hover:text-white"}`}
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
  access,
  onOpenAdmin,
  onOpen,
  onDisconnect,
  canCalibrate,
  onCalibrate,
  onListen,
  device,
  offsetMs,
  setOffset,
  removeDevice,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  config: AppConfig | null;
  access: AccessInfo;
  onOpenAdmin: () => void;
  onOpen: () => void;
  onDisconnect: () => void;
  canCalibrate: boolean;
  onCalibrate: () => void;
  /** undefined when listening isn't available (no OpenAI key / no mic API) */
  onListen?: () => void;
  device?: DeviceInfo;
  offsetMs: number;
  setOffset: (ms: number) => void;
  removeDevice: (key: string) => void;
}) {
  useEffect(() => {
    if (open) onOpen();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [me, setMe] = useState<SpotifyUser | null>(null);
  useEffect(() => {
    if (open && !me) getMe().then(setMe).catch(() => {});
  }, [open, me]);

  const savedDevices = Object.entries(settings.deviceOffsets).sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  const providerLabel = config?.provider === "openai" ? "OpenAI (context-aware)" : config?.provider === "deepl" ? "DeepL" : "Not configured";

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-8">
        {access.role === "admin" && (
          <Group label="Admin">
            {access.accessControl ? (
              <button
                onClick={onOpenAdmin}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">User management</p>
                  <p className="mt-0.5 text-[12px] text-white/45">Invite people, approve requests, set rate limits</p>
                </div>
                <IconChevron width={16} height={16} className="-rotate-90 text-white/50" />
              </button>
            ) : (
              <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[13px] leading-relaxed text-white/50">
                User management and rate limits need a database. Add <code className="text-white/80">SUPABASE_URL</code> and <code className="text-white/80">SUPABASE_SERVICE_ROLE_KEY</code> (see README) — until then everyone Spotify lets in can use the app without limits.
              </p>
            )}
          </Group>
        )}

        {access.limits && access.usage && (
          <Group label="Your usage today">
            <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <Meter label="Translated lines" used={access.usage.translate} limit={access.limits.translatePerDay} hourUsed={access.usage.translateHour} hourLimit={access.limits.translatePerHour} />
              <Meter label="Explanations" used={access.usage.explain} limit={access.limits.explainPerDay} hourUsed={access.usage.explainHour} hourLimit={access.limits.explainPerHour} />
            </div>
          </Group>
        )}

        <Group label="Lyrics display">
          <ModeToggle value={settings.displayMode} onChange={(displayMode) => update({ displayMode })} />
          <Switch
            className="mt-4"
            checked={settings.showPronunciation}
            disabled={!config?.pronunciation}
            onChange={(showPronunciation) => update({ showPronunciation })}
            label="Show pronunciation"
            hint={
              config?.pronunciation
                ? "Latin-script transliteration under Arabic, Japanese, Korean, Chinese, Cyrillic, Greek… lyrics — so you can sing along."
                : "Needs an OpenAI API key on the server."
            }
          />
        </Group>

        <Group label="Timing" hint="Saved per Spotify device — each device keeps its own timing, a new device starts at 0.">
          <div className="mb-3 flex items-center gap-2 text-[13px] text-white/70">
            <span className={`h-1.5 w-1.5 rounded-full ${device ? "bg-spotify" : "bg-white/25"}`} />
            {device ? (
              <span className="min-w-0 truncate">
                Now on <span className="font-semibold text-white">{device.name}</span>
                <span className="text-white/40"> · {device.type}</span>
              </span>
            ) : (
              <span className="text-white/45">No active Spotify device</span>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CalibrateButton
              icon={<IconTap width={18} height={18} />}
              title="Tap to sync"
              text={canCalibrate ? "Tap a line the moment it's sung." : "Play a song with synced lyrics first."}
              onClick={onCalibrate}
              disabled={!canCalibrate}
            />
            {onListen && (
              <CalibrateButton
                icon={<IconMic width={18} height={18} />}
                title="Listen to sync"
                text={canCalibrate ? "Hears the song through the mic (speaker, not headphones)." : "Play a song with synced lyrics first."}
                onClick={onListen}
                disabled={!canCalibrate}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button className={btn.icon} onClick={() => setOffset(offsetMs - 100)} disabled={!device} aria-label="Lyrics later">−</button>
            <input
              type="range"
              min={-Math.max(2000, Math.abs(offsetMs))}
              max={Math.max(2000, Math.abs(offsetMs))}
              step={50}
              value={offsetMs}
              disabled={!device}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="flex-1 accent-white disabled:opacity-40"
              aria-label="Timing offset"
            />
            <button className={btn.icon} onClick={() => setOffset(offsetMs + 100)} disabled={!device} aria-label="Lyrics earlier">+</button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[12px] text-white/45">
            <span className="tabular-nums">{formatOffsetLabel(offsetMs)}</span>
            {device && offsetMs !== 0 && (
              <button className="text-white/60 underline-offset-2 hover:underline" onClick={() => setOffset(0)}>
                Reset
              </button>
            )}
          </div>

          {savedDevices.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[12px] font-medium text-white/45">Saved devices</p>
              <ul className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] text-sm">
                {savedDevices.map(([key, d]) => (
                  <li key={key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-white/85">
                        {d.name}
                        {device?.key === key && <span className="ml-2 rounded-full bg-spotify/15 px-2 py-0.5 text-[10px] font-semibold text-spotify">Now</span>}
                      </p>
                      <p className="text-[12px] tabular-nums text-white/40">
                        {d.type} · {formatOffsetLabel(d.offsetMs)}
                      </p>
                    </div>
                    <button className={btn.icon} onClick={() => removeDevice(key)} aria-label={`Forget ${d.name}`}>
                      <IconTrash width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                <p className="text-[12px] text-white/40">Playback info and controls</p>
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

function formatOffsetLabel(ms: number) {
  if (ms === 0) return "No offset";
  return `${ms > 0 ? "+" : "−"}${(Math.abs(ms) / 1000).toFixed(2)} s ${ms > 0 ? "(lyrics earlier)" : "(lyrics later)"}`;
}

function CalibrateButton({ icon, title, text, onClick, disabled }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-left transition hover:bg-white/[0.07] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-white/45">{text}</span>
      </span>
    </button>
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

function Meter({ label, used, limit, hourUsed, hourLimit }: { label: string; used: number; limit: number | null; hourUsed: number; hourLimit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[13px]">
        <span className="text-white/60">{label}</span>
        <span className="tabular-nums text-white/85">
          {used.toLocaleString()} / {limit === null ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${pct > 90 ? "bg-amber-400" : "bg-white/70"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {hourLimit !== null && <p className="mt-1 text-[11px] text-white/35">This hour: {hourUsed} / {hourLimit}</p>}
    </div>
  );
}

function Switch({ checked, onChange, label, hint, disabled, className = "" }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; className?: string }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"} ${className}`}>
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-relaxed text-white/45">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition ${checked ? "bg-spotify" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

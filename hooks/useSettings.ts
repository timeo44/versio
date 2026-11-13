"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TARGET } from "@/lib/languages";

export type DisplayMode = "both" | "original" | "translation";

/** Saved timing for one Spotify playback device. */
export interface DeviceOffset {
  name: string;
  type: string;
  /** + shows lyrics earlier, − later */
  offsetMs: number;
  updatedAt: number;
}

export interface Settings {
  targetLang: string;
  displayMode: DisplayMode;
  /**
   * Legacy single offset from before per-device timing. Moved onto the first
   * device seen after the update, then 0.
   */
  offsetMs: number;
  /** Timing offset per Spotify device (key from deviceKey()); unknown devices start at 0 */
  deviceOffsets: Record<string, DeviceOffset>;
  /** Latin-script transliteration under non-Latin lyrics */
  showPronunciation: boolean;
}

const KEY = "versio:settings";
const DEFAULTS: Settings = { targetLang: DEFAULT_TARGET, displayMode: "both", offsetMs: 0, deviceOffsets: {}, showPronunciation: false };

const MAX_DEVICES = 30;

function sanitizeOffsets(v: unknown): Record<string, DeviceOffset> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, DeviceOffset> = {};
  for (const [k, d] of Object.entries(v as Record<string, Partial<DeviceOffset>>)) {
    if (!d || typeof d.offsetMs !== "number" || !Number.isFinite(d.offsetMs)) continue;
    out[k] = { name: String(d.name ?? k), type: String(d.type ?? ""), offsetMs: d.offsetMs, updatedAt: Number(d.updatedAt) || 0 };
  }
  return out;
}

function persist(next: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULTS, ...parsed, offsetMs: Number(parsed?.offsetMs) || 0, deviceOffsets: sanitizeOffsets(parsed?.deviceOffsets) });
      }
    } catch {}
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
  }, []);

  /** Save the offset for a device (0 is kept too, so the device stays in the list). */
  const setDeviceOffset = useCallback((device: { key: string; name: string; type: string }, offsetMs: number) => {
    setSettings((s) => {
      const entries = Object.entries({ ...s.deviceOffsets, [device.key]: { name: device.name, type: device.type, offsetMs, updatedAt: Date.now() } });
      // keep the most recently used devices
      entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      const next = { ...s, deviceOffsets: Object.fromEntries(entries.slice(0, MAX_DEVICES)) };
      persist(next);
      return next;
    });
  }, []);

  const removeDevice = useCallback((key: string) => {
    setSettings((s) => {
      const { [key]: _gone, ...rest } = s.deviceOffsets;
      const next = { ...s, deviceOffsets: rest };
      persist(next);
      return next;
    });
  }, []);

  /** One-time move of the old global offset onto the device in use. */
  const claimLegacyOffset = useCallback((device: { key: string; name: string; type: string }) => {
    setSettings((s) => {
      if (!s.offsetMs) return s;
      const has = Object.keys(s.deviceOffsets).length > 0;
      const next: Settings = {
        ...s,
        offsetMs: 0,
        deviceOffsets: has ? s.deviceOffsets : { [device.key]: { name: device.name, type: device.type, offsetMs: s.offsetMs, updatedAt: Date.now() } },
      };
      persist(next);
      return next;
    });
  }, []);

  return { settings, update, loaded, setDeviceOffset, removeDevice, claimLegacyOffset };
}

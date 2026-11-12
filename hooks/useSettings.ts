"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TARGET } from "@/lib/languages";

export type DisplayMode = "both" | "original" | "translation";

export interface Settings {
  targetLang: string;
  displayMode: DisplayMode;
  /** + shows lyrics earlier, − later */
  offsetMs: number;
  /** Latin-script transliteration under non-Latin lyrics */
  showPronunciation: boolean;
}

const KEY = "versio:settings";
const DEFAULTS: Settings = { targetLang: DEFAULT_TARGET, displayMode: "both", offsetMs: 0, showPronunciation: false };

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { settings, update, loaded };
}

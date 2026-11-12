"use client";

import { useEffect, useState } from "react";
import type { ProviderName } from "@/lib/translation/types";

export interface AppConfig {
  provider: ProviderName;
  explanations: boolean;
  pronunciation: boolean;
  vocabularySync: boolean;
}

export function useConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setCfg({ provider: "none", explanations: false, pronunciation: false, vocabularySync: false }));
  }, []);
  return cfg;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { VocabEntry } from "@/lib/vocabulary/types";

const KEY = "versio:vocabulary";

const readLocal = (): VocabEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const writeLocal = (list: VocabEntry[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
};

function remote(method: string, path = "", body?: unknown) {
  return apiFetch<any>(`/vocabulary${path}`, { method, body: body ? JSON.stringify(body) : undefined }); // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Vocabulary list. Always stored locally (instant, offline);
 * mirrored to Supabase when the server has it configured.
 */
export function useVocabulary(sync: boolean) {
  const [items, setItems] = useState<VocabEntry[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const local = readLocal();
    setItems(local);
    if (!sync) return;
    remote("GET")
      .then(async (server: VocabEntry[]) => {
        // push entries that only exist locally, then merge
        const serverIds = new Set(server.map((e) => e.id));
        const localOnly = local.filter((e) => !serverIds.has(e.id));
        const pushed = await Promise.all(localOnly.map((e) => remote("POST", "", e).catch(() => e)));
        const merged = [...pushed, ...server].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItems(merged);
        writeLocal(merged);
        setSyncError(null);
      })
      .catch((e) => setSyncError(e.message));
  }, [sync]);

  const add = useCallback(
    (entry: Omit<VocabEntry, "id" | "createdAt">) => {
      const full: VocabEntry = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      setItems((list) => {
        if (list.some((e) => e.term.toLowerCase() === full.term.toLowerCase() && e.targetLang === full.targetLang)) return list;
        const next = [full, ...list];
        writeLocal(next);
        return next;
      });
      if (sync) remote("POST", "", full).catch((e) => setSyncError(e.message));
    },
    [sync],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((list) => {
        const next = list.filter((e) => e.id !== id);
        writeLocal(next);
        return next;
      });
      if (sync) remote("DELETE", `?id=${encodeURIComponent(id)}`).catch((e) => setSyncError(e.message));
    },
    [sync],
  );

  const has = useCallback((term: string, lang: string) => items.some((e) => e.term.toLowerCase() === term.toLowerCase() && e.targetLang === lang), [items]);

  return { items, add, remove, has, syncError };
}

"use client";

import { useMemo, useState } from "react";
import type { VocabEntry } from "@/lib/vocabulary/types";
import { getLanguage } from "@/lib/languages";
import { Sheet } from "./Sheet";
import { IconBookmark, IconDownload, IconTrash } from "./icons";
import { btn } from "./StateMessage";

function exportCsv(items: VocabEntry[]) {
  const esc = (s = "") => `"${s.replace(/"/g, '""')}"`;
  const rows = [["term", "meaning", "line", "translation", "track", "artist", "language", "saved"], ...items.map((e) => [e.term, e.meaning, e.line, e.translation ?? "", e.trackName, e.artistName, e.targetLang, e.createdAt])];
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "versio-vocabulary.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function VocabularyPanel({ open, onClose, items, onRemove, syncing, syncError }: { open: boolean; onClose: () => void; items: VocabEntry[]; onRemove: (id: string) => void; syncing: boolean; syncError: string | null }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? items.filter((e) => `${e.term} ${e.meaning} ${e.trackName} ${e.artistName}`.toLowerCase().includes(n)) : items;
  }, [items, q]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Vocabulary · ${items.length}`}
      footer={
        <div className="flex items-center justify-between gap-3 text-[12px] text-white/40">
          <span>{syncError ? <span className="text-rose-300/80">Sync: {syncError}</span> : syncing ? "Synced to your account" : "Saved on this device"}</span>
          {items.length > 0 && (
            <button className={btn.ghost} onClick={() => exportCsv(items)}>
              <IconDownload width={15} height={15} /> CSV
            </button>
          )}
        </div>
      }
    >
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <IconBookmark className="mx-auto mb-4 text-white/25" width={28} height={28} />
          <p className="font-semibold text-white">No words yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-white/50">Tap any lyric line, then tap a word or expression to save it here.</p>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search words, songs…"
            className="mb-4 w-full rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-base text-white placeholder md:text-sm:text-white/35 focus:outline-hidden focus:ring-1 focus:ring-white/20"
          />
          <ul className="space-y-2.5">
            {filtered.map((e) => (
              <li key={e.id} className="group rounded-2xl border border-white/[0.05] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold text-white" dir="auto">{e.term}</p>
                    {e.meaning && <p className="mt-0.5 text-sm text-[color:var(--accent-text)]" dir="auto">{e.meaning}</p>}
                  </div>
                  <button onClick={() => onRemove(e.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/35 opacity-100 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100" aria-label={`Remove ${e.term}`}>
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
                {e.line && <p className="mt-2.5 border-l-2 border-white/10 pl-3 text-[13px] italic leading-relaxed text-white/55" dir="auto">{e.line}</p>}
                <p className="mt-2 text-[11px] text-white/30">
                  {e.trackName} — {e.artistName} · {getLanguage(e.targetLang)?.name ?? e.targetLang}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

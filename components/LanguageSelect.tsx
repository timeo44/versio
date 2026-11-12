"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FEATURED_COUNT, LANGUAGES, getLanguage, languagesForProvider } from "@/lib/languages";
import { IconCheck, IconChevron, IconGlobe } from "./icons";

export function LanguageSelect({ value, onChange, provider }: { value: string; onChange: (code: string) => void; provider: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = getLanguage(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const list = useMemo(() => {
    const avail = languagesForProvider(provider);
    const needle = q.trim().toLowerCase();
    const filtered = needle ? avail.filter((l) => `${l.name} ${l.english} ${l.code}`.toLowerCase().includes(needle)) : avail;
    const featuredCodes = new Set(LANGUAGES.slice(0, FEATURED_COUNT).map((l) => l.code));
    return {
      featured: filtered.filter((l) => featuredCodes.has(l.code)),
      more: filtered.filter((l) => !featuredCodes.has(l.code)),
    };
  }, [q, provider]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-2.5 text-sm font-medium text-white/90 transition hover:bg-white/[0.08]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <IconGlobe width={16} height={16} className="text-white/60" />
        <span className="max-w-[120px] truncate">{current?.name ?? value}</span>
        <IconChevron width={14} height={14} className={`text-white/50 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 origin-top-right animate-fadeUp overflow-hidden rounded-2xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/[0.06] p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Translate to…"
              className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-hidden focus:ring-1 focus:ring-white/20"
            />
          </div>
          <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
            {[...list.featured, ...(list.more.length && list.featured.length ? [null] : []), ...list.more].map((l, i) =>
              l === null ? (
                <li key={`sep${i}`} className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-white/30">
                  More languages
                </li>
              ) : (
                <li key={l.code}>
                  <button
                    role="option"
                    aria-selected={l.code === value}
                    onClick={() => pick(l.code)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${l.code === value ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white"}`}
                  >
                    <span>
                      {l.name}
                      {l.name !== l.english && <span className="ml-2 text-xs text-white/35">{l.english}</span>}
                    </span>
                    {l.code === value && <IconCheck width={16} height={16} className="text-spotify" />}
                  </button>
                </li>
              ),
            )}
            {!list.featured.length && !list.more.length && <li className="px-3 py-4 text-center text-sm text-white/40">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

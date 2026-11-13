"use client";

import { useEffect, useMemo, useState } from "react";
import type { Explanation } from "@/lib/translation/types";
import { Sheet } from "./Sheet";
import { IconCheck, IconPlus, IconRefresh, IconSparkle } from "./icons";
import { btn } from "./StateMessage";
import { apiFetch } from "@/lib/api";

export interface ExplainTarget {
  line: string;
  pronunciation?: string;
  translation?: string;
  previous?: string;
  next?: string;
  title: string;
  artist: string;
}

const cache = new Map<string, Explanation>();

export function ExplanationPanel({
  target,
  onClose,
  targetLang,
  available,
  onSave,
  isSaved,
}: {
  target: ExplainTarget | null;
  onClose: () => void;
  targetLang: string;
  available: boolean;
  onSave: (term: string, meaning: string) => void;
  isSaved: (term: string) => boolean;
}) {
  const [exp, setExp] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setExp(null);
    setError(null);
    if (!target || !available) return;
    const key = `${targetLang}|${target.line}|${target.title}`;
    const hit = cache.get(key);
    if (hit) return setExp(hit);
    const ctrl = new AbortController();
    setLoading(true);
    apiFetch<Explanation>("/explain", {
      method: "POST",
      body: JSON.stringify({ ...target, target: targetLang }),
      signal: ctrl.signal,
    })
      .then((d) => {
        cache.set(key, d);
        setExp(d);
      })
      .catch((e) => !ctrl.signal.aborted && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [target, targetLang, available, nonce]);

  // individual words of the line, for one-tap saving
  const words = useMemo(() => {
    if (!target) return [];
    const seen = new Set<string>();
    return target.line
      .split(/\s+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""))
      .filter((w) => w.length > 1 && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
  }, [target]);

  const meaningFor = (term: string) =>
    [...(exp?.vocabulary ?? []), ...(exp?.slang ?? [])].find((v) => v.term.toLowerCase() === term.toLowerCase())?.meaning ?? "";

  return (
    <Sheet open={!!target} onClose={onClose} title={<span className="flex items-center gap-2"><IconSparkle width={16} height={16} className="text-[color:var(--accent-text)]" />Line breakdown</span>}>
      {target && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <p className="text-xl font-bold leading-snug text-white" dir="auto">{target.line}</p>
            {target.pronunciation && <p className="mt-1 text-[15px] text-white/55">{target.pronunciation}</p>}
            {target.translation && <p className="mt-2 text-[17px] font-medium leading-snug text-[color:var(--accent-text)]" dir="auto">{target.translation}</p>}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {words.map((w) => {
                const saved = isSaved(w);
                return (
                  <button
                    key={w}
                    onClick={() => !saved && onSave(w, meaningFor(w))}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] transition ${saved ? "bg-spotify/15 text-spotify" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"}`}
                    title={saved ? "Saved" : "Save to vocabulary"}
                  >
                    {saved ? <IconCheck width={12} height={12} /> : <IconPlus width={12} height={12} />}
                    {w}
                  </button>
                );
              })}
            </div>
          </div>

          {!available && (
            <p className="text-sm leading-relaxed text-white/50">
              Detailed explanations need an OpenAI key on the server (<code className="text-white/70">OPENAI_API_KEY</code>). You can still save words from this line.
            </p>
          )}

          {loading && (
            <div className="space-y-5">
              {[70, 90, 55].map((w, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.1),rgba(255,255,255,0.04))] bg-[length:200%_100%]" />
                  <div className="h-4 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.1),rgba(255,255,255,0.04))] bg-[length:200%_100%]" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <p className="text-sm text-rose-200/80">{error}</p>
              <button className={btn.ghost} onClick={() => setNonce((n) => n + 1)}>
                <IconRefresh width={15} height={15} /> Try again
              </button>
            </div>
          )}

          {exp && (
            <div className="animate-fadeUp space-y-6">
              <Section label="Natural translation">{exp.natural}</Section>
              <Section label="Literal meaning">{exp.literal}</Section>
              {exp.slang.length > 0 && (
                <Section label="Slang & idioms">
                  <TermList items={exp.slang} onSave={onSave} isSaved={isSaved} />
                </Section>
              )}
              {exp.cultural && <Section label="Cultural context">{exp.cultural}</Section>}
              {exp.vocabulary.length > 0 && (
                <Section label="Vocabulary">
                  <TermList items={exp.vocabulary} onSave={onSave} isSaved={isSaved} />
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</h4>
      <div className="text-[15px] leading-relaxed text-white/85">{children}</div>
    </section>
  );
}

function TermList({ items, onSave, isSaved }: { items: { term: string; meaning: string }[]; onSave: (t: string, m: string) => void; isSaved: (t: string) => boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const saved = isSaved(it.term);
        return (
          <li key={it.term} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-white">{it.term}</p>
              <p className="text-sm text-white/60">{it.meaning}</p>
            </div>
            <button
              onClick={() => !saved && onSave(it.term, it.meaning)}
              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${saved ? "bg-spotify/15 text-spotify" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.14] hover:text-white"}`}
              aria-label={saved ? "Saved" : `Save ${it.term}`}
            >
              {saved ? <IconCheck width={15} height={15} /> : <IconPlus width={15} height={15} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useEffect, useState } from "react";
import { pendingInvite } from "@/hooks/useAccess";
import { startLogin } from "@/lib/spotify/auth";
import { SPOTIFY_CLIENT_ID } from "@/lib/spotify/config";
import { IconSpotify, Logo } from "./icons";
import { btn } from "./StateMessage";

export function ConnectScreen({ notice }: { notice?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = !!SPOTIFY_CLIENT_ID;
  const [invited, setInvited] = useState(false);
  useEffect(() => setInvited(!!pendingInvite()), []);

  const connect = async () => {
    setBusy(true);
    setErr(null);
    try {
      await startLogin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start Spotify login.");
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-20%] h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(30,215,96,0.18),transparent_65%)] blur-2xl" />
        <div className="absolute bottom-[-30%] right-[-10%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle,rgba(120,80,255,0.14),transparent_65%)] blur-2xl" />
      </div>

      <div className="relative w-full max-w-2xl animate-fadeUp text-center">
        <div className="mb-10 flex items-center justify-center gap-2.5">
          <Logo size={34} />
          <span className="text-lg font-semibold tracking-tight text-white">Versio</span>
        </div>

        <h1 className="text-balance text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-white md:text-[60px]">
          Understand every song
          <br />
          <span className="font-serif font-normal italic text-white/70">while it plays.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-white/55">
          Versio follows what you're listening to on Spotify and shows time-synced lyrics with a natural translation — line by line, as it's sung.
        </p>

        {invited && !notice && (
          <p className="mx-auto mt-6 max-w-sm rounded-2xl border border-spotify/25 bg-spotify/[0.07] px-4 py-2.5 text-sm text-white/85">You've been invited 🎉 Connect Spotify to get started.</p>
        )}
        {notice && <p className="mx-auto mt-6 max-w-sm rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-sm text-amber-100/90">{notice}</p>}

        <div className="mt-10">
          {configured ? (
            <button className={btn.spotify} onClick={connect} disabled={busy}>
              <IconSpotify width={22} height={22} className="text-black" wave="#1ed760" />
              {busy ? "Opening Spotify…" : "Connect Spotify"}
            </button>
          ) : (
            <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left text-sm text-white/70">
              <p className="font-semibold text-white">Setup needed</p>
              <p className="mt-1.5">
                Set <code className="text-white">NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> in <code className="text-white">.env.local</code> and restart the dev server. See the README for the 3-minute Spotify setup.
              </p>
            </div>
          )}
          {err && <p className="mt-4 text-sm text-rose-300/90">{err}</p>}
        </div>

        <ul className="mx-auto mt-14 grid max-w-lg grid-cols-1 gap-3 text-left text-[13px] text-white/50 sm:grid-cols-3">
          {[
            ["Read-only", "Only sees what's playing. Can't control or change anything."],
            ["Synced", "Line-accurate LRC timing — never faked."],
            ["Natural", "Slang and idioms translated like a native would."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="font-semibold text-white/85">{t}</p>
              <p className="mt-1 leading-relaxed">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

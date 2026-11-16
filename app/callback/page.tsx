"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeLogin } from "@/lib/spotify/auth";
import { Logo } from "@/components/icons";
import { btn } from "@/components/StateMessage";

export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false); // StrictMode runs effects twice; the code is single-use

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Logins started by the native iOS app (state "ios.…") reuse this redirect
    // URI — hand the code back to the app; it holds the PKCE verifier.
    const params = new URLSearchParams(window.location.search);
    if (params.get("state")?.startsWith("ios.")) {
      window.location.replace(`versio://callback${window.location.search}`);
      return;
    }
    completeLogin(window.location.search)
      .then(() => router.replace("/"))
      .catch((e) => setError(e instanceof Error ? e.message : "Login failed."));
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="animate-fadeUp">
        <div className="mx-auto mb-6 w-fit">
          <Logo size={44} />
        </div>
        {error ? (
          <>
            <p className="text-lg font-semibold text-white">Couldn't connect to Spotify</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-white/55">{error}</p>
            <button className={`${btn.primary} mt-6`} onClick={() => router.replace("/")}>
              Back
            </button>
          </>
        ) : (
          <p className="text-white/60">Connecting to Spotify…</p>
        )}
      </div>
    </main>
  );
}

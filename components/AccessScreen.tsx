"use client";

import { useState } from "react";
import { logout } from "@/lib/spotify/auth";
import { Logo } from "./icons";
import { btn } from "./StateMessage";

export type AccessScreenKind = "pending" | "blocked" | "not_registered" | "error";

const COPY: Record<AccessScreenKind, { title: string; body: string }> = {
  pending: {
    title: "Almost there",
    body: "You're signed in, but the owner of this Versio still needs to approve you. Ask them for an invite link — or wait until they approve your request.",
  },
  blocked: { title: "No access", body: "Your access to this Versio has been revoked. Contact the owner if you think this is a mistake." },
  not_registered: {
    title: "Spotify hasn't unlocked you yet",
    body: "This app runs in Spotify's Development Mode. The owner has to add your Spotify email under User Management in the Spotify Developer Dashboard. Once they did, tap Check again.",
  },
  error: { title: "Something went wrong", body: "We couldn't check your access right now." },
};

export function AccessScreen({ kind, name, detail, inviteError, onRetry }: { kind: AccessScreenKind; name?: string | null; detail?: string; inviteError?: string; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  const c = COPY[kind];
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md animate-fadeUp text-center">
        <div className="mx-auto mb-8 w-fit">
          <Logo size={44} />
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-white">{c.title}</h1>
        {name && <p className="mt-1 text-sm text-white/45">Signed in as {name}</p>}
        <p className="mt-4 text-[15px] leading-relaxed text-white/60">{kind === "error" && detail ? detail : c.body}</p>
        {inviteError && <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-sm text-amber-100/90">{inviteError}</p>}
        <div className="mt-8 flex justify-center gap-2">
          <button
            className={btn.primary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onRetry();
              setBusy(false);
            }}
          >
            {busy ? "Checking…" : "Check again"}
          </button>
          <button className={btn.ghost} onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

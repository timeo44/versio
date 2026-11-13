"use client";

import { useCallback, useEffect, useState } from "react";
import { ACCESS_EVENT, ApiError, apiFetch } from "@/lib/api";
import type { AccessInfo } from "@/lib/access/types";

export const INVITE_KEY = "versio:invite";

export type AccessState =
  | { status: "loading" }
  | { status: "ready"; info: AccessInfo; inviteError?: string }
  | { status: "error"; code?: string; message: string };

/** Captures ?invite=CODE from the URL so it survives the Spotify login round-trip. */
export function captureInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("invite");
  if (!code) return;
  try {
    localStorage.setItem(INVITE_KEY, code);
  } catch {}
  params.delete("invite");
  const q = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

export function useAccess() {
  const [state, setState] = useState<AccessState>({ status: "loading" });

  const load = useCallback(async () => {
    const invite = pendingInvite();
    let inviteError: string | undefined;
    try {
      let info: AccessInfo;
      if (invite) {
        try {
          info = await apiFetch<AccessInfo>("/me", { method: "POST", body: JSON.stringify({ invite }) });
        } catch (e) {
          if (!(e instanceof ApiError) || !e.code?.startsWith("invite_")) throw e;
          inviteError = e.message;
          info = await apiFetch<AccessInfo>("/me");
        }
        localStorage.removeItem(INVITE_KEY);
      } else info = await apiFetch<AccessInfo>("/me");
      setState({ status: "ready", info, inviteError });
    } catch (e) {
      setState({ status: "error", code: e instanceof ApiError ? e.code : undefined, message: e instanceof Error ? e.message : "Couldn't check access." });
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(ACCESS_EVENT, onChange);
    return () => window.removeEventListener(ACCESS_EVENT, onChange);
  }, [load]);

  return { state, reload: load };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminOverview, CreditsInfo, InviteDTO } from "@/lib/access/types";

export function useAdmin(open: boolean) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);

  const loadCredits = useCallback(async (fresh = false) => {
    try {
      setCredits(await apiFetch<CreditsInfo>(`/admin/credits${fresh ? "?fresh=1" : ""}`));
    } catch {
      /* card shows its own empty state */
    }
  }, []);

  const saveBalance = useCallback(async (balance: number | null) => {
    setBusy(true);
    try {
      setCredits(await apiFetch<CreditsInfo>("/admin/credits", { method: "POST", body: JSON.stringify({ balance }) }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save balance.");
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setData(await apiFetch<AdminOverview>("/admin"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users.");
    }
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      loadCredits();
    }
  }, [open, refresh, loadCredits]);

  const act = useCallback(async <T = AdminOverview>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    try {
      const res = await apiFetch<T>("/admin", { method: "POST", body: JSON.stringify(body) });
      setError(null);
      if (body.action !== "invite") setData(res as unknown as AdminOverview);
      else await refresh();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const invite = (email: string, name: string) => act<{ invite: InviteDTO }>({ action: "invite", email, name }).then((r) => r?.invite ?? null);

  return { data, error, busy, refresh, act, invite, credits, loadCredits, saveBalance };
}

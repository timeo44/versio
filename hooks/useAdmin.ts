"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminOverview, InviteDTO } from "@/lib/access/types";

export function useAdmin(open: boolean) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await apiFetch<AdminOverview>("/admin"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users.");
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

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

  return { data, error, busy, refresh, act, invite };
}

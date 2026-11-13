import { env } from "./env";
import { getCredits } from "./credits";
import { rest, supabaseEnabled } from "./supabase";

/**
 * Spend watcher for a scheduled job: GET /monitor?key=… returns
 * { notify: true, … } once each time another CHF 1 (configurable) of OpenAI
 * credit has been used since the balance was entered.
 *
 * Only the SHA-256 of the key lives in the code; the key itself is kept by
 * the caller. Override with MONITOR_KEY_SHA256.
 */
const DEFAULT_KEY_SHA256 = "d9b48f849b3902adb81779d840652adfc79fa64ee2f4562014c20acee24ac4c5";

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function monitorKeyValid(key: string | null): Promise<boolean> {
  if (!key) return false;
  const expected = env("MONITOR_KEY_SHA256") || DEFAULT_KEY_SHA256;
  return (await sha256Hex(key)) === expected;
}

export interface MonitorResult {
  ok: boolean;
  notify: boolean;
  error?: string;
  /** whole CHF steps used so far (since the balance was entered) */
  stepsChf?: number;
  spentChf?: number;
  remainingChf?: number | null;
  spentTodayChf?: number | null;
}

export async function checkSpend(): Promise<MonitorResult> {
  if (!supabaseEnabled()) return { ok: false, notify: false, error: "Supabase not configured" };
  const usdPerChf = Number(env("USD_PER_CHF")) || 1.23;
  const stepChf = Number(env("NOTIFY_STEP_CHF")) || 1;
  const c = await getCredits(true);
  if (!c.adminKey) return { ok: false, notify: false, error: "OPENAI_ADMIN_KEY missing" };
  if (c.error) return { ok: false, notify: false, error: c.error };

  const spentUsd = c.spentSinceAsOf ?? c.spentMonth ?? 0;
  const spentChf = spentUsd / usdPerChf;
  const steps = Math.floor(spentChf / stepChf);
  const toChf = (usd: number | null) => (usd === null ? null : Math.round((usd / usdPerChf) * 100) / 100);

  // remember how many steps were already announced — per entered balance
  const bucket = `asof:${c.asOf ?? "month:" + new Date().toISOString().slice(0, 7)}`;
  const rows = await rest<{ count: number }[]>(`usage?spotify_id=eq._system&kind=eq.notified_chf&bucket=eq.${encodeURIComponent(bucket)}&limit=1`);
  const announced = rows[0]?.count ?? 0;
  const notify = steps > announced;
  if (notify) {
    await rest("usage?on_conflict=spotify_id,kind,bucket", {
      method: "POST",
      prefer: "return=minimal,resolution=merge-duplicates",
      body: JSON.stringify({ spotify_id: "_system", kind: "notified_chf", bucket, count: steps }),
    });
  }
  return {
    ok: true,
    notify,
    stepsChf: steps * stepChf,
    spentChf: Math.round(spentChf * 100) / 100,
    remainingChf: toChf(c.remaining),
    spentTodayChf: toChf(c.spentToday),
  };
}

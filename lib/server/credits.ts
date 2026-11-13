import { env } from "./env";
import { LruCache } from "./cache";
import { rest, supabaseEnabled } from "./supabase";
import type { CreditsInfo } from "@/lib/access/types";

/**
 * OpenAI has no API for the remaining prepaid balance. So the admin enters
 * the balance shown on platform.openai.com once ("$X as of <time>"), and we
 * subtract the real spend since then from the organization Costs API
 * (needs an Admin key: OPENAI_ADMIN_KEY = sk-admin-…).
 */

const cache = new LruCache<CreditsInfo>(4, 5 * 60_000);

interface CostsPage {
  data: { start_time: number; end_time: number; results: { amount?: { value?: number | string; currency?: string } }[] }[];
  has_more?: boolean;
  next_page?: string | null;
}

/** Sums organization costs (USD) per day from `sinceSec` until now. */
export async function fetchCosts(sinceSec: number): Promise<{ total: number; days: { start: number; usd: number }[] }> {
  const key = env("OPENAI_ADMIN_KEY");
  if (!key) throw new Error("no_admin_key");
  const days: { start: number; usd: number }[] = [];
  let page: string | null | undefined;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ start_time: String(sinceSec), bucket_width: "1d", limit: "180" });
    if (page) q.set("page", page);
    const res = await fetch(`https://api.openai.com/v1/organization/costs?${q}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error("admin_key_rejected");
    if (!res.ok) throw new Error(`OpenAI costs API responded ${res.status}`);
    const body = (await res.json()) as CostsPage;
    for (const b of body.data ?? []) {
      const usd = (b.results ?? []).reduce((sum, r) => sum + (Number(r.amount?.value) || 0), 0);
      days.push({ start: b.start_time, usd });
    }
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return { total: days.reduce((a, d) => a + d.usd, 0), days };
}

interface CreditRow {
  credit_balance: number | null;
  credit_as_of: string | null;
}

export async function getCredits(fresh = false): Promise<CreditsInfo> {
  if (!fresh) {
    const hit = cache.get("c");
    if (hit) return hit;
  }
  const adminKey = !!env("OPENAI_ADMIN_KEY");
  let balance: number | null = null;
  let asOf: string | null = null;
  if (supabaseEnabled()) {
    const rows = await rest<CreditRow[]>("app_settings?id=eq.1&select=credit_balance,credit_as_of").catch(() => [] as CreditRow[]);
    balance = rows[0]?.credit_balance != null ? Number(rows[0].credit_balance) : null;
    asOf = rows[0]?.credit_as_of ?? null;
  }

  const info: CreditsInfo = { adminKey, balance, asOf, spentSinceAsOf: null, spentToday: null, spentMonth: null, remaining: null, error: null };
  if (!adminKey) return info;

  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const asOfSec = asOf ? Math.floor(Date.parse(asOf) / 1000) : null;
  // one call covering both ranges
  const since = Math.min(monthStart, asOfSec ?? monthStart);
  try {
    const { days } = await fetchCosts(since);
    const sum = (from: number) => days.filter((d) => d.start >= from).reduce((a, d) => a + d.usd, 0);
    info.spentMonth = round(sum(monthStart));
    info.spentToday = round(sum(dayStart));
    if (asOfSec !== null) {
      // costs come in day buckets; count the as-of day pro rata
      const asOfDay = Math.floor(asOfSec / 86400) * 86400;
      const partial = days.find((d) => d.start === asOfDay);
      const frac = partial ? Math.max(0, Math.min(1, (asOfDay + 86400 - asOfSec) / 86400)) : 0;
      info.spentSinceAsOf = round(sum(asOfDay + 86400) + (partial ? partial.usd * frac : 0));
      if (balance !== null) info.remaining = round(balance - info.spentSinceAsOf);
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    info.error = m === "admin_key_rejected" ? "The OpenAI admin key was rejected (needs an sk-admin-… key from an organization owner)." : "Couldn't reach the OpenAI costs API.";
  }
  cache.set("c", info);
  return info;
}

export async function setCreditBalance(balance: number | null) {
  if (balance !== null && (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000)) throw new Error("bad_balance");
  await rest("app_settings?id=eq.1", {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ credit_balance: balance, credit_as_of: balance === null ? null : new Date().toISOString() }),
  });
  cache.delete("c");
}

const round = (n: number) => Math.round(n * 100) / 100;

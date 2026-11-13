/**
 * Framework-free API. The same `handle()` runs as a Supabase Edge Function
 * in production (supabase/functions/versio-api) and as a small Node server
 * in local development (scripts/dev-api.ts).
 *
 * Routes (relative to the function URL):
 *   GET  /config       which features are configured (public)
 *   GET  /me           access status, limits, usage
 *   POST /me           { invite } → redeem an invite
 *   GET  /lyrics       ?track&artist&album&duration
 *   POST /translate    { lines, target, context }
 *   POST /explain      { line, target, … }
 *   POST /romanize     { lines, context }
 *   GET|POST|DELETE /vocabulary
 *   GET|POST /admin    (admins only)
 */
import { env } from "./env";
import { findLyrics } from "./lrclib";
import {
  HttpError,
  accessInfo,
  adminDeleteInvite,
  adminDeleteUser,
  adminOverview,
  adminUpdateUser,
  authenticate,
  consumeQuota,
  createInvite,
  redeemInvite,
  requireAdmin,
  sanitizeLimits,
  setDefaultLimits,
} from "./access";
import { TranslationUnavailableError, activeProvider, explainLine, explanationsAvailable, romanizationAvailable, romanizeLines, translateLines } from "./translate";
import { rest, supabaseEnabled } from "./supabase";
import { getCredits, setCreditBalance } from "./credits";
import { getLanguage } from "@/lib/languages";
import type { ExplainRequest, TranslateRequest } from "@/lib/translation/types";
import type { VocabEntry } from "@/lib/vocabulary/types";

// ── helpers ───────────────────────────────────────────────────

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (env("ALLOWED_ORIGINS") ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function errorJson(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code, ...e.extra }, e.status);
  if (e instanceof TranslationUnavailableError) return json({ error: e.message }, e.status);
  console.error("[api]", e);
  const msg = e instanceof Error && e.name === "TimeoutError" ? "The provider timed out." : "Server error";
  return json({ error: msg }, 500);
}

const body = async <T>(req: Request): Promise<T | null> => (await req.json().catch(() => null)) as T | null;
const s = (v: unknown, n = 500) => (typeof v === "string" ? v.slice(0, n) : undefined);

// ── routes ────────────────────────────────────────────────────

async function route(req: Request, path: string): Promise<Response> {
  const m = req.method;

  if (m === "GET" && path === "/config") {
    return json({ provider: activeProvider(), explanations: explanationsAvailable(), pronunciation: romanizationAvailable(), vocabularySync: supabaseEnabled() });
  }

  if (path === "/me") {
    if (m === "POST") {
      const b = await body<{ invite?: string }>(req);
      const u = await authenticate(req, { allowInactive: true });
      if (supabaseEnabled() && typeof b?.invite === "string" && b.invite.trim()) await redeemInvite(u.profile, b.invite.trim().slice(0, 64));
      return json(await accessInfo(await authenticate(req, { allowInactive: true })));
    }
    return json(await accessInfo(await authenticate(req, { allowInactive: true })));
  }

  if (m === "GET" && path === "/lyrics") {
    await authenticate(req);
    const q = new URL(req.url).searchParams;
    const track = q.get("track")?.trim();
    const artist = q.get("artist")?.trim();
    if (!track || !artist) return json({ error: "track and artist are required" }, 400);
    try {
      return json(await findLyrics({ track, artist, album: q.get("album")?.trim() || undefined, durationMs: Number(q.get("duration")) || undefined }));
    } catch (e) {
      console.error("[lyrics]", e);
      return json({ error: "Lyrics provider is unavailable right now." }, 502);
    }
  }

  if (m === "POST" && path === "/translate") {
    const user = await authenticate(req);
    const b = await body<TranslateRequest>(req);
    const lines = Array.isArray(b?.lines) ? b.lines.filter((l) => typeof l === "string" && l.trim()).map((l) => l.slice(0, 500)) : [];
    if (!lines.length || lines.length > 80) return json({ error: "Send 1–80 lines per request." }, 400);
    if (!b || !getLanguage(b.target)) return json({ error: "Unsupported target language." }, 400);
    const res = await translateLines(
      { lines, target: b.target, context: { title: s(b.context?.title, 200), artist: s(b.context?.artist, 200), lyrics: s(b.context?.lyrics, 20_000) } },
      (n) => consumeQuota(user, "translate", n),
    );
    return json(res);
  }

  if (m === "POST" && path === "/explain") {
    const user = await authenticate(req);
    const b = await body<ExplainRequest>(req);
    if (!b?.line || typeof b.line !== "string" || !getLanguage(b.target)) return json({ error: "line and a supported target are required" }, 400);
    const exp = await explainLine(
      { line: b.line.slice(0, 500), translation: s(b.translation), previous: s(b.previous), next: s(b.next), target: b.target, title: s(b.title), artist: s(b.artist) },
      () => consumeQuota(user, "explain", 1),
    );
    return json(exp);
  }

  if (m === "POST" && path === "/romanize") {
    const user = await authenticate(req);
    const b = await body<{ lines?: unknown; context?: { title?: string; artist?: string; lyrics?: string } }>(req);
    const lines = Array.isArray(b?.lines) ? b.lines.filter((l): l is string => typeof l === "string" && !!l.trim()).map((l) => l.slice(0, 500)) : [];
    if (!lines.length || lines.length > 80) return json({ error: "Send 1–80 lines per request." }, 400);
    const romanizations = await romanizeLines(lines, { title: s(b?.context?.title, 200), artist: s(b?.context?.artist, 200), lyrics: s(b?.context?.lyrics, 20_000) }, (n) => consumeQuota(user, "translate", n));
    return json({ romanizations });
  }

  if (path === "/vocabulary") return vocabulary(req);

  if (path === "/admin/credits") {
    await requireAdmin(req);
    if (m === "POST") {
      const b = await body<{ balance?: number | null }>(req);
      const v = b?.balance === null || b?.balance === undefined ? null : Number(b.balance);
      try {
        await setCreditBalance(v);
      } catch {
        throw new HttpError(400, "bad_balance", "Enter a balance in USD, e.g. 9.85");
      }
      return json(await getCredits(true));
    }
    return json(await getCredits(new URL(req.url).searchParams.has("fresh")));
  }

  if (path === "/admin") {
    const admin = await requireAdmin(req);
    if (m === "GET") return json(await adminOverview());
    if (m !== "POST") return json({ error: "Method not allowed" }, 405);
    const b = await body<Record<string, unknown>>(req);
    const me = admin.profile.id;
    switch (b?.action) {
      case "invite":
        return json({ invite: await createInvite(String(b.email ?? ""), typeof b.name === "string" ? b.name : null, me) });
      case "deleteInvite":
        await adminDeleteInvite(String(b.code));
        break;
      case "updateUser":
        await adminUpdateUser(me, String(b.spotifyId), b as Parameters<typeof adminUpdateUser>[2]);
        break;
      case "deleteUser":
        await adminDeleteUser(me, String(b.spotifyId));
        break;
      case "setDefaults":
        await setDefaultLimits(sanitizeLimits((b.limits as Record<string, number | null>) ?? {}));
        break;
      default:
        throw new HttpError(400, "bad_request", "Unknown action.");
    }
    return json(await adminOverview());
  }

  return json({ error: "Not found" }, 404);
}

// ── vocabulary ────────────────────────────────────────────────

interface VocabRow {
  id: string;
  term: string;
  meaning: string;
  line: string;
  translation: string | null;
  track_name: string;
  artist_name: string;
  target_lang: string;
  created_at: string;
}

const toEntry = (r: VocabRow): VocabEntry => ({
  id: r.id,
  term: r.term,
  meaning: r.meaning,
  line: r.line,
  translation: r.translation ?? undefined,
  trackName: r.track_name,
  artistName: r.artist_name,
  targetLang: r.target_lang,
  createdAt: r.created_at,
});

async function vocabulary(req: Request): Promise<Response> {
  if (!supabaseEnabled()) return json({ error: "Vocabulary sync is not configured." }, 501);
  const user = (await authenticate(req)).profile.id;
  const uid = encodeURIComponent(user);

  if (req.method === "GET") {
    const rows = await rest<VocabRow[]>(`vocabulary?spotify_user_id=eq.${uid}&order=created_at.desc&limit=1000`);
    return json(rows.map(toEntry));
  }
  if (req.method === "POST") {
    const b = await body<Partial<VocabEntry>>(req);
    if (!b?.term) return json({ error: "term is required" }, 400);
    const rows = await rest<VocabRow[]>("vocabulary", {
      method: "POST",
      body: JSON.stringify({
        ...(b.id && /^[0-9a-f-]{36}$/i.test(b.id) ? { id: b.id } : {}),
        spotify_user_id: user,
        term: s(b.term, 200),
        meaning: s(b.meaning, 1000) ?? "",
        line: s(b.line) ?? "",
        translation: s(b.translation) ?? null,
        track_name: s(b.trackName, 200) ?? "",
        artist_name: s(b.artistName, 200) ?? "",
        target_lang: s(b.targetLang, 10) ?? "",
      }),
    });
    return json(toEntry(rows[0]));
  }
  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id required" }, 400);
    await rest(`vocabulary?id=eq.${id}&spotify_user_id=eq.${uid}`, { method: "DELETE", prefer: "return=minimal" });
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

// ── entry ─────────────────────────────────────────────────────

/** Strips the function prefix (/functions/v1/versio-api or /versio-api) and any /api. */
export function routePath(pathname: string): string {
  const p = pathname.replace(/^.*\/versio-api(?=\/|$)/, "").replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "");
  return p || "/";
}

export async function handle(req: Request): Promise<Response> {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  let res: Response;
  try {
    res = await route(req, routePath(new URL(req.url).pathname));
  } catch (e) {
    res = errorJson(e);
  }
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

import { LruCache } from "./cache";

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = () => !!(URL_ && KEY);

export interface SpotifyProfile {
  id: string;
  displayName: string | null;
}

const profileCache = new LruCache<SpotifyProfile>(500, 1000 * 60 * 10);

/**
 * The browser sends its Spotify access token; we verify it against Spotify
 * (GET /v1/me) and use the Spotify user id as identity. Tokens of accounts
 * not allow-listed in the Spotify app can't exist in Development Mode, so a
 * valid token is already a first gate.
 */
export async function spotifyProfileFromRequest(req: Request): Promise<SpotifyProfile | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const cached = profileCache.get(token);
  if (cached) return cached;
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const me = (await res.json()) as { id?: string; display_name?: string | null };
    if (!me.id) return null;
    const profile = { id: me.id, displayName: me.display_name ?? null };
    profileCache.set(token, profile);
    return profile;
  } catch {
    return null;
  }
}

export async function rest<T = unknown>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { prefer, ...rest_ } = init;
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...rest_,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? "return=representation",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}: ${await res.text().catch(() => "")}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function spotifyUserFromRequest(req: Request): Promise<string | null> {
  return (await spotifyProfileFromRequest(req))?.id ?? null;
}

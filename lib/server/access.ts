import { LruCache } from "./cache";
import { rest, spotifyProfileFromRequest, supabaseEnabled, type SpotifyProfile } from "./supabase";
import type { AccessInfo, AdminOverview, AppUserDTO, InviteDTO, Limits, QuotaKind } from "@/lib/access/types";
import { env } from "./env";

/**
 * Access control + rate limits.
 *
 * With Supabase configured: users must be `active` in app_users. The very
 * first person to sign in becomes admin (or anyone in ADMIN_SPOTIFY_IDS).
 * Without Supabase (local dev): any valid Spotify token is accepted and no
 * quotas apply.
 */

interface UserRow {
  spotify_id: string;
  display_name: string | null;
  email: string | null;
  role: "admin" | "user";
  status: "active" | "pending" | "blocked";
  limits: Partial<Limits> | null;
  invited_via: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface SettingsRow {
  translate_per_hour: number | null;
  translate_per_day: number | null;
  explain_per_hour: number | null;
  explain_per_day: number | null;
}

export interface AuthedUser {
  profile: SpotifyProfile;
  row: UserRow | null; // null = access control disabled
}

const userCache = new LruCache<UserRow>(500, 30_000);
let settingsCache: { at: number; v: Limits } | null = null;

const ADMIN_IDS = new Set(
  (env("ADMIN_SPOTIFY_IDS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const enc = encodeURIComponent;

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}


async function loadUser(id: string, fresh = false): Promise<UserRow | null> {
  if (!fresh) {
    const hit = userCache.get(id);
    if (hit) return hit;
  }
  const rows = await rest<UserRow[]>(`app_users?spotify_id=eq.${enc(id)}&limit=1`);
  const row = rows[0] ?? null;
  if (row) userCache.set(id, row);
  return row;
}

async function insertUser(row: Partial<UserRow> & { spotify_id: string }): Promise<UserRow> {
  const rows = await rest<UserRow[]>("app_users?on_conflict=spotify_id", {
    method: "POST",
    body: JSON.stringify(row),
    prefer: "return=representation,resolution=merge-duplicates",
  });
  userCache.set(rows[0].spotify_id, rows[0]);
  return rows[0];
}

async function patchUser(id: string, patch: Partial<UserRow>): Promise<UserRow | null> {
  const rows = await rest<UserRow[]>(`app_users?spotify_id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (rows[0]) userCache.set(id, rows[0]);
  return rows[0] ?? null;
}

/** Finds or creates the app user for this Spotify profile. */
async function resolveUser(profile: SpotifyProfile): Promise<UserRow> {
  let row = await loadUser(profile.id);
  if (!row) {
    const anyone = await rest<{ spotify_id: string }[]>("app_users?select=spotify_id&limit=1");
    const first = anyone.length === 0;
    const isAdmin = first || ADMIN_IDS.has(profile.id);
    row = await insertUser({
      spotify_id: profile.id,
      display_name: profile.displayName,
      role: isAdmin ? "admin" : "user",
      status: isAdmin ? "active" : "pending",
      last_seen_at: new Date().toISOString(),
    });
  } else {
    const stale = !row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 10 * 60_000;
    const promote = ADMIN_IDS.has(profile.id) && (row.role !== "admin" || row.status !== "active");
    const renamed = profile.displayName && profile.displayName !== row.display_name;
    if (stale || promote || renamed) {
      row =
        (await patchUser(profile.id, {
          last_seen_at: new Date().toISOString(),
          ...(renamed ? { display_name: profile.displayName } : {}),
          ...(promote ? { role: "admin", status: "active" } : {}),
        })) ?? row;
    }
  }
  return row;
}

/** Verifies the Spotify token and (if enabled) the user's access status. */
export async function authenticate(req: Request, opts: { allowInactive?: boolean } = {}): Promise<AuthedUser> {
  const profile = await spotifyProfileFromRequest(req);
  if (profile === "not_registered") {
    throw new HttpError(403, "spotify_not_registered", "This Spotify account isn't registered for this app yet. Ask the owner to add your Spotify email in the Spotify Developer Dashboard.");
  }
  if (!profile) throw new HttpError(401, "unauthenticated", "Please reconnect Spotify.");
  if (!supabaseEnabled()) return { profile, row: null };

  const row = await resolveUser(profile);
  if (!opts.allowInactive && row.status !== "active") {
    throw new HttpError(403, row.status === "blocked" ? "access_blocked" : "access_pending", row.status === "blocked" ? "Your access has been revoked." : "Waiting for approval.");
  }
  return { profile, row };
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  if (!supabaseEnabled()) throw new HttpError(501, "no_database", "User management needs Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  const u = await authenticate(req);
  if (u.row?.role !== "admin") throw new HttpError(403, "not_admin", "Admins only.");
  return u;
}

// ── Limits ────────────────────────────────────────────────────

const DEFAULT_LIMITS: Limits = { translatePerHour: 1500, translatePerDay: 6000, explainPerHour: 40, explainPerDay: 150 };

export async function getDefaultLimits(fresh = false): Promise<Limits> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.v;
  const rows = await rest<SettingsRow[]>("app_settings?id=eq.1&limit=1");
  const r = rows[0];
  const v: Limits = r
    ? { translatePerHour: r.translate_per_hour, translatePerDay: r.translate_per_day, explainPerHour: r.explain_per_hour, explainPerDay: r.explain_per_day }
    : DEFAULT_LIMITS;
  settingsCache = { at: Date.now(), v };
  return v;
}

export async function setDefaultLimits(l: Limits) {
  await rest("app_settings?on_conflict=id", {
    method: "POST",
    prefer: "return=minimal,resolution=merge-duplicates",
    body: JSON.stringify({
      id: 1,
      translate_per_hour: l.translatePerHour,
      translate_per_day: l.translatePerDay,
      explain_per_hour: l.explainPerHour,
      explain_per_day: l.explainPerDay,
      updated_at: new Date().toISOString(),
    }),
  });
  settingsCache = null;
}

function effectiveLimits(defaults: Limits, overrides: Partial<Limits> | null): Limits {
  const o = overrides ?? {};
  const pick = (k: keyof Limits) => (k in o ? (o[k] ?? null) : defaults[k]);
  return { translatePerHour: pick("translatePerHour"), translatePerDay: pick("translatePerDay"), explainPerHour: pick("explainPerHour"), explainPerDay: pick("explainPerDay") };
}

/**
 * Charges `amount` units (translated lines / explanations). Admins and
 * local mode are unlimited. Throws HttpError 429 with retryAfter when over.
 */
export async function consumeQuota(user: AuthedUser, kind: QuotaKind, amount: number) {
  if (!user.row || user.row.role === "admin" || amount <= 0) return;
  const lim = effectiveLimits(await getDefaultLimits(), user.row.limits);
  const [hour, day] = kind === "translate" ? [lim.translatePerHour, lim.translatePerDay] : [lim.explainPerHour, lim.explainPerDay];
  if (hour === null && day === null) return;
  if ((hour !== null && amount > hour) || (day !== null && amount > day)) {
    throw new HttpError(429, "quota", "Request exceeds your limit.", { retryAfter: 3600 });
  }
  const r = await rest<{ allowed: boolean; retry_after?: number }>("rpc/consume_quota", {
    method: "POST",
    body: JSON.stringify({ p_user: user.row.spotify_id, p_kind: kind, p_amount: amount, p_hour_limit: hour, p_day_limit: day }),
  });
  if (!r.allowed) {
    const mins = Math.ceil((r.retry_after ?? 3600) / 60);
    throw new HttpError(429, "quota", `${kind === "translate" ? "Translation" : "Explanation"} limit reached — available again in ${mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`}.`, {
      retryAfter: r.retry_after ?? 3600,
    });
  }
}

// ── Self-service ──────────────────────────────────────────────

const todayBucket = () => `d:${new Date().toISOString().slice(0, 10)}`;
const hourBucket = () => `h:${new Date().toISOString().slice(0, 13)}`;

async function usageFor(ids: string[]): Promise<Record<string, { translate: number; explain: number; translateHour: number; explainHour: number }>> {
  if (!ids.length) return {};
  const rows = await rest<{ spotify_id: string; kind: string; bucket: string; count: number }[]>(
    `usage?spotify_id=in.(${ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",")})&bucket=in.(${todayBucket()},${hourBucket()})`,
  );
  const out: Record<string, { translate: number; explain: number; translateHour: number; explainHour: number }> = {};
  for (const id of ids) out[id] = { translate: 0, explain: 0, translateHour: 0, explainHour: 0 };
  for (const r of rows) {
    const u = out[r.spotify_id];
    if (!u) continue;
    const hourly = r.bucket.startsWith("h:");
    if (r.kind === "translate") hourly ? (u.translateHour = r.count) : (u.translate = r.count);
    if (r.kind === "explain") hourly ? (u.explainHour = r.count) : (u.explain = r.count);
  }
  return out;
}

export async function accessInfo(u: AuthedUser): Promise<AccessInfo> {
  if (!u.row) return { accessControl: false, spotifyId: u.profile.id, displayName: u.profile.displayName, role: "admin", status: "active", limits: null, usage: null };
  const lim = u.row.role === "admin" ? null : effectiveLimits(await getDefaultLimits(), u.row.limits);
  const usage = (await usageFor([u.row.spotify_id]))[u.row.spotify_id];
  return { accessControl: true, spotifyId: u.row.spotify_id, displayName: u.row.display_name, role: u.row.role, status: u.row.status, limits: lim, usage };
}

// ── Invites ───────────────────────────────────────────────────

interface InviteRow {
  code: string;
  email: string;
  name: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
}

function newCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createInvite(email: string, name: string | null, by: string): Promise<InviteDTO> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new HttpError(400, "bad_email", "Please enter a valid email address.");
  const rows = await rest<InviteRow[]>("invites", { method: "POST", body: JSON.stringify({ code: newCode(), email: clean, name: name?.trim() || null, created_by: by }) });
  return toInvite(rows[0]);
}

/** Binds an invite to the signed-in Spotify account and activates it. */
export async function redeemInvite(profile: SpotifyProfile, code: string): Promise<void> {
  const rows = await rest<InviteRow[]>(`invites?code=eq.${enc(code)}&limit=1`);
  const inv = rows[0];
  if (!inv) throw new HttpError(404, "invite_invalid", "This invite link is not valid.");
  if (inv.used_by && inv.used_by !== profile.id) throw new HttpError(410, "invite_used", "This invite link has already been used.");
  if (Date.parse(inv.expires_at) < Date.now()) throw new HttpError(410, "invite_expired", "This invite link has expired. Ask for a new one.");

  const existing = await loadUser(profile.id, true);
  if (existing?.status === "blocked") throw new HttpError(403, "access_blocked", "Your access has been revoked.");
  if (existing) await patchUser(profile.id, { status: "active", email: existing.email ?? inv.email, invited_via: code });
  else await insertUser({ spotify_id: profile.id, display_name: profile.displayName, email: inv.email, status: "active", role: "user", invited_via: code, last_seen_at: new Date().toISOString() });
  await rest(`invites?code=eq.${enc(code)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ used_by: profile.id, used_at: new Date().toISOString() }) });
}

const toInvite = (r: InviteRow): InviteDTO => ({ code: r.code, email: r.email, name: r.name, createdAt: r.created_at, expiresAt: r.expires_at, usedBy: r.used_by, usedAt: r.used_at });

// ── Admin ─────────────────────────────────────────────────────

export async function adminOverview(): Promise<AdminOverview> {
  const [users, invites, defaults] = await Promise.all([
    rest<UserRow[]>("app_users?order=created_at.asc&limit=500"),
    rest<InviteRow[]>("invites?used_by=is.null&order=created_at.desc&limit=200"),
    getDefaultLimits(true),
  ]);
  const usage = await usageFor(users.map((u) => u.spotify_id));
  const dto: AppUserDTO[] = users.map((u) => ({
    spotifyId: u.spotify_id,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    status: u.status,
    limits: u.limits,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
    usage: usage[u.spotify_id],
  }));
  return { users: dto, invites: invites.map(toInvite), defaults };
}

export async function adminUpdateUser(actor: string, id: string, patch: { status?: string; role?: string; limits?: Partial<Limits> | null; email?: string | null }) {
  const p: Partial<UserRow> = {};
  if (patch.status !== undefined) {
    if (!["active", "pending", "blocked"].includes(patch.status)) throw new HttpError(400, "bad_status", "Invalid status.");
    p.status = patch.status as UserRow["status"];
  }
  if (patch.role !== undefined) {
    if (!["admin", "user"].includes(patch.role)) throw new HttpError(400, "bad_role", "Invalid role.");
    p.role = patch.role as UserRow["role"];
  }
  if (patch.limits !== undefined) p.limits = patch.limits ? sanitizeLimits(patch.limits, true) : null;
  if (patch.email !== undefined) p.email = patch.email?.trim().toLowerCase() || null;
  if (id === actor && (p.role === "user" || (p.status && p.status !== "active"))) throw new HttpError(400, "self_lockout", "You can't demote or block yourself.");
  const row = await patchUser(id, p);
  if (!row) throw new HttpError(404, "not_found", "User not found.");
}

export async function adminDeleteUser(actor: string, id: string) {
  if (id === actor) throw new HttpError(400, "self_lockout", "You can't remove yourself.");
  await rest(`app_users?spotify_id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
  userCache.delete(id);
}

export async function adminDeleteInvite(code: string) {
  await rest(`invites?code=eq.${enc(code)}`, { method: "DELETE", prefer: "return=minimal" });
}

/** Coerces limit inputs: non-negative integers or null (= unlimited). */
export function sanitizeLimits(l: Partial<Limits>, partial = false): Limits {
  const keys: (keyof Limits)[] = ["translatePerHour", "translatePerDay", "explainPerHour", "explainPerDay"];
  const out: Partial<Limits> = {};
  for (const k of keys) {
    if (!(k in l)) {
      if (!partial) out[k] = null;
      continue;
    }
    const v = l[k];
    if (v === null || v === undefined || (v as unknown) === "") out[k] = null;
    else {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, "bad_limit", `Invalid value for ${k}.`);
      out[k] = n;
    }
  }
  return out as Limits;
}

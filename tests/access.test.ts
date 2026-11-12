/**
 * Access control + quota logic against a tiny in-memory fake of the
 * Supabase REST API and Spotify /v1/me.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

type Row = Record<string, any>;
const db: Record<string, Row[]> = { app_users: [], invites: [], app_settings: [{ id: 1, translate_per_hour: 100, translate_per_day: 150, explain_per_hour: 5, explain_per_day: 10 }], usage: [] };
const tokens: Record<string, { id: string; display_name: string } | 403> = {
  "tok-owner": { id: "owner", display_name: "Timeo" },
  "tok-friend": { id: "friend", display_name: "Luca" },
  "tok-stranger": { id: "stranger", display_name: "Who" },
  "tok-unregistered": 403,
};

function filter(rows: Row[], params: URLSearchParams) {
  return rows.filter((r) =>
    [...params.entries()].every(([k, v]) => {
      if (["select", "limit", "order", "on_conflict"].includes(k)) return true;
      if (v.startsWith("eq.")) return String(r[k]) === decodeURIComponent(v.slice(3));
      if (v === "is.null") return r[k] == null;
      if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")).includes(String(r[k]));
      return true;
    }),
  );
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  if (url.host === "api.spotify.com") {
    const t = tokens[String((init.headers as any).Authorization).replace("Bearer ", "")];
    if (t === 403) return json({ error: { status: 403 } }, 403);
    return t ? json(t) : json({}, 401);
  }
  const [, , , table] = url.pathname.split("/"); // /rest/v1/<table>
  const method = init.method ?? "GET";
  if (table === "rpc") {
    const p = JSON.parse(String(init.body));
    const key = (b: string) => db.usage.find((u) => u.spotify_id === p.p_user && u.kind === p.p_kind && u.bucket === b);
    const bump = (b: string) => {
      let u = key(b);
      if (!u) db.usage.push((u = { spotify_id: p.p_user, kind: p.p_kind, bucket: b, count: 0 }));
      u.count += p.p_amount;
      return u;
    };
    const now = new Date().toISOString();
    const h = bump(`h:${now.slice(0, 13)}`), d = bump(`d:${now.slice(0, 10)}`);
    if ((p.p_day_limit !== null && d.count > p.p_day_limit) || (p.p_hour_limit !== null && h.count > p.p_hour_limit)) {
      h.count -= p.p_amount;
      d.count -= p.p_amount;
      return json({ allowed: false, retry_after: 1200 });
    }
    return json({ allowed: true });
  }
  const rows = db[table];
  const matched = filter(rows, url.searchParams);
  if (method === "GET") return json(matched.slice(0, Number(url.searchParams.get("limit") ?? 1000)));
  if (method === "POST") {
    const body = JSON.parse(String(init.body));
    const pk = table === "app_users" ? "spotify_id" : table === "invites" ? "code" : "id";
    const existing = rows.find((r) => r[pk] === body[pk]);
    if (existing) Object.assign(existing, body);
    else rows.push({ created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), limits: null, ...body });
    return json([existing ?? rows[rows.length - 1]], 201);
  }
  if (method === "PATCH") {
    const body = JSON.parse(String(init.body));
    matched.forEach((r) => Object.assign(r, body));
    return json(matched);
  }
  if (method === "DELETE") {
    db[table] = rows.filter((r) => !matched.includes(r));
    return new Response(null, { status: 204 });
  }
  return json({}, 400);
}) as typeof fetch;

const req = (token?: string) => new Request("http://x/api", { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test("first user becomes admin, next one is pending", async () => {
  const { authenticate, HttpError } = await import("../lib/server/access");
  const owner = await authenticate(req("tok-owner"));
  assert.equal(owner.row?.role, "admin");
  assert.equal(owner.row?.status, "active");
  await assert.rejects(authenticate(req("tok-stranger")), (e: unknown) => e instanceof HttpError && e.code === "access_pending");
  assert.equal(db.app_users.find((u) => u.spotify_id === "stranger")?.status, "pending");
});

test("missing / unregistered tokens are rejected", async () => {
  const { authenticate, HttpError } = await import("../lib/server/access");
  await assert.rejects(authenticate(req()), (e: unknown) => e instanceof HttpError && e.status === 401);
  await assert.rejects(authenticate(req("tok-unregistered")), (e: unknown) => e instanceof HttpError && e.code === "spotify_not_registered");
});

test("invite links activate exactly one account", async () => {
  const { createInvite, redeemInvite, authenticate, HttpError } = await import("../lib/server/access");
  await assert.rejects(createInvite("not-an-email", null, "owner"), /valid email/);
  const inv = await createInvite("Luca@Example.com", "Luca", "owner");
  assert.equal(inv.email, "luca@example.com");
  await redeemInvite({ id: "friend", displayName: "Luca" }, inv.code);
  const friend = await authenticate(req("tok-friend"));
  assert.equal(friend.row?.status, "active");
  assert.equal(friend.row?.email, "luca@example.com");
  await assert.rejects(redeemInvite({ id: "stranger", displayName: "Who" }, inv.code), (e: unknown) => e instanceof HttpError && e.code === "invite_used");
  await assert.rejects(redeemInvite({ id: "stranger", displayName: "Who" }, "nope"), (e: unknown) => e instanceof HttpError && e.code === "invite_invalid");
});

test("quotas: defaults apply, overrides win, admins are unlimited", async () => {
  const { authenticate, consumeQuota, adminUpdateUser, HttpError } = await import("../lib/server/access");
  const friend = await authenticate(req("tok-friend"));
  await consumeQuota(friend, "translate", 90);
  await assert.rejects(consumeQuota(friend, "translate", 20), (e: unknown) => e instanceof HttpError && e.status === 429 && /20 min/.test(e.message));
  await consumeQuota(friend, "translate", 10); // exactly at the hourly limit (100)

  await adminUpdateUser("owner", "friend", { limits: { translatePerHour: 1000, translatePerDay: 1000 } });
  const again = await authenticate(req("tok-friend"));
  await consumeQuota(again, "translate", 200);

  const owner = await authenticate(req("tok-owner"));
  for (let i = 0; i < 50; i++) await consumeQuota(owner, "explain", 1);
  assert.equal(db.usage.filter((u) => u.spotify_id === "owner").length, 0, "admins are not even counted");
});

test("admins can't lock themselves out; blocked users are refused", async () => {
  const { adminUpdateUser, adminDeleteUser, authenticate, HttpError } = await import("../lib/server/access");
  await assert.rejects(adminUpdateUser("owner", "owner", { role: "user" }), /yourself/);
  await assert.rejects(adminDeleteUser("owner", "owner"), /yourself/);
  await adminUpdateUser("owner", "friend", { status: "blocked" });
  await assert.rejects(authenticate(req("tok-friend")), (e: unknown) => e instanceof HttpError && e.code === "access_blocked");
});

test("sanitizeLimits validates input", async () => {
  const { sanitizeLimits } = await import("../lib/server/access");
  assert.deepEqual(sanitizeLimits({ translatePerHour: 10.7 as number, explainPerDay: null }), { translatePerHour: 10, translatePerDay: null, explainPerHour: null, explainPerDay: null });
  assert.throws(() => sanitizeLimits({ translatePerDay: -1 }), /Invalid/);
});

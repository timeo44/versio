import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("routePath strips function prefixes", async () => {
  const { routePath } = await import("../lib/server/handler");
  assert.equal(routePath("/functions/v1/versio-api/translate"), "/translate");
  assert.equal(routePath("/versio-api/me/"), "/me");
  assert.equal(routePath("/api/lyrics"), "/lyrics");
  assert.equal(routePath("/versio-api"), "/");
});

test("CORS preflight, public config, auth required elsewhere", async () => {
  const { handle } = await import("../lib/server/handler");
  const pre = await handle(new Request("http://x/versio-api/translate", { method: "OPTIONS", headers: { Origin: "https://timeo44.github.io" } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "*");
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /authorization/);

  const cfg = await handle(new Request("http://x/versio-api/config"));
  assert.equal(cfg.status, 200);
  const c = await cfg.json();
  assert.equal(typeof c.provider, "string");
  assert.equal(cfg.headers.get("access-control-allow-origin"), "*");

  const noAuth = await handle(new Request("http://x/versio-api/translate", { method: "POST", body: "{}" }));
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.headers.get("access-control-allow-origin"), "*", "CORS headers on errors too");

  const missing = await handle(new Request("http://x/versio-api/nope"));
  assert.equal(missing.status, 404);
});

test("ALLOWED_ORIGINS restricts CORS", async () => {
  process.env.ALLOWED_ORIGINS = "https://timeo44.github.io";
  const { handle } = await import("../lib/server/handler");
  const ok = await handle(new Request("http://x/config", { headers: { Origin: "https://timeo44.github.io" } }));
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://timeo44.github.io");
  const other = await handle(new Request("http://x/config", { headers: { Origin: "https://evil.example" } }));
  assert.notEqual(other.headers.get("access-control-allow-origin"), "https://evil.example");
  delete process.env.ALLOWED_ORIGINS;
});

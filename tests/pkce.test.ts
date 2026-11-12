import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { codeChallenge, randomString } from "../lib/spotify/pkce";

test("S256 challenge matches an independent implementation", async () => {
  for (let i = 0; i < 20; i++) {
    const v = randomString(43 + i);
    const expected = createHash("sha256").update(v).digest("base64url");
    assert.equal(await codeChallenge(v), expected);
  }
});

test("verifier uses the unreserved charset and requested length", () => {
  const v = randomString(64);
  assert.equal(v.length, 64);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
});

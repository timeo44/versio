/**
 * Service tests with a mocked fetch: LRCLIB lookup strategy and both
 * translation providers (request shape, caching, error mapping).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  return handler(url, init);
}) as typeof fetch;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
});

test("LRCLIB: exact synced match is used directly", async () => {
  const { findLyrics } = await import("../lib/server/lrclib");
  handler = (url) =>
    url.includes("/api/get")
      ? json({ id: 1, trackName: "T", artistName: "A", albumName: "Al", duration: 200, instrumental: false, plainLyrics: "x", syncedLyrics: "[00:01.00]Hola\n[00:02.00]Mundo" })
      : json([]);
  const r = await findLyrics({ track: "T", artist: "A", album: "Al", durationMs: 200_400 });
  assert.equal(r.kind, "synced");
  assert.deepEqual(r.lines.map((l) => l.text), ["Hola", "Mundo"]);
  assert.match(calls[0].url, /duration=200/);
  assert.equal(calls.length, 1);
});

test("LRCLIB: falls back to search, rejects wrong durations, prefers synced", async () => {
  const { findLyrics } = await import("../lib/server/lrclib");
  handler = (url) => {
    if (url.includes("/api/get")) return json({ code: 404 }, 404);
    return json([
      { id: 2, trackName: "Song", artistName: "Band", duration: 250, instrumental: false, plainLyrics: null, syncedLyrics: "[00:01.00]Wrong length" },
      { id: 3, trackName: "Song", artistName: "Band", duration: 181, instrumental: false, plainLyrics: "plain only", syncedLyrics: null },
      { id: 4, trackName: "Song", artistName: "Band", duration: 179, instrumental: false, plainLyrics: "p", syncedLyrics: "[00:01.00]Right one" },
    ]);
  };
  const r = await findLyrics({ track: "Song - Remastered 2011", artist: "Band", durationMs: 180_000 });
  assert.equal(r.kind, "synced");
  assert.equal(r.source?.id, 4);
});

test("LRCLIB: plain-only result is marked plain, not synced", async () => {
  const { findLyrics } = await import("../lib/server/lrclib");
  handler = (url) =>
    url.includes("/api/get") ? json({ id: 5, trackName: "P", artistName: "Q", duration: 100, instrumental: false, plainLyrics: "one\ntwo", syncedLyrics: null }) : json([]);
  const r = await findLyrics({ track: "P", artist: "Q", durationMs: 100_000 });
  assert.equal(r.kind, "plain");
  assert.ok(r.lines.every((l) => l.timeMs === null));
});

test("LRCLIB: not found", async () => {
  const { findLyrics } = await import("../lib/server/lrclib");
  handler = (url) => (url.includes("/api/get") ? json({}, 404) : json([]));
  const r = await findLyrics({ track: "Nope", artist: "Nobody", durationMs: 1000 });
  assert.equal(r.kind, "not_found");
});

test("OpenAI provider: one translation per line, cached on second call", async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.TRANSLATION_PROVIDER = "openai";
  const { translateLines } = await import("../lib/server/translate");
  handler = (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_object");
    assert.match(body.messages[0].content, /German/);
    return json({ choices: [{ message: { content: JSON.stringify({ sourceLanguage: "es", translations: ["Ich vermisse dich", "1. Komm zurück"] }) } }] });
  };
  const r = await translateLines({ lines: ["Te extraño", "Vuelve"], target: "de", context: { title: "X", artist: "Y" } });
  assert.deepEqual(r.translations, { "Te extraño": "Ich vermisse dich", Vuelve: "Komm zurück" });
  assert.equal(r.sourceLanguage, "es");
  const before = calls.length;
  const again = await translateLines({ lines: ["Vuelve"], target: "de", context: { title: "X", artist: "Y" } });
  assert.equal(calls.length, before, "served from cache");
  assert.equal(again.sourceLanguage, "es");
});

test("OpenAI provider: retries once on wrong line count, then errors", async () => {
  const { translateLines } = await import("../lib/server/translate");
  let n = 0;
  handler = () => {
    n++;
    return json({ choices: [{ message: { content: JSON.stringify({ translations: ["only one"] }) } }] });
  };
  await assert.rejects(translateLines({ lines: ["a1", "b1"], target: "fr" }), /malformed/);
  assert.equal(n, 2);
});

test("OpenAI provider: 429 maps to a rate-limit error", async () => {
  const { translateLines, TranslationUnavailableError } = await import("../lib/server/translate");
  handler = () => json({ error: { message: "slow down" } }, 429);
  await assert.rejects(translateLines({ lines: ["zzz"], target: "it" }), (e: unknown) => e instanceof TranslationUnavailableError && e.status === 429);
});

test("DeepL provider: free-key host, target code mapping, detected language", async () => {
  process.env.TRANSLATION_PROVIDER = "deepl";
  process.env.DEEPL_API_KEY = "abc:fx";
  const { translateLines } = await import("../lib/server/translate");
  handler = (url, init) => {
    assert.match(url, /^https:\/\/api-free\.deepl\.com\/v2\/translate/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.target_lang, "PT-BR");
    assert.ok(body.context.includes("Song lyrics"));
    return json({ translations: body.text.map((t: string) => ({ detected_source_language: "EN", text: `pt:${t}` })) });
  };
  const r = await translateLines({ lines: ["hello there"], target: "pt", context: { title: "S", artist: "A" } });
  assert.equal(r.provider, "deepl");
  assert.equal(r.translations["hello there"], "pt:hello there");
  assert.equal(r.sourceLanguage, "en");
});

test("DeepL provider: unsupported target is rejected cleanly", async () => {
  const { translateLines } = await import("../lib/server/translate");
  await assert.rejects(translateLines({ lines: ["x"], target: "hi" }), /does not support/);
});

test("romanization: one per line, cached", async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const { romanizeLines } = await import("../lib/server/translate");
  let n = 0;
  handler = (_u, init) => {
    n++;
    const b = JSON.parse(String(init?.body));
    assert.match(b.messages[0].content, /never translate/i);
    assert.match(b.messages[0].content, /sun-letter assimilation/);
    assert.equal(b.model, "gpt-4.1");
    assert.match(b.messages[1].content, /Full lyrics for context/);
    return json({ choices: [{ message: { content: JSON.stringify({ romanizations: ["ya albi", "1. habibi"] }) } }] });
  };
  const charged: number[] = [];
  const r = await romanizeLines(["يا قلبي", "حبيبي"], { title: "T", lyrics: "يا قلبي\nحبيبي" }, async (k) => void charged.push(k));
  assert.deepEqual(r, { "يا قلبي": "ya albi", "حبيبي": "habibi" });
  await romanizeLines(["حبيبي"], {}, async (k) => void charged.push(k));
  assert.equal(n, 1);
  assert.deepEqual(charged, [2]);
});

test("OpenAI provider: empty credits give a clear message", async () => {
  process.env.TRANSLATION_PROVIDER = "openai";
  const { translateLines, TranslationUnavailableError } = await import("../lib/server/translate");
  handler = () => json({ error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } }, 429);
  await assert.rejects(translateLines({ lines: ["quota-line"], target: "de" }), (e: unknown) => e instanceof TranslationUnavailableError && e.status === 402 && /credits are used up/.test(e.message));
});

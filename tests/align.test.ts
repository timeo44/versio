import { test } from "node:test";
import assert from "node:assert/strict";
import { alignHeard, similarity, tokens, type HeardWord } from "../lib/lyrics/align";
import type { LyricLine } from "../lib/lyrics/lrc";

const L = (timeMs: number, text: string, id: number): LyricLine => ({ id, timeMs, text });
const song = [
  L(10_000, "I wanna dance with somebody", 0),
  L(14_000, "I wanna feel the heat with somebody", 1),
  L(18_000, "Yeah", 2),
  L(20_000, "With somebody who loves me", 3),
  L(40_000, "I wanna dance with somebody", 4),
  L(44_000, "I wanna feel the heat with somebody", 5),
];
const words = (s: string, start: number, step = 0.35): HeardWord[] => s.split(" ").map((w, i) => ({ word: w, start: start + i * step }));

test("tokens strip accents/punctuation and split CJK", () => {
  assert.deepEqual(tokens("Ça va, l'été!"), ["ca", "va", "l", "ete"]);
  assert.deepEqual(tokens("夜に駆ける"), ["夜", "に", "駆", "け", "る"]);
  assert.ok(similarity("wanna dance", "wana dance") > 0.8);
});

test("derives the offset from heard lines", () => {
  // clip starts at song 13 s, but the singer is 1.5 s ahead of where Spotify says
  const heard = [...words("feel the heat with somebody", 0.5), ...words("with somebody who loves me", 5.5)];
  // true: line 1 (14 s) heard at clip 0.5 s (minus first words not heard → still ok-ish)
  const heard2 = [...words("I wanna feel the heat with somebody", 0.5), ...words("with somebody who loves me", 6.5)];
  const r = alignHeard(song, heard2, (sec) => 12_500 + sec * 1000);
  if (!r) throw new Error("expected a match");
  // line 1: 14000 - 13000 = 1000; line 3: 20000 - 19000 = 1000
  assert.equal(r.offsetMs, 1000);
  assert.deepEqual(r.matches.map((m) => m.index), [1, 3]);
  assert.ok(alignHeard(song, heard, (sec) => 12_500 + sec * 1000));
});

test("repeated chorus resolves to the one nearest the current offset", () => {
  const heard = words("I wanna dance with somebody", 1);
  // clip at song 39 s → heard at 40 s → second chorus fits offset 0, first fits −30 s
  const r = alignHeard(song, heard, (sec) => 39_000 + sec * 1000, 0);
  assert.equal(r?.offsetMs, 0);
});

test("returns null for silence or unrelated speech", () => {
  assert.equal(alignHeard(song, [], (s) => s * 1000), null);
  assert.equal(alignHeard(song, words("thank you for watching", 0), (s) => s * 1000), null);
});

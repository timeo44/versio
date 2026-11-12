import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrackName, findActiveIndex, parseLrc, parsePlain, prioritizedChunks, uniqueTexts } from "../lib/lyrics/lrc";

test("parses standard LRC with 2- and 3-digit fractions", () => {
  const lines = parseLrc("[ar:Someone]\n[00:01.50]Hello\n[00:03.250]World\n[00:05]Bare");
  assert.deepEqual(lines.map((l) => [l.timeMs, l.text]), [
    [1500, "Hello"],
    [3250, "World"],
    [5000, "Bare"],
  ]);
});

test("expands repeated timestamps and sorts", () => {
  const lines = parseLrc("[00:10.00][00:30.00]Chorus\n[00:20.00]Verse");
  assert.deepEqual(lines.map((l) => [l.timeMs, l.text]), [
    [10000, "Chorus"],
    [20000, "Verse"],
    [30000, "Chorus"],
  ]);
  assert.deepEqual(lines.map((l) => l.id), [0, 1, 2]);
});

test("applies [offset:] (positive = earlier)", () => {
  const lines = parseLrc("[offset:+500]\n[00:02.00]A");
  assert.equal(lines[0].timeMs, 1500);
});

test("keeps instrumental gaps, collapses duplicates, strips word tags", () => {
  const lines = parseLrc("[00:01.00]A\n[00:02.00]\n[00:03.00]\n[00:04.00]<00:04.10>B <00:04.50>C");
  assert.deepEqual(lines.map((l) => l.text), ["A", "", "B C"]);
});

test("ignores garbage lines and metadata", () => {
  const lines = parseLrc("random text\n[ti:Title]\n[length: 03:20]\n[00:01.00]Ok");
  assert.deepEqual(lines.map((l) => l.text), ["Ok"]);
});

test("findActiveIndex boundaries", () => {
  const lines = parseLrc("[00:01.00]A\n[00:02.00]B\n[00:03.00]C");
  assert.equal(findActiveIndex(lines, 0), -1);
  assert.equal(findActiveIndex(lines, 999), -1);
  assert.equal(findActiveIndex(lines, 1000), 0);
  assert.equal(findActiveIndex(lines, 1999), 0);
  assert.equal(findActiveIndex(lines, 2000), 1);
  assert.equal(findActiveIndex(lines, 99999), 2);
  assert.equal(findActiveIndex([], 500), -1);
});

test("plain lyrics have no timestamps and are never 'active'", () => {
  const lines = parsePlain("A\n\n\nB\n\n");
  assert.deepEqual(lines.map((l) => [l.timeMs, l.text]), [
    [null, "A"],
    [null, ""],
    [null, "B"],
  ]);
  assert.equal(findActiveIndex(lines, 5000), -1);
});

test("cleanTrackName strips Spotify suffixes", () => {
  assert.equal(cleanTrackName("Come Together - Remastered 2009"), "Come Together");
  assert.equal(cleanTrackName("Despacito (feat. Daddy Yankee)"), "Despacito");
  assert.equal(cleanTrackName("Song - Live at Wembley"), "Song");
  assert.equal(cleanTrackName("Normal Title"), "Normal Title");
});

test("uniqueTexts dedupes choruses", () => {
  assert.deepEqual(uniqueTexts([{ text: "a" }, { text: "" }, { text: "b" }, { text: "a " }]), ["a", "b"]);
});

test("prioritizedChunks starts at the current line and wraps", () => {
  const lines = ["l0", "l1", "l2", "l3", "l4"].map((text) => ({ text }));
  const missing = new Set(["l0", "l1", "l3", "l4"]);
  assert.deepEqual(prioritizedChunks(lines, 3, missing, 2), [["l3", "l4"], ["l0", "l1"]]);
  assert.deepEqual(prioritizedChunks(lines, -1, missing, 10), [["l0", "l1", "l3", "l4"]]);
});

test("needsRomanization detects non-Latin scripts only", async () => {
  const { needsRomanization } = await import("../lib/lyrics/lrc");
  assert.equal(needsRomanization("Bailando lento, pensando en ti"), false);
  assert.equal(needsRomanization("Ça va? Größe — ñ!"), false);
  assert.equal(needsRomanization("يا قلبي"), true);
  assert.equal(needsRomanization("君の名は"), true);
  assert.equal(needsRomanization("사랑해 baby"), true);
  assert.equal(needsRomanization("Привет"), true);
});

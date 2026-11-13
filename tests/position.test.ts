import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrateOffset, positionAt, reconcileAnchor, MAX_OFFSET_MS, type Anchor } from "../lib/playback/position";

const a: Anchor = { progressMs: 10_000, at: 1000, isPlaying: true, durationMs: 200_000 };

test("extrapolates while playing, freezes while paused", () => {
  assert.equal(positionAt(a, 1500), 10_500);
  assert.equal(positionAt({ ...a, isPlaying: false }, 9999), 10_000);
  assert.equal(positionAt(a, 1500, 250), 10_750);
  assert.equal(positionAt(null, 5), 0);
});

test("clamps to duration and zero", () => {
  assert.equal(positionAt(a, 1e9), 200_000);
  assert.equal(positionAt({ ...a, progressMs: 0 }, 1000, -500), 0);
});

test("reconcile keeps anchor for small jitter, resets on seeks", () => {
  const jitter: Anchor = { ...a, progressMs: 10_520 + 200, at: 1520 };
  assert.equal(reconcileAnchor(a, jitter, true).progressMs, 10_000);
  const seek: Anchor = { ...a, progressMs: 60_000, at: 1520 };
  assert.equal(reconcileAnchor(a, seek, true).progressMs, 60_000);
  assert.equal(reconcileAnchor(a, jitter, false).progressMs, jitter.progressMs);
  const paused: Anchor = { ...jitter, isPlaying: false };
  assert.equal(reconcileAnchor(a, paused, true), paused);
});

test("calibration makes the tapped line active now", () => {
  // song is at 10.5 s; user says the line starting at 12 s is being sung
  const off = calibrateOffset(a, 1500, 12_000);
  assert.equal(off, 1650);
  assert.ok(positionAt(a, 1500, off) >= 12_000);
  // line already passed → negative offset (lyrics later)
  assert.equal(calibrateOffset(a, 1500, 9_000, 0), -1500);
  // clamps absurd jumps
  assert.equal(calibrateOffset(a, 1500, 120_000), MAX_OFFSET_MS);
});

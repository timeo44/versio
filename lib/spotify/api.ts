"use client";

import { AuthExpiredError, getAccessToken } from "./auth";
import { SPOTIFY_API } from "./config";

export class SpotifyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Spotify rate limit reached. Retrying in ${Math.ceil(retryAfterMs / 1000)} s.`);
    this.name = "RateLimitError";
  }
}

export async function spotifyFetch<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(attempt > 0);
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    });

    if (res.status === 204) return null;
    if (res.status === 401) {
      if (attempt === 0) continue; // force refresh once
      throw new AuthExpiredError();
    }
    if (res.status === 429) {
      const after = Number(res.headers.get("Retry-After"));
      throw new RateLimitError(Number.isFinite(after) && after > 0 ? after * 1000 : 5000);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new SpotifyApiError(res.status, body?.error?.message || `Spotify API error ${res.status}`);
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  }
  return null;
}

// ── Minimal response types ───────────────────────────────────

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyTrack {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  is_local: boolean;
  artists: { name: string }[];
  album: { name: string; images: SpotifyImage[] };
  external_urls?: { spotify?: string };
}

export interface PlaybackStateResponse {
  is_playing: boolean;
  progress_ms: number | null;
  timestamp: number;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  item: SpotifyTrack | null;
  device?: { id: string | null; name: string; type: string; is_private_session?: boolean; is_restricted?: boolean } | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

export const getPlaybackState = (signal?: AbortSignal) =>
  spotifyFetch<PlaybackStateResponse>("/me/player?additional_types=track", signal);

export const getMe = () => spotifyFetch<SpotifyUser>("/me");

// ── Playback control (needs user-modify-playback-state + Premium) ──

export class PlayerCommandError extends Error {
  constructor(public status: number, public reason: "premium" | "scope" | "no-device" | "restricted" | "other", message: string) {
    super(message);
    this.name = "PlayerCommandError";
  }
}

/**
 * Sends a player command. Unlike spotifyFetch, a second 401 never logs the
 * user out — Spotify answers some scope problems with 401/403 too.
 */
export async function playerCommand(method: "PUT" | "POST", path: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(attempt > 0);
    const res = await fetch(`${SPOTIFY_API}/me/player${path}`, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.ok) return;
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 429) {
      const after = Number(res.headers.get("Retry-After"));
      throw new RateLimitError(Number.isFinite(after) && after > 0 ? after * 1000 : 5000);
    }
    const body = await res.json().catch(() => null);
    const reason: string = body?.error?.reason ?? "";
    const msg: string = body?.error?.message ?? "";
    if (reason === "PREMIUM_REQUIRED" || /premium/i.test(msg)) throw new PlayerCommandError(res.status, "premium", "Controlling playback needs Spotify Premium.");
    if (res.status === 401 || /scope|permission/i.test(msg)) throw new PlayerCommandError(res.status, "scope", "Reconnect Spotify to allow playback controls.");
    if (res.status === 404 || reason === "NO_ACTIVE_DEVICE") throw new PlayerCommandError(res.status, "no-device", "No active Spotify device — start playback on a device first.");
    if (res.status === 403) throw new PlayerCommandError(res.status, "restricted", "This Spotify device doesn't allow remote control right now.");
    throw new PlayerCommandError(res.status, "other", msg || `Spotify player error ${res.status}`);
  }
  throw new PlayerCommandError(401, "scope", "Reconnect Spotify to allow playback controls.");
}

export const playerPlay = () => playerCommand("PUT", "/play");
export const playerPause = () => playerCommand("PUT", "/pause");
export const playerNext = () => playerCommand("POST", "/next");
export const playerPrevious = () => playerCommand("POST", "/previous");
export const playerSeek = (ms: number) => playerCommand("PUT", `/seek?position_ms=${Math.max(0, Math.round(ms))}`);

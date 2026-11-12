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
  device?: { name: string; type: string; is_private_session?: boolean } | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

export const getPlaybackState = (signal?: AbortSignal) =>
  spotifyFetch<PlaybackStateResponse>("/me/player?additional_types=track", signal);

export const getMe = () => spotifyFetch<SpotifyUser>("/me");

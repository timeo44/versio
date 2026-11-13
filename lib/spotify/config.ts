import { BASE_PATH } from "@/lib/runtime";

export const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

/** Least-privilege: read-only playback state. Nothing else. */
export const SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-playback-state"];

export const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_API = "https://api.spotify.com/v1";

export function getRedirectUri(): string {
  const configured = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (configured) return configured;
  return `${window.location.origin}${BASE_PATH}/callback`;
}

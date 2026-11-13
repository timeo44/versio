"use client";

import { codeChallenge, randomString } from "./pkce";
import { BASE_PATH } from "@/lib/runtime";
import { SPOTIFY_ACCOUNTS, SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES, getRedirectUri } from "./config";

const TOKENS_KEY = "versio:spotify:tokens";
const VERIFIER_KEY = "versio:spotify:verifier";
const STATE_KEY = "versio:spotify:state";
export const AUTH_EVENT = "versio:auth-changed";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  scope: string;
}

export class AuthExpiredError extends Error {
  constructor(message = "Spotify session expired. Please reconnect.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

function read(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

function write(t: StoredTokens | null) {
  try {
    if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKENS_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function hasSession(): boolean {
  return !!read()?.refreshToken;
}

export function logout() {
  write(null);
}

/**
 * Starts the Authorization Code + PKCE flow. Verifier and state are kept
 * in localStorage, which is per-origin — so if the user opened the app on a
 * different origin than the redirect URI (e.g. localhost vs 127.0.0.1), we
 * hop to the redirect origin first.
 */
export async function startLogin() {
  if (!SPOTIFY_CLIENT_ID) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set.");
  const redirectUri = getRedirectUri();
  const redirectOrigin = new URL(redirectUri).origin;
  if (redirectOrigin !== window.location.origin) {
    window.location.href = `${redirectOrigin}${BASE_PATH}/?connect=1`;
    return;
  }

  const verifier = randomString(64);
  const state = randomString(24);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: await codeChallenge(verifier),
    state,
  });
  window.location.href = `${SPOTIFY_ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<StoredTokens> {
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error as string | undefined;
    if (res.status === 400 && (err === "invalid_grant" || err === "invalid_request")) {
      throw new AuthExpiredError();
    }
    throw new Error(data?.error_description || `Spotify token request failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    // Spotify may or may not rotate the refresh token
    refreshToken: data.refresh_token ?? body.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? "",
  };
}

/** Handles /callback?code=…&state=… */
export async function completeLogin(search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) throw new Error(error === "access_denied" ? "Spotify access was denied." : `Spotify error: ${error}`);

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = localStorage.getItem(STATE_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!code) throw new Error("Missing authorization code.");
  if (!verifier || !state || state !== expectedState) {
    throw new Error("Login session mismatch. Please try connecting again from the same address.");
  }

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(STATE_KEY);
  write(tokens);
}

let refreshing: Promise<StoredTokens> | null = null;

async function refresh(current: StoredTokens): Promise<StoredTokens> {
  // single-flight: concurrent callers share one refresh
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: current.refreshToken })
      .then((t) => {
        write(t);
        return t;
      })
      .catch((e) => {
        if (e instanceof AuthExpiredError) write(null);
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** Returns a valid access token, refreshing ~60 s before expiry. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const t = read();
  if (!t?.refreshToken) throw new AuthExpiredError("Not connected to Spotify.");
  if (!forceRefresh && t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  return (await refresh(t)).accessToken;
}

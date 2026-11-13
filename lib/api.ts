"use client";

import { getAccessToken } from "@/lib/spotify/auth";
import { API_BASE } from "@/lib/runtime";

export class ApiError extends Error {
  constructor(public status: number, public code: string | undefined, message: string, public retryAfter?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export const ACCESS_EVENT = "versio:access-changed";

/** fetch() against the Versio API (path like "/translate") with the Spotify token attached. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // access was revoked mid-session → let the app re-check
    if (res.status === 403 && typeof data?.code === "string" && data.code.startsWith("access_")) window.dispatchEvent(new Event(ACCESS_EVENT));
    throw new ApiError(res.status, data?.code, data?.error || `Request failed (${res.status})`, data?.retryAfter);
  }
  return data as T;
}

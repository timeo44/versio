/** Rate limits. null = unlimited. Translation is counted in lyric lines sent to the provider (cache hits are free). */
export interface Limits {
  translatePerHour: number | null;
  translatePerDay: number | null;
  explainPerHour: number | null;
  explainPerDay: number | null;
}

export type QuotaKind = "translate" | "explain";

export interface Usage {
  translate: number;
  explain: number;
  translateHour: number;
  explainHour: number;
}

export interface AccessInfo {
  /** false = no database configured, everyone with a valid Spotify login gets in */
  accessControl: boolean;
  spotifyId: string;
  displayName: string | null;
  role: "admin" | "user";
  status: "active" | "pending" | "blocked";
  /** effective limits; null for admins / local mode */
  limits: Limits | null;
  usage: Usage | null;
}

export interface AppUserDTO {
  spotifyId: string;
  displayName: string | null;
  email: string | null;
  role: "admin" | "user";
  status: "active" | "pending" | "blocked";
  limits: Partial<Limits> | null;
  createdAt: string;
  lastSeenAt: string | null;
  usage?: Usage;
}

export interface InviteDTO {
  code: string;
  email: string;
  name: string | null;
  createdAt: string;
  expiresAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export interface AdminOverview {
  users: AppUserDTO[];
  invites: InviteDTO[];
  defaults: Limits;
}

/** Spotify Development Mode allows this many authorised users per app. */
export const SPOTIFY_DEV_MODE_USER_LIMIT = 5;

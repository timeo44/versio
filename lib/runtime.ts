/** Where the API lives: the Supabase Edge Function in production, the local dev server otherwise. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

/** Sub-path the site is served from, e.g. "/versio" on GitHub Pages. Empty locally. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

# Versio — Live Spotify Lyrics Translator

Versio watches what you're playing on Spotify, finds **time-synced lyrics**, and shows a **natural translation** of every line as it's sung.

- Spotify OAuth 2.0 **Authorization Code + PKCE** (no client secret anywhere)
- Read-only scopes: `user-read-currently-playing`, `user-read-playback-state`
- Synced lyrics from **LRCLIB** (LRC, line-level). Unsynced lyrics are shown in a clearly marked fallback mode — never fake timing.
- Translation via **OpenAI** (context-aware, slang/idioms, line explanations) or **DeepL**
- Current line first: the chunk around the line being sung is translated before the rest of the song
- Translation caches on the server (memory) and in the browser (per song + language)
- Line breakdowns (literal / natural / slang / cultural context / vocabulary)
- Vocabulary list (local, optional Supabase sync, CSV export)
- Follow-the-line auto-scroll, free manual browsing with a "Follow live" button, timing offset for Bluetooth latency

Stack: Next.js 15 (static export) · React 19 · TypeScript · Tailwind CSS 4 · Supabase Edge Functions + Postgres · GitHub Pages.

---

## 1. Create a Spotify Developer app

> Since February 2026, Spotify Development Mode requires the app owner to have **Spotify Premium**, allows **one** Development-Mode Client ID per developer, and up to **five** authorised users per app.

1. Go to <https://developer.spotify.com/dashboard> and log in.
2. **Create app**
   - App name / description: anything (e.g. "Versio")
   - **Redirect URIs**: `http://127.0.0.1:3000/callback` (see step 2)
   - APIs used: tick **Web API**
3. Save, open **Settings** and copy the **Client ID**. You do **not** need the client secret.
4. **User Management** → add the Spotify account(s) that will use the app (name + email of the Spotify account). Your own account must be on this list too.

## 2. Configure redirect URIs

Spotify only accepts HTTPS redirect URIs, with one exception: loopback addresses. **`localhost` is not allowed** — use `127.0.0.1`.

| Environment | Redirect URI to add in Spotify | `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` |
|---|---|---|
| Local | `http://127.0.0.1:3000/callback` | `http://127.0.0.1:3000/callback` |
| GitHub Pages | `https://<user>.github.io/<repo>/callback` | set automatically by the workflow |

You can register both in the same Spotify app. The value must match **exactly** (scheme, host, port, path, no trailing slash).

If you accidentally open `http://localhost:3000`, Versio automatically hops to the redirect origin before logging in (PKCE state lives in per-origin storage).

## 3. Run locally

Requirements: Node.js 22+, Spotify Premium (Development Mode requirement), an OpenAI or DeepL key.

```bash
npm install
cp .env.example .env.local   # fill in Client ID + OpenAI key
npm run dev                  # site on http://127.0.0.1:3000, API on :8787
```

Open **http://127.0.0.1:3000** (not localhost), connect Spotify, play a song anywhere.

```bash
npm test             # parser, sync clock, PKCE, LRCLIB, providers, access control, API routing
npm run typecheck
npm run build        # static export → out/
```

## 4. Deploy — GitHub Pages + Supabase

The site is a static export on **GitHub Pages**; everything secret (OpenAI key, user management, rate limits, lyrics lookups) runs in a **Supabase Edge Function**. `.github/workflows/deploy.yml` deploys both on every push to `main`.

**a) Supabase** (free tier is fine)
1. Create a project at <https://supabase.com>.
2. SQL Editor → paste `supabase/schema.sql` → **Run**.
3. Note the **project ref** — the `xxxx` in `https://xxxx.supabase.co`.
4. Account → **Access Tokens** → generate one (lets GitHub deploy the function).

**b) GitHub repository**
1. Settings → **Pages** → Source: **GitHub Actions**.
   (Pages on a private repo needs GitHub Pro — otherwise make the repo public; no secrets are in the code.)
2. Settings → **Secrets and variables → Actions**:

| Type | Name | Value |
|---|---|---|
| Variable | `SPOTIFY_CLIENT_ID` | Spotify app → Settings → Client ID |
| Variable | `SUPABASE_PROJECT_REF` | e.g. `abcdxyz…` |
| Secret | `SUPABASE_ACCESS_TOKEN` | from step a4 |
| Secret | `OPENAI_API_KEY` | `sk-…` (or `DEEPL_API_KEY`) |
| Variable (optional) | `TRANSLATION_PROVIDER`, `OPENAI_MODEL`, `ADMIN_SPOTIFY_IDS` | |

3. Actions → **Deploy** → *Run workflow* (or just push).

**c) Spotify** — add `https://<user>.github.io/<repo>/callback` as Redirect URI (e.g. `https://timeo44.github.io/versio/callback`).

**d) Sign in first.** The first account that signs in becomes admin.

The site is then live at `https://<user>.github.io/<repo>/`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions by Supabase automatically; the workflow sets the rest as function secrets and restricts CORS to your GitHub Pages origin.

## 5. User management & rate limits

Settings → **User management** (admins only):
- **Invite** by email → one-time link (copy or send by email). Also add the same email in the Spotify Developer Dashboard → User Management — Spotify can't be automated, max. 5 users in Development Mode.
- People who sign in without an invite appear under **Waiting for approval**.
- Block, remove, promote to admin, per-user limits.
- **Default rate limits**: translated lines and explanations per hour / per day. Cached translations are free; admins are unlimited.

Every API call verifies the caller's Spotify token with Spotify (`GET /v1/me`) and checks the user's status. Quotas are enforced atomically in Postgres (`consume_quota`). All tables have RLS on with no public policies — only the function's service role can touch them.

Without Supabase (local dev), anyone who can log in with Spotify gets full access and there are no limits.

## 6. OpenAI credits

OpenAI has no API for your remaining prepaid balance. Versio works around it: in **User management → OpenAI credits** you enter the balance shown on your OpenAI billing page once, and Versio subtracts the real spend since then (organization Costs API).

1. platform.openai.com → **Admin keys** → create one (read-only is enough).
2. Supabase → Edge Functions → **Secrets** → add `OPENAI_ADMIN_KEY`.
3. In Versio: User management → OpenAI credits → **Enter balance**. Update it whenever you top up.

Shows estimated balance left, spend today and this month (refreshed every 5 min).

## 7. Pronunciation

Settings → Lyrics display → **Show pronunciation** adds a Latin-script transliteration under non-Latin lines (Arabic, Japanese, Korean, Chinese, Cyrillic, Greek, Hindi …). Generated with OpenAI (`OPENAI_ROMANIZE_MODEL`, default `gpt-4.1-mini`; set `gpt-4.1` for even better Arabic) with the full song as context. For Arabic it first identifies the dialect (Levantine, Egyptian, Gulf, …) and transliterates how it's actually sung: all vowels written, long vowels doubled, sun-letter assimilation, no Arabizi digits. Cached, counted as translated lines.

## 8. Install on your phone

Open the site in Safari → Share → **Add to Home Screen** (Android/Chrome: menu → Install app).

## Lyrics (LRCLIB)

No key needed. Lookup: exact signature match (track, artist, album, duration) → search with cleaned title, candidates within 3 s of Spotify's duration, synced preferred → plain lyrics clearly marked "Unsynced" → "No lyrics found". Spotify's Web API does **not** provide lyrics; Versio never assumes it does.

## Translation

**OpenAI (recommended)** — lines plus the full song as context, idiomatic rather than literal, one output per input line (validated, retried once). Also powers line explanations and pronunciation.
**DeepL** — `/v2/translate` with the song as `context`; free keys (`…:fx`) use `api-free.deepl.com`. No explanations.

Unique lines only (choruses once) → the chunk at the current line first → the rest in parallel. Song or language changes abort in-flight requests.

## Architecture

```
app/                 static pages (page.tsx, callback/) — exported to out/
components/, hooks/  UI
lib/
  spotify/           PKCE, token refresh (single-flight), API client (401 retry, 429 Retry-After)
  playback/          playback clock + jitter smoothing
  lyrics/            LRC parser, active-line search, chunking
  server/            the API — framework-free, runs on Deno and Node
    handler.ts       routing, CORS
    access.ts        auth, invites, roles, quotas
    lrclib.ts · translate.ts · supabase.ts · cache.ts · env.ts
supabase/
  schema.sql                 tables, RLS, consume_quota()
  functions-src/versio-api   edge function entry → bundled by scripts/build-function.mjs
scripts/dev-api.ts           same handler as a local Node server
.github/workflows/deploy.yml tests → edge function → GitHub Pages
```

**Synchronisation.** Spotify only reports the position when polled (every 1.5 s while playing, 3 s paused, 5 s idle, 10 s in a background tab). Versio anchors each sample to the request's midpoint on `performance.now()` and extrapolates between polls; a `requestAnimationFrame` loop picks the active line with a binary search and re-renders only when it changes. New samples that agree with the extrapolation within 350 ms are ignored to avoid jitter; seeks and pauses reset the anchor immediately. A poll is also scheduled right when the song should end, so the next track appears without delay. The settings panel has a ± timing offset for audio-latency setups.

**Error handling.** Not connected · nothing playing · ads / podcasts / private sessions · lyrics not found · lyrics without timestamps · translation provider down / rate-limited (original lyrics stay visible, retry button) · token expiry (silent refresh, reconnect screen if the refresh token is revoked) · Spotify 429 (honours `Retry-After`, clock keeps running) · song changes mid-translation (aborted, stale results dropped) · offline.

## Legal

Lyrics come from LRCLIB and remain the property of their rights holders. This project displays them for personal, non-commercial use and does not store or redistribute them beyond short-lived caches. Respect the [Spotify Developer Terms](https://developer.spotify.com/terms) — in particular, Development Mode apps are meant for personal use and small test groups.

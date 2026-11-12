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

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4.

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
| Production | `https://your-domain.com/callback` | `https://your-domain.com/callback` |

You can register both in the same Spotify app. The value must match **exactly** (scheme, host, port, path, no trailing slash).

If you accidentally open `http://localhost:3000`, Versio automatically hops to the redirect origin before logging in (PKCE state lives in per-origin storage).

## 3. Credentials

```bash
cp .env.example .env.local
```

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | yes | Spotify dashboard → your app → Settings |
| `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` | yes | See table above |
| `OPENAI_API_KEY` | one of OpenAI / DeepL | <https://platform.openai.com/api-keys> |
| `OPENAI_MODEL` | no (default `gpt-4.1-mini`) | Any chat model with JSON mode. Small/fast models keep latency low. |
| `DEEPL_API_KEY` | one of OpenAI / DeepL | <https://www.deepl.com/your-account/keys> |
| `TRANSLATION_PROVIDER` | no | `openai` or `deepl` (auto-detected otherwise) |
| `LRCLIB_USER_AGENT` | recommended | Identify your app, e.g. `Versio/1.0 (https://github.com/you/versio)` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | no | Supabase → Project Settings → API |

Secrets (`OPENAI_API_KEY`, `DEEPL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are only read in server route handlers and are never shipped to the browser. Only `NEXT_PUBLIC_*` values (Client ID + redirect URI, both public by design) reach the client.

## 4. Lyrics provider (LRCLIB)

No key needed. Versio queries LRCLIB server-side (`/api/lyrics`):

1. **Exact match** — track, primary artist, album, duration (LRCLIB requires ±2 s)
2. **Search** — cleaned title (strips "– Remastered 2011", "(feat. …)") + artist; candidates must be within **3 s** of Spotify's duration; synced lyrics preferred, closest duration wins
3. **Fallback** — plain lyrics, shown with an "Unsynced lyrics" banner and no line highlighting
4. Nothing found → message with a link to contribute at lrclib.net

Results are cached for 6 h per server instance. To use a self-hosted LRCLIB mirror, set `LRCLIB_BASE_URL`.

Spotify's Web API does **not** provide lyrics; Versio never assumes it does.

## 5. Translation

**OpenAI (recommended).** Each request sends the lines to translate plus the full song for context, with instructions to keep one output per input line and translate idiomatically. Responses are validated (line count) and retried once. Also powers the line breakdown panel.

**DeepL.** Uses `/v2/translate` with the song title + lyrics as `context` (not billed). Free keys (`…:fx`) automatically use `api-free.deepl.com`. Languages DeepL can't target are hidden from the picker. Line explanations still need an OpenAI key.

Strategy: unique lines only (choruses are translated once) → the chunk starting at the current line is sent first → the rest in parallel (3 at a time). If the song or language changes mid-flight, requests are aborted and late responses discarded. If the source language equals the target language, translation is skipped.

## 6. Run locally

Requirements: Node.js 20+ and a Spotify Premium account (Development Mode requirement).

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://127.0.0.1:3000
```

Open **http://127.0.0.1:3000** (not localhost), connect Spotify, play a song anywhere (phone, desktop, speaker).

```bash
npm test          # LRC parser, sync clock, PKCE, LRCLIB lookup + translation providers (mocked network)
npm run typecheck
npm run build
```

### Optional: Supabase vocabulary sync

1. Create a Supabase project.
2. SQL Editor → run `supabase/schema.sql`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The browser sends its Spotify token to `/api/vocabulary`; the server verifies it with Spotify (`GET /v1/me`) and scopes all rows to that Spotify user id. RLS is enabled with no public policies, so only the server can read or write.

## 7. Deploy

Any host that runs Next.js route handlers works.

**Vercel**
1. Push the repo to GitHub → <https://vercel.com/new> → import.
2. Add the environment variables (production redirect URI!).
3. Deploy, then add `https://<your-domain>/callback` to the Spotify app's Redirect URIs.

**Netlify**
1. New site from Git → build command `npm run build` (Next.js runtime is detected automatically).
2. Site settings → Environment variables → add the same variables.
3. Add `https://<your-site>.netlify.app/callback` in Spotify.

Note: the server-side caches are in-memory per instance. On serverless platforms they're best-effort; the browser cache still prevents repeated translations for songs you've already heard.

---

## Architecture

```
app/
  page.tsx, callback/page.tsx     UI entry + OAuth callback
  api/lyrics      LRCLIB lookup        (server)
  api/translate   OpenAI / DeepL       (server, secrets)
  api/explain     line breakdown       (server, OpenAI)
  api/vocabulary  Supabase sync        (server, optional)
  api/config      which features are configured (no secrets)
lib/
  spotify/   pkce.ts · auth.ts (PKCE, token refresh, single-flight) · api.ts (401 retry, 429 Retry-After)
  playback/  position.ts — playback clock + jitter smoothing
  lyrics/    lrc.ts — LRC parser, active-line search, chunking
  server/    lrclib.ts · translate.ts · supabase.ts · cache.ts
hooks/       usePlayback (polling) · useClock (rAF line sync) · useLyrics · useTranslations · useVocabulary · …
components/  App · NowPlaying · LyricsView · ExplanationPanel · VocabularyPanel · SettingsPanel · …
```

**Synchronisation.** Spotify only reports the position when polled (every 1.5 s while playing, 3 s paused, 5 s idle, 10 s in a background tab). Versio anchors each sample to the request's midpoint on `performance.now()` and extrapolates between polls; a `requestAnimationFrame` loop picks the active line with a binary search and re-renders only when it changes. New samples that agree with the extrapolation within 350 ms are ignored to avoid jitter; seeks and pauses reset the anchor immediately. A poll is also scheduled right when the song should end, so the next track appears without delay. The settings panel has a ± timing offset for audio-latency setups.

**Error handling.** Not connected · nothing playing · ads / podcasts / private sessions · lyrics not found · lyrics without timestamps · translation provider down / rate-limited (original lyrics stay visible, retry button) · token expiry (silent refresh, reconnect screen if the refresh token is revoked) · Spotify 429 (honours `Retry-After`, clock keeps running) · song changes mid-translation (aborted, stale results dropped) · offline.

## Legal

Lyrics come from LRCLIB and remain the property of their rights holders. This project displays them for personal, non-commercial use and does not store or redistribute them beyond short-lived caches. Respect the [Spotify Developer Terms](https://developer.spotify.com/terms) — in particular, Development Mode apps are meant for personal use and small test groups.

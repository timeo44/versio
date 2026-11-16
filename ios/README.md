# Versio for iPhone (SwiftUI)

Native iOS app for Versio. It talks to Spotify directly (PKCE login, playback polling) and uses the same Supabase backend as the web app for lyrics, translation, pronunciation, explanations, user management and rate limits.

Requirements: Mac with **Xcode 16+**, iPhone on iOS 17+. Spotify Premium (Development Mode).

## 1. Client ID
Open `Versio/App/Config.swift` and set `spotifyClientID` to your Spotify app's Client ID (same as the web app's `SPOTIFY_CLIENT_ID`). It's public by design — no secret.

No new Redirect URI is needed: the app reuses `https://timeo44.github.io/versio/callback`; that page hands logins started by the app (state `ios.…`) back via `versio://`.

## 2. Run on your iPhone (free)
1. Open `ios/Versio.xcodeproj` in Xcode.
2. Target **Versio** → *Signing & Capabilities* → Team: your Apple ID (Personal Team). If the bundle id `ch.timeo.versio` is taken, change it.
3. Plug in the iPhone, select it, press **Run** (⌘R).
4. First time: iPhone → Settings → General → VPN & Device Management → trust your developer certificate.

With a free Personal Team the app has to be re-installed every 7 days. With the Apple Developer Program (99 $/year) it lasts a year and you can share it with friends via **TestFlight**.

Sessions from the first version lack the playback-control permission — the app shows a one-tap "Reconnect Spotify" banner.

## 3. Friends
Spotify Development Mode allows 5 users in total. For each friend:
1. Add their Spotify email in the Spotify Developer Dashboard → User Management.
2. Invite them in the web app (Settings → User management) and have them open the invite link once in Safari, connecting Spotify there — that activates their account for the app too.

## What's in the app
- Spotify login (PKCE, tokens in the Keychain), playback polling with a smooth clock
- Mini player: tap the now-playing card for previous / play-pause / next and a seek bar (Spotify Premium)
- Tap a lyric line to jump there, long-press it for the explanation
- Synced lyrics, three focus levels, auto-scroll with "Follow live"; screen stays on while playing
- Timing offset saved per Spotify device; calibrate by tapping a line or by listening through the mic
- Translation into 30+ languages (cached on the device), Both / Original / Translation
- Pronunciation for non-Latin scripts, timing offset
- Tap a line → explanation (literal, natural, slang, culture, vocabulary)
- User management, credits and vocabulary: linked to the web app

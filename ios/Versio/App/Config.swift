import Foundation

/// Everything here is public by design: the Spotify Client ID is meant to be
/// shipped in apps (PKCE, no client secret), and the API URL is protected by
/// each user's Spotify login.
enum Config {
    /// Spotify Dashboard → your app → Settings → Client ID
    static let spotifyClientID = "PASTE_YOUR_SPOTIFY_CLIENT_ID"

    /// Reuses the redirect URI already registered for the web app. The web
    /// callback page forwards logins started by the iOS app to versio://
    static let redirectURI = "https://timeo44.github.io/versio/callback"
    static let callbackScheme = "versio"

    static let scopes = "user-read-currently-playing user-read-playback-state"

    /// Supabase Edge Function shared with the web app
    static let apiBase = URL(string: "https://jwzrbfpobjuapxntztxs.supabase.co/functions/v1/versio-api")!

    /// Web app — user management, invites and vocabulary live there
    static let webApp = URL(string: "https://timeo44.github.io/versio/")!

    static var isConfigured: Bool { !spotifyClientID.hasPrefix("PASTE_") }
}

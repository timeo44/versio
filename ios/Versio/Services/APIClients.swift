import Foundation

enum APIError: LocalizedError {
    case http(status: Int, code: String?, message: String)
    case spotifyNotRegistered
    case rateLimited(seconds: Double)

    var errorDescription: String? {
        switch self {
        case .http(_, _, let m): return m
        case .spotifyNotRegistered:
            return "Spotify refused access for this account. The app owner must add your Spotify email under User Management in the Spotify Developer Dashboard."
        case .rateLimited(let s): return "Spotify is rate-limiting. Retrying in \(Int(s)) s."
        }
    }

    var status: Int? { if case .http(let s, _, _) = self { return s }; return nil }
    var code: String? { if case .http(_, let c, _) = self { return c }; return nil }
}

private let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    return d
}()

// MARK: Spotify Web API

enum SpotifyAPI {
    /// nil = nothing playing / no active device (HTTP 204)
    static func playbackState() async throws -> PlaybackState? {
        for attempt in 0..<2 {
            let token = try await SpotifyAuth.shared.accessToken(forceRefresh: attempt > 0)
            var req = URLRequest(url: URL(string: "https://api.spotify.com/v1/me/player?additional_types=track")!)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.cachePolicy = .reloadIgnoringLocalCacheData
            req.timeoutInterval = 10
            let (data, resp) = try await URLSession.shared.data(for: req)
            let http = resp as? HTTPURLResponse
            switch http?.statusCode ?? 0 {
            case 204: return nil
            case 200: return data.isEmpty ? nil : try decoder.decode(PlaybackState.self, from: data)
            case 401: if attempt == 0 { continue } else { throw AuthError.expired }
            case 403: throw APIError.spotifyNotRegistered
            case 429:
                let after = Double(http?.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 5
                throw APIError.rateLimited(seconds: max(1, after))
            case let s: throw APIError.http(status: s, code: nil, message: "Spotify error \(s)")
            }
        }
        return nil
    }
}

// MARK: Versio backend (Supabase Edge Function, shared with the web app)

enum VersioAPI {
    private struct ErrorBody: Decodable {
        let error: String?
        let code: String?
    }

    private static func request<T: Decodable>(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: [String: Any]? = nil) async throws -> T {
        var c = URLComponents(url: Config.apiBase.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        var req = URLRequest(url: c.url!)
        req.httpMethod = method
        req.timeoutInterval = 45
        req.setValue("Bearer \(try await SpotifyAuth.shared.accessToken())", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let e = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError.http(status: status, code: e?.code, message: e?.error ?? "Request failed (\(status))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func config() async throws -> AppConfig { try await request("config") }

    static func me() async throws -> AccessInfo { try await request("me") }

    static func redeemInvite(_ code: String) async throws -> AccessInfo {
        try await request("me", method: "POST", body: ["invite": code])
    }

    static func lyrics(for t: SpotifyTrack) async throws -> LyricsResult {
        try await request("lyrics", query: [
            .init(name: "track", value: t.name),
            .init(name: "artist", value: t.artists.first?.name ?? ""),
            .init(name: "album", value: t.album.name),
            .init(name: "duration", value: String(t.durationMs)),
        ])
    }

    static func translate(_ lines: [String], target: String, title: String, artist: String, lyrics: String) async throws -> TranslateResponse {
        try await request("translate", method: "POST", body: [
            "lines": lines, "target": target,
            "context": ["title": title, "artist": artist, "lyrics": lyrics],
        ])
    }

    static func romanize(_ lines: [String], title: String, artist: String, lyrics: String) async throws -> RomanizeResponse {
        try await request("romanize", method: "POST", body: [
            "lines": lines, "context": ["title": title, "artist": artist, "lyrics": lyrics],
        ])
    }

    static func explain(line: String, translation: String?, previous: String?, next: String?, target: String, title: String, artist: String) async throws -> Explanation {
        var body: [String: Any] = ["line": line, "target": target, "title": title, "artist": artist]
        if let translation { body["translation"] = translation }
        if let previous { body["previous"] = previous }
        if let next { body["next"] = next }
        return try await request("explain", method: "POST", body: body)
    }
}

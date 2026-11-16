import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct SpotifyTokens: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
}

enum AuthError: LocalizedError {
    case notConfigured, cancelled, denied, stateMismatch, expired, server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set your Spotify Client ID in Config.swift."
        case .cancelled: return "Login was cancelled."
        case .denied: return "Spotify access was denied."
        case .stateMismatch: return "Login session mismatch. Please try again."
        case .expired: return "Your Spotify session expired. Please reconnect."
        case .server(let m): return m
        }
    }
}

/// Spotify Authorization Code flow with PKCE. Tokens live in the Keychain.
@Observable
final class SpotifyAuth {
    static let shared = SpotifyAuth()

    private(set) var tokens: SpotifyTokens?
    var isLoggedIn: Bool { tokens != nil }

    @ObservationIgnored private var refreshTask: Task<SpotifyTokens, Error>?
    @ObservationIgnored private var session: ASWebAuthenticationSession?
    @ObservationIgnored private let anchor = AuthAnchor()

    private init() {
        tokens = Keychain.load(SpotifyTokens.self, for: "spotify.tokens")
    }

    private func store(_ t: SpotifyTokens?) {
        tokens = t
        Keychain.save(t, for: "spotify.tokens")
    }

    func logout() { store(nil) }

    // MARK: Login

    @MainActor
    func login() async throws {
        guard Config.isConfigured else { throw AuthError.notConfigured }
        let verifier = PKCE.randomString(64)
        let state = "ios." + PKCE.randomString(20)

        var c = URLComponents(string: "https://accounts.spotify.com/authorize")!
        c.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: Config.spotifyClientID),
            .init(name: "scope", value: Config.scopes),
            .init(name: "redirect_uri", value: Config.redirectURI),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "code_challenge", value: PKCE.challenge(for: verifier)),
            .init(name: "state", value: state),
        ]
        guard let url = c.url else { throw AuthError.server("Invalid login URL") }

        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: Config.callbackScheme) { url, error in
                if let url { cont.resume(returning: url) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { cont.resume(throwing: AuthError.cancelled) }
                else { cont.resume(throwing: error ?? AuthError.cancelled) }
            }
            s.presentationContextProvider = anchor
            s.prefersEphemeralWebBrowserSession = false
            session = s
            s.start()
        }
        session = nil

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ n: String) -> String? { items.first { $0.name == n }?.value }
        if q("error") != nil { throw AuthError.denied }
        guard q("state") == state else { throw AuthError.stateMismatch }
        guard let code = q("code") else { throw AuthError.server("Missing authorization code") }

        let t = try await tokenRequest([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": Config.redirectURI,
            "code_verifier": verifier,
        ], previousRefresh: nil)
        store(t)
    }

    // MARK: Tokens

    /// A valid access token, refreshed ~60 s before expiry (single-flight).
    func accessToken(forceRefresh: Bool = false) async throws -> String {
        guard let t = tokens else { throw AuthError.expired }
        if !forceRefresh, t.expiresAt.timeIntervalSinceNow > 60 { return t.accessToken }
        if let running = refreshTask { return try await running.value.accessToken }
        let task = Task { () throws -> SpotifyTokens in
            try await self.tokenRequest(["grant_type": "refresh_token", "refresh_token": t.refreshToken], previousRefresh: t.refreshToken)
        }
        refreshTask = task
        defer { refreshTask = nil }
        do {
            let fresh = try await task.value
            await MainActor.run { self.store(fresh) }
            return fresh.accessToken
        } catch AuthError.expired {
            await MainActor.run { self.store(nil) }
            throw AuthError.expired
        }
    }

    private func tokenRequest(_ params: [String: String], previousRefresh: String?) async throws -> SpotifyTokens {
        var req = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var all = params
        all["client_id"] = Config.spotifyClientID
        req.httpBody = all
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .formValue) ?? $0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard status == 200, let access = json["access_token"] as? String else {
            let err = json["error"] as? String
            if status == 400, err == "invalid_grant" || err == "invalid_request" { throw AuthError.expired }
            throw AuthError.server((json["error_description"] as? String) ?? "Spotify token request failed (\(status))")
        }
        let refresh = (json["refresh_token"] as? String) ?? previousRefresh ?? ""
        let expires = (json["expires_in"] as? Double) ?? 3600
        return SpotifyTokens(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expires))
    }
}

/// Presents the login sheet on the key window.
final class AuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first ?? UIWindow()
        }
    }
}

enum PKCE {
    static func randomString(_ length: Int) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { chars[Int($0) % chars.count] })
    }

    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension CharacterSet {
    /// application/x-www-form-urlencoded safe characters
    static let formValue: CharacterSet = {
        var s = CharacterSet.alphanumerics
        s.insert(charactersIn: "-._~")
        return s
    }()
}

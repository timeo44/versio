import SwiftUI

struct RootView: View {
    @Environment(SpotifyAuth.self) private var auth

    var body: some View {
        ZStack {
            Color.ink.ignoresSafeArea()
            if auth.isLoggedIn {
                GateView()
            } else {
                ConnectView()
            }
        }
    }
}

extension Color {
    static let ink = Color(red: 9 / 255, green: 9 / 255, blue: 9 / 255)
    static let spotify = Color(red: 30 / 255, green: 215 / 255, blue: 96 / 255)
}

// MARK: Connect

struct ConnectView: View {
    @Environment(SpotifyAuth.self) private var auth
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            LogoMark(size: 40)
                .padding(.bottom, 28)
            Text("Understand every song")
                .font(.system(size: 34, weight: .bold))
                .multilineTextAlignment(.center)
            Text("while it plays.")
                .font(.system(size: 34, weight: .regular, design: .serif).italic())
                .foregroundStyle(.white.opacity(0.65))
            Text("Versio follows what you're playing on Spotify and shows time-synced lyrics with a natural translation — line by line.")
                .font(.system(size: 16))
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.top, 18)
                .padding(.horizontal, 12)
            Spacer()

            if !Config.isConfigured {
                Text("Set your Spotify Client ID in Config.swift.")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .padding(.bottom, 12)
            }
            Button {
                Task {
                    busy = true
                    error = nil
                    do { try await auth.login() } catch AuthError.cancelled {} catch { self.error = error.localizedDescription }
                    busy = false
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "music.note")
                    Text(busy ? "Opening Spotify…" : "Connect Spotify")
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Color.spotify, in: Capsule())
            }
            .disabled(busy || !Config.isConfigured)
            .buttonStyle(PressStyle())

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
            }
            Text("Read-only access to what's playing. Nothing else.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.35))
                .padding(.top, 14)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 24)
    }
}

// MARK: Access check

/// Asks the Versio backend whether this Spotify account may use the app.
struct GateView: View {
    @Environment(SpotifyAuth.self) private var auth
    @State private var access: AccessInfo?
    @State private var error: APIError?
    @State private var otherError: String?
    @State private var checking = false

    var body: some View {
        Group {
            if let access, access.status == "active" {
                PlayerView(isAdmin: access.role == "admin")
            } else if let access {
                message(
                    title: access.status == "blocked" ? "No access" : "Almost there",
                    body: access.status == "blocked"
                        ? "Your access to this Versio has been revoked."
                        : "You're signed in as \(access.displayName ?? access.spotifyId), but the owner still needs to approve you. Open your invite link once, or ask them to approve you in User management.")
            } else if let error {
                message(title: error.code == "spotify_not_registered" ? "Spotify hasn't unlocked you yet" : "Something went wrong", body: error.localizedDescription)
            } else if let otherError {
                message(title: "Something went wrong", body: otherError)
            } else {
                ProgressView().tint(.white)
            }
        }
        .task { await check() }
    }

    private func check() async {
        checking = true
        defer { checking = false }
        do {
            access = try await VersioAPI.me()
            error = nil
            otherError = nil
        } catch let e as APIError {
            if e.status == 401 { auth.logout(); return }
            error = e
        } catch AuthError.expired {
            auth.logout()
        } catch {
            otherError = error.localizedDescription
        }
    }

    private func message(title: String, body: String) -> some View {
        VStack(spacing: 14) {
            LogoMark(size: 40).padding(.bottom, 10)
            Text(title).font(.system(size: 26, weight: .bold))
            Text(body)
                .font(.system(size: 15))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button(checking ? "Checking…" : "Check again") { Task { await check() } }
                    .buttonStyle(PillStyle(primary: true))
                Button("Sign out") { auth.logout() }
                    .buttonStyle(PillStyle(primary: false))
            }
            .padding(.top, 14)
        }
        .padding(.horizontal, 32)
    }
}

// MARK: Shared bits

struct LogoMark: View {
    var size: CGFloat = 28
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28).fill(Color(white: 0.09))
            VStack(alignment: .leading, spacing: size * 0.13) {
                Capsule().fill(.white).frame(width: size * 0.5, height: size * 0.1)
                Capsule().fill(Color.spotify).frame(width: size * 0.31, height: size * 0.1)
            }
            .frame(width: size * 0.5, alignment: .leading)
        }
        .frame(width: size, height: size)
    }
}

/// Scales down slightly while pressed — no sticky highlight.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct PillStyle: ButtonStyle {
    var primary: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(primary ? .black : .white)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(primary ? Color.white : Color.white.opacity(0.08), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(primary ? 0 : 0.12)))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
